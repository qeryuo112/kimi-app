import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import {
  dailyTodos,
  reviewSchedules,
  plans,
  userSettings,
  studyLogs,
  studyStats,
  knowledgeNodes,
  skillDimensions,
  subjects,
  questions,
  wrongAnswers,
} from "@db/schema";
import { eq, and, or, lte, lt, desc, inArray } from "drizzle-orm";
import { generateTodoTestQuestions, generateTodoTestFromFiles, evaluateTodoTestAnswers } from "./lib/ai";

// 根据掌握度计算下一次复习间隔（间隔重复算法）
function calculateNextInterval(currentInterval: number, mastery: number): number {
  if (mastery >= 90) return Math.min(currentInterval * 3, 60); // 掌握很好，3倍间隔，最长60天
  if (mastery >= 70) return Math.min(currentInterval * 2, 30); // 掌握较好，2倍间隔
  if (mastery >= 50) return Math.max(Math.round(currentInterval * 1.5), 2); // 一般，1.5倍
  return 1; // 掌握差，隔天复习
}

export const todoRouter = createRouter({
  // 为指定计划生成今日任务（从dailyPlan中解析）
  generateTodayTodos: authedQuery
    .input(z.object({ planId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const today = new Date().toISOString().split("T")[0];

      // 检查今天是否已生成过
      const existing = await db
        .select()
        .from(dailyTodos)
        .where(
          and(
            eq(dailyTodos.userId, ctx.user.id),
            eq(dailyTodos.planId, input.planId),
            eq(dailyTodos.date, today)
          )
        );

      if (existing.length > 0) {
        return { generated: false, message: "今日任务已生成", count: existing.length };
      }

      // 获取计划
      const [plan] = await db
        .select()
        .from(plans)
        .where(and(eq(plans.id, input.planId), eq(plans.userId, ctx.user.id)));

      if (!plan || !plan.aiPlan) {
        throw new Error("计划不存在或未生成复习计划");
      }

      let dailyPlan: any[] = [];
      try {
        const parsed = JSON.parse(plan.aiPlan);
        dailyPlan = parsed.dailyPlan || [];
      } catch {
        throw new Error("计划数据格式错误");
      }

      if (dailyPlan.length === 0) {
        throw new Error("计划中没有日计划数据");
      }

      // 计算今天是第几天（从开始日期算起）
      const startDate = plan.startDate
        ? new Date(plan.startDate).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0];

      const start = new Date(startDate);
      const todayDate = new Date(today);
      const dayDiff = Math.floor((todayDate.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      const todayDayIndex = dayDiff + 1;

      // 找到今天的计划项
      const todayItems = dailyPlan.filter((d: any) => d.day === todayDayIndex);

      // 同时查找复习调度中今天需要复习的内容
      const todayReviews = await db
        .select()
        .from(reviewSchedules)
        .where(
          and(
            eq(reviewSchedules.userId, ctx.user.id),
            eq(reviewSchedules.planId, input.planId),
            eq(reviewSchedules.nextReviewDate, today),
            eq(reviewSchedules.status, "active")
          )
        );

      const created = [];

      // 插入今日新学任务
      for (const item of todayItems) {
        const [{ id }] = await db
          .insert(dailyTodos)
          .values({
            userId: ctx.user.id,
            planId: input.planId,
            date: today,
            dayIndex: item.day,
            subject: item.subject || "",
            knowledgeNodes: JSON.stringify(item.knowledgeNodes || []),
            estimatedMinutes: item.estimatedMinutes || plan.dailyMinutes,
            focus: item.focus || "",
            status: "pending",
          })
          .$returningId();
        created.push(id);

      }

      // 插入今日复习任务（作为todo）
      for (const rev of todayReviews) {
        const [{ id }] = await db
          .insert(dailyTodos)
          .values({
            userId: ctx.user.id,
            planId: input.planId,
            date: today,
            dayIndex: 0, // 复习任务标记为0
            subject: rev.subjectTitle,
            knowledgeNodes: JSON.stringify([rev.nodeTitle]),
            estimatedMinutes: 30,
            focus: `复习：${rev.nodeTitle}（第${rev.reviewCount + 1}次复习）`,
            status: "pending",
          })
          .$returningId();
        created.push(id);
      }

      return { generated: true, count: created.length };
    }),

  // 获取今日任务（所有计划汇总）
  // 包含今天的所有任务 + 历史日期未完成的 pending 任务（自动顺延）
  getToday: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const today = new Date().toISOString().split("T")[0];

    const todos = await db
      .select()
      .from(dailyTodos)
      .where(
        and(
          eq(dailyTodos.userId, ctx.user.id),
          or(
            eq(dailyTodos.date, today),
            and(lt(dailyTodos.date, today), eq(dailyTodos.status, "pending"))
          )
        )
      )
      .orderBy(dailyTodos.status);

    const completedCount = todos.filter((t) => t.status === "completed").length;
    const totalCount = todos.length;
    const totalMinutes = todos.reduce((sum, t) => sum + (t.estimatedMinutes || 0), 0);
    const completedMinutes = todos
      .filter((t) => t.status === "completed")
      .reduce((sum, t) => sum + (t.actualMinutes || t.estimatedMinutes || 0), 0);

    return {
      todos,
      summary: {
        totalCount,
        completedCount,
        pendingCount: totalCount - completedCount,
        totalMinutes,
        completedMinutes,
        progress: totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0,
      },
    };
  }),

  // 获取复习任务列表
  getReviews: authedQuery
    .input(
      z
        .object({
          planId: z.number().optional(),
          date: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const targetDate = input?.date || new Date().toISOString().split("T")[0];

      const conditions = [
        eq(reviewSchedules.userId, ctx.user.id),
        lte(reviewSchedules.nextReviewDate, targetDate),
        eq(reviewSchedules.status, "active"),
      ];

      if (input?.planId) {
        conditions.push(eq(reviewSchedules.planId, input.planId));
      }

      return db
        .select()
        .from(reviewSchedules)
        .where(and(...conditions))
        .orderBy(reviewSchedules.nextReviewDate);
    }),

  // 生成测试题（AI考官出题，数量和题型由AI自主决定）
  generateTest: authedQuery
    .input(
      z.object({
        id: z.number(),
        questionType: z.enum(["single_choice", "multiple_choice", "fill_blank", "short_answer", "essay", "mixed"]).default("mixed"),
        count: z.number().min(1).max(100).default(5),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();

      const [todo] = await db
        .select()
        .from(dailyTodos)
        .where(and(eq(dailyTodos.id, input.id), eq(dailyTodos.userId, ctx.user.id)));

      if (!todo) throw new Error("任务不存在");

      const nodes = (() => {
        try {
          return JSON.parse(todo.knowledgeNodes || "[]");
        } catch {
          return [];
        }
      })();

      // nodes 是字符串数组（知识点标题）
      const nodeTitles: string[] = nodes.map((n: any) => typeof n === "string" ? n : n.title).filter(Boolean);

      if (nodeTitles.length === 0) throw new Error("该任务没有关联知识点，无法生成测试题");

      // 获取知识点详情用于映射（通过标题查找）
      const nodeDetails = nodeTitles.length > 0
        ? await db
            .select()
            .from(knowledgeNodes)
            .where(and(
              eq(knowledgeNodes.userId, ctx.user.id),
              // 使用标题匹配而不是ID匹配
              inArray(knowledgeNodes.title, nodeTitles)
            ))
        : [];
      const nodeMap = new Map(nodeDetails.map((n) => [n.title, n]));
      const nodeIds = nodeDetails.map((n) => n.id);

      const [setting] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, ctx.user.id));

      // 获取用户的错题记录
      const userWrongAnswers = await db
        .select()
        .from(wrongAnswers)
        .where(
          and(
            eq(wrongAnswers.userId, ctx.user.id),
            eq(wrongAnswers.mastered, false)
          )
        );

      // 获取学科的subjectId（宽松匹配）
      let subjectId: number | null = null;
      if (todo.subject) {
        const allSubjects = await db
          .select()
          .from(subjects)
          .where(eq(subjects.userId, ctx.user.id));

        // 使用宽松匹配
        const normalizedTodoSubject = todo.subject.trim().toLowerCase();
        const matchedSubject = allSubjects.find(s =>
          s.title.trim().toLowerCase() === normalizedTodoSubject ||
          s.title.trim().toLowerCase().includes(normalizedTodoSubject) ||
          normalizedTodoSubject.includes(s.title.trim().toLowerCase())
        );
        if (matchedSubject) {
          subjectId = matchedSubject.id;
        }
      }

      // 智能选题：先从题库中找相关题目（数据库层预过滤 + 内存精确评分）
      const allQuestions = await db
        .select()
        .from(questions)
        .where(eq(questions.userId, ctx.user.id));

      // 标准化任务学科名称
      const normalizedTodoSubject = todo.subject?.trim().toLowerCase() || "";

      // 根据学科和知识点匹配题目
      const matchedQuestions = allQuestions.filter((q) => {
        // 精确匹配 nodeId
        if (q.nodeId && nodeIds.includes(q.nodeId)) return true;
        // 匹配 subjectId
        if (subjectId && q.subjectId === subjectId) return true;
        // 匹配 detectedSubject（学科匹配）
        if (q.detectedSubject && todo.subject) {
          const normalizedQSubject = q.detectedSubject.trim().toLowerCase();
          if (normalizedQSubject === normalizedTodoSubject ||
              normalizedQSubject.includes(normalizedTodoSubject) ||
              normalizedTodoSubject.includes(normalizedQSubject)) {
            return true;
          }
        }
        // 匹配 detectedKnowledgePoint（知识点标题匹配）
        if (q.detectedKnowledgePoint) {
          const normalizedQKP = q.detectedKnowledgePoint.toLowerCase();
          const kpMatch = nodeTitles.some((title: string) =>
            title.toLowerCase().includes(normalizedQKP) ||
            normalizedQKP.includes(title.toLowerCase())
          );
          if (kpMatch) return true;
        }
        return false;
      });

      // 给题目打分并排序（统一评分权重）
      const scoredQuestions = matchedQuestions.map((q) => {
        let score = 0;

        // nodeId 精确匹配 +100 分（最高权重）
        if (q.nodeId && nodeIds.includes(q.nodeId)) score += 100;

        // subjectId 精确匹配 +50 分
        if (subjectId && q.subjectId === subjectId) score += 50;

        // 知识点文本匹配 +40 分
        if (q.detectedKnowledgePoint) {
          const normalizedQKP = q.detectedKnowledgePoint.toLowerCase();
          const kpMatch = nodeTitles.some((title: string) =>
            title.toLowerCase().includes(normalizedQKP) ||
            normalizedQKP.includes(title.toLowerCase())
          );
          if (kpMatch) score += 40;
        }

        // 学科文本匹配 +10 分
        if (q.detectedSubject && todo.subject) {
          const normalizedQSubject = q.detectedSubject.trim().toLowerCase();
          if (normalizedQSubject === normalizedTodoSubject ||
              normalizedQSubject.includes(normalizedTodoSubject) ||
              normalizedTodoSubject.includes(normalizedQSubject)) {
            score += 10;
          }
        }

        // 错题权重：如果是错题，大幅提高分数
        const isWrongAnswer = userWrongAnswers.some(wa =>
          wa.questionContent === q.content ||
          (wa.questionContent && q.content && wa.questionContent.includes(q.content.substring(0, 50)))
        );
        if (isWrongAnswer) score += 200;

        return { question: q, score };
      });

      // 按分数排序并随机打乱同分题目
      const sortedQuestions = scoredQuestions
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return Math.random() - 0.5;
        })
        .map(sq => sq.question);

      // 如果题库中有足够题目，直接使用
      if (sortedQuestions.length >= input.count) {
        const selected = sortedQuestions.slice(0, input.count);

        return {
          questions: selected.map((q) => ({
            id: `q-${q.id}`,
            content: q.content,
            options: q.options ? JSON.parse(q.options) : undefined,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation || "",
            knowledgePoint: q.detectedKnowledgePoint || "综合",
            questionType: q.questionType,
          })),
          source: "database",
        };
      }

      // 题库题目不够，调用 AI 生成
      const result = await generateTodoTestQuestions(
        todo.subject,
        nodes,
        input.questionType,
        input.count,
        setting?.aiApiKey || undefined,
        setting?.aiApiEndpoint || undefined,
        setting?.aiModel || undefined
      );

      // 将AI生成的题目保存到题库
      const savedQuestionIds: number[] = [];
      for (const q of result.questions) {
        const [{ id }] = await db
          .insert(questions)
          .values({
            userId: ctx.user.id,
            subjectId: todo.subjectId,
            questionType: q.questionType || input.questionType,
            content: q.content,
            options: q.options ? JSON.stringify(q.options) : null,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
            difficulty: 3,
            aiGenerated: true,
            detectedSubject: todo.subject,
            detectedKnowledgePoint: q.knowledgePoint,
          })
          .$returningId();
        savedQuestionIds.push(id);
      }

      return { ...result, source: "ai", savedQuestionIds };
    }),

  // 从文件生成测试题
  generateTestFromFiles: authedQuery
    .input(
      z.object({
        id: z.number(),
        urls: z.array(z.string().url()).min(1).max(5),
        questionType: z.enum(["single_choice", "multiple_choice", "fill_blank", "short_answer", "essay", "mixed"]).default("mixed"),
        count: z.number().min(1).max(100).default(5),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();

      const [todo] = await db
        .select()
        .from(dailyTodos)
        .where(and(eq(dailyTodos.id, input.id), eq(dailyTodos.userId, ctx.user.id)));

      if (!todo) throw new Error("任务不存在");

      const nodes = (() => {
        try {
          return JSON.parse(todo.knowledgeNodes || "[]");
        } catch {
          return [];
        }
      })();

      const [setting] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, ctx.user.id));

      const result = await generateTodoTestFromFiles(
        input.urls,
        todo.subject,
        nodes,
        input.questionType,
        input.count,
        setting?.aiApiKey || undefined,
        setting?.aiApiEndpoint || undefined,
        setting?.aiModel || undefined
      );

      // 将AI生成的题目保存到题库
      const savedQuestionIds: number[] = [];
      for (const q of result.questions) {
        const [{ id }] = await db
          .insert(questions)
          .values({
            userId: ctx.user.id,
            subjectId: todo.subjectId,
            questionType: q.questionType || input.questionType,
            content: q.content,
            options: q.options ? JSON.stringify(q.options) : null,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
            difficulty: 3,
            aiGenerated: true,
            detectedSubject: todo.subject,
            detectedKnowledgePoint: q.knowledgePoint,
          })
          .$returningId();
        savedQuestionIds.push(id);
      }

      return { ...result, source: "ai", savedQuestionIds };
    }),

  // 提交测试答案 + AI评估（完成todo，自动创建学习记录并更新掌握度）
  submitTest: authedQuery
    .input(
      z.object({
        id: z.number(),
        actualMinutes: z.number().min(1),
        questions: z.array(
          z.object({
            id: z.string(),
            content: z.string(),
            correctAnswer: z.string(),
            explanation: z.string(),
            knowledgePoint: z.string(),
            questionType: z.enum(["single_choice", "multiple_choice", "fill_blank", "short_answer", "essay", "mixed"]).optional(),
          })
        ),
        answers: z.array(
          z.object({
            questionId: z.string(),
            userAnswer: z.string(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const today = new Date().toISOString().split("T")[0];

      const [todo] = await db
        .select()
        .from(dailyTodos)
        .where(and(eq(dailyTodos.id, input.id), eq(dailyTodos.userId, ctx.user.id)));

      if (!todo) throw new Error("任务不存在");

      const [setting] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, ctx.user.id));

      const nodes = (() => {
        try {
          return JSON.parse(todo.knowledgeNodes || "[]");
        } catch {
          return [];
        }
      })();

      // 区分选择题和非选择题
      const choiceQuestions = input.questions.filter(q =>
        q.questionType === "single_choice" || q.questionType === "multiple_choice"
      );
      const otherQuestions = input.questions.filter(q =>
        q.questionType !== "single_choice" && q.questionType !== "multiple_choice"
      );

      // 选择题本地判断
      let correctCount = 0;
      const choiceAnswers: Array<{ questionId: string; userAnswer: string }> = [];

      for (const q of choiceQuestions) {
        const ans = input.answers.find(a => a.questionId === q.id);
        if (ans) {
          choiceAnswers.push(ans);
          // 本地判断：去除空格后对比
          let userAns = ans.userAnswer.trim().toUpperCase();
          let correctAns = q.correctAnswer.trim().toUpperCase();

          // 多选题：排序后比较（如 "BA" 和 "AB" 都算正确）
          if (q.questionType === "multiple_choice") {
            userAns = userAns.split("").sort().join("");
            correctAns = correctAns.split("").sort().join("");
          }

          if (userAns === correctAns) {
            correctCount++;
          }
        }
      }

      // 非选择题需要AI评估
      let aiEvaluation: any = null;
      if (otherQuestions.length > 0) {
        const otherAnswers = input.answers.filter(a =>
          otherQuestions.some(q => q.id === a.questionId)
        );
        aiEvaluation = await evaluateTodoTestAnswers(
          todo.subject,
          nodes,
          otherQuestions,
          otherAnswers,
          setting?.aiApiKey || undefined,
          setting?.aiApiEndpoint || undefined,
          setting?.aiModel || undefined
        );
      }

      // 计算总掌握度
      const totalQuestions = input.questions.length;
      let mastery = 0;
      let feedback = "";

      if (choiceQuestions.length > 0 && otherQuestions.length === 0) {
        // 全是选择题
        mastery = Math.round((correctCount / totalQuestions) * 100);
        feedback = `答对 ${correctCount}/${totalQuestions} 题，掌握度 ${mastery}%`;
      } else if (choiceQuestions.length === 0 && otherQuestions.length > 0) {
        // 全是非选择题，使用AI评估
        mastery = aiEvaluation?.mastery || 0;
        feedback = `AI评估掌握度 ${mastery}%`;
      } else {
        // 混合题型：选择题本地 + 非选择题AI
        const choiceWeight = choiceQuestions.length / totalQuestions;
        const otherWeight = otherQuestions.length / totalQuestions;
        const choiceMastery = Math.round((correctCount / choiceQuestions.length) * 100);
        const otherMastery = aiEvaluation?.mastery || 0;
        mastery = Math.round(choiceMastery * choiceWeight + otherMastery * otherWeight);
        feedback = `选择题 ${correctCount}/${choiceQuestions.length} 正确，AI评估主观题掌握度 ${otherMastery}%，综合掌握度 ${mastery}%`;
      }

      // 构建评估结果
      const evaluation = {
        mastery,
        correctCount: correctCount + (aiEvaluation?.correctCount || 0),
        totalCount: totalQuestions,
        feedback,
        suggestions: aiEvaluation?.suggestions || [],
        weakPoints: aiEvaluation?.weakPoints || [],
      };

      // ========== 在执行更新前，收集所有需要恢复的快照数据 ==========
      const snapshot: any = {
        knowledgeNodes: [],
        skills: [],
        subjects: [],
        studyStats: null,
        reviewSchedules: [],
      };

      // 收集知识节点旧掌握度
      for (const nodeTitle of nodes) {
        const matched = await db
          .select()
          .from(knowledgeNodes)
          .where(and(eq(knowledgeNodes.userId, ctx.user.id), eq(knowledgeNodes.title, nodeTitle)));
        for (const kn of matched) {
          snapshot.knowledgeNodes.push({ id: kn.id, mastery: kn.mastery });
        }
      }

      // 收集科目旧进度
      const planSubjects = await db
        .select()
        .from(subjects)
        .where(and(eq(subjects.userId, ctx.user.id), eq(subjects.title, todo.subject)));
      for (const sub of planSubjects) {
        snapshot.subjects.push({ id: sub.id, progress: sub.progress });
      }

      // 收集技能维度旧数据
      const subSkills = await db
        .select()
        .from(skillDimensions)
        .where(and(eq(skillDimensions.userId, ctx.user.id), eq(skillDimensions.subjectId, planSubjects[0]?.id || 0)));
      for (const skill of subSkills) {
        snapshot.skills.push({
          id: skill.id,
          currentLevel: skill.currentLevel,
          experience: skill.experience,
          experienceToNext: skill.experienceToNext,
        });
      }

      // 收集学习统计旧数据
      const existingStats = await db
        .select()
        .from(studyStats)
        .where(and(eq(studyStats.userId, ctx.user.id), eq(studyStats.statDate, today)));
      if (existingStats.length > 0) {
        const stat = existingStats[0];
        snapshot.studyStats = {
          id: stat.id,
          totalMinutes: stat.totalMinutes,
          sessionsCount: stat.sessionsCount,
          avgQuality: stat.avgQuality,
        };
      }

      // 收集复习调度旧数据
      for (const node of nodes) {
        const [rev] = await db
          .select()
          .from(reviewSchedules)
          .where(
            and(
              eq(reviewSchedules.userId, ctx.user.id),
              eq(reviewSchedules.planId, todo.planId),
              eq(reviewSchedules.nodeTitle, node)
            )
          );
        if (rev) {
          snapshot.reviewSchedules.push({
            id: rev.id,
            reviewCount: rev.reviewCount,
            intervalDays: rev.intervalDays,
            nextReviewDate: rev.nextReviewDate,
            mastery: rev.mastery,
            reviewDates: rev.reviewDates,
            status: rev.status,
          });
        }
      }

      // 1. 更新任务状态
      await db
        .update(dailyTodos)
        .set({
          status: "completed",
          completedAt: new Date(),
          actualMinutes: input.actualMinutes,
          aiEvaluation: feedback,
          aiMastery: mastery,
        })
        .where(eq(dailyTodos.id, input.id));

      // 2. 自动创建学习记录（根据测试结果AI生成学习笔记）
      const studyContent = `今日学习：${todo.subject}\n知识点：${nodes.join("、")}\n\nAI测试成绩：${evaluation.correctCount}/${evaluation.totalCount} 题\n掌握度：${mastery}%\n\n${evaluation.weakPoints?.length > 0 ? `薄弱点：${evaluation.weakPoints.join("、")}\n` : ""}${evaluation.suggestions?.length > 0 ? `建议：${evaluation.suggestions.join("；")}` : ""}`;

      const insertResult = await db.insert(studyLogs).values({
        userId: ctx.user.id,
        title: `${todo.subject} - ${todo.focus || "每日学习"}`,
        content: studyContent,
        duration: input.actualMinutes,
        quality: Math.max(1, Math.min(5, Math.round(mastery / 20))),
        mood: mastery >= 70 ? "good" : mastery >= 50 ? "normal" : "tired",
        date: new Date(),
        aiFeedback: evaluation.feedback,
        aiTestScore: mastery,
        tags: JSON.stringify(nodes),
      });
      snapshot.studyLogId = Number((insertResult as any)[0].insertId);

      // 3. 更新学习统计
      if (existingStats.length > 0) {
        const stat = existingStats[0];
        const currentAvg = stat.avgQuality || 0;
        await db
          .update(studyStats)
          .set({
            totalMinutes: stat.totalMinutes + input.actualMinutes,
            sessionsCount: stat.sessionsCount + 1,
            avgQuality:
              Math.round(
                ((currentAvg * stat.sessionsCount + Math.max(1, Math.min(5, Math.round(mastery / 20)))) /
                  (stat.sessionsCount + 1)) *
                  10
              ) / 10,
          })
          .where(eq(studyStats.id, stat.id));
      } else {
        await db.insert(studyStats).values({
          userId: ctx.user.id,
          statDate: today,
          totalMinutes: input.actualMinutes,
          sessionsCount: 1,
          avgQuality: Math.max(1, Math.min(5, Math.round(mastery / 20))),
          nodesStudied: nodes.length,
        });
      }

      // 4. 更新知识树节点掌握度
      for (const nodeTitle of nodes) {
        // 通过标题匹配知识节点（同一用户同一计划下）
        const matchedNodes = await db
          .select()
          .from(knowledgeNodes)
          .where(
            and(
              eq(knowledgeNodes.userId, ctx.user.id),
              eq(knowledgeNodes.title, nodeTitle)
            )
          );

        for (const kn of matchedNodes) {
          // 根据掌握度平滑更新（旧值权重0.7 + 新值权重0.3）
          const newMastery = Math.round(kn.mastery * 0.7 + mastery * 0.3);
          await db
            .update(knowledgeNodes)
            .set({ mastery: Math.min(100, newMastery) })
            .where(eq(knowledgeNodes.id, kn.id));
        }
      }

      // 5. 更新科目进度（基于知识节点平均掌握度）
      for (const sub of planSubjects) {
        const subNodes = await db
          .select()
          .from(knowledgeNodes)
          .where(
            and(
              eq(knowledgeNodes.userId, ctx.user.id),
              eq(knowledgeNodes.subjectId, sub.id)
            )
          );

        if (subNodes.length > 0) {
          const avgMastery = subNodes.reduce((sum, n) => sum + n.mastery, 0) / subNodes.length;
          await db
            .update(subjects)
            .set({ progress: Math.round(avgMastery) })
            .where(eq(subjects.id, sub.id));
        }
      }

      // 6. 更新技能维度（经验值系统）
      for (const skill of subSkills) {
        const expGain = Math.round((mastery / 100) * input.actualMinutes * skill.weight);
        const newExp = skill.experience + expGain;
        let newLevel = skill.currentLevel;
        let newExpToNext = skill.experienceToNext;
        let remainingExp = newExp;

        // 升级逻辑
        while (remainingExp >= newExpToNext && newLevel < skill.maxLevel) {
          remainingExp -= newExpToNext;
          newLevel += 1;
          newExpToNext = Math.round(newExpToNext * 1.2);
        }

        await db
          .update(skillDimensions)
          .set({
            currentLevel: newLevel,
            experience: remainingExp,
            experienceToNext: newExpToNext,
          })
          .where(eq(skillDimensions.id, skill.id));
      }

      // 7. 更新/创建复习调度（仅在任务完成后创建，未完成的任务不进入复习调度）
      for (const node of nodes) {
        const [rev] = await db
          .select()
          .from(reviewSchedules)
          .where(
            and(
              eq(reviewSchedules.userId, ctx.user.id),
              eq(reviewSchedules.planId, todo.planId),
              eq(reviewSchedules.nodeTitle, node)
            )
          );

        if (rev) {
          // 已有复习调度，更新
          const newInterval = calculateNextInterval(rev.intervalDays, mastery);
          const nextDate = new Date();
          nextDate.setDate(nextDate.getDate() + newInterval);

          const existingDates = (() => {
            try {
              return JSON.parse(rev.reviewDates || "[]");
            } catch {
              return [];
            }
          })();

          await db
            .update(reviewSchedules)
            .set({
              reviewCount: rev.reviewCount + 1,
              nextReviewDate: nextDate.toISOString().split("T")[0],
              intervalDays: newInterval,
              mastery: Math.max(rev.mastery, mastery),
              reviewDates: JSON.stringify([...existingDates, new Date().toISOString().split("T")[0]]),
              status: mastery >= 95 && rev.reviewCount >= 2 ? "mastered" : "active",
            })
            .where(eq(reviewSchedules.id, rev.id));
        } else {
          // 首次完成学习，创建复习调度
          const nextDate = new Date();
          nextDate.setDate(nextDate.getDate() + 1);
          await db.insert(reviewSchedules).values({
            userId: ctx.user.id,
            planId: todo.planId,
            nodeTitle: node,
            subjectTitle: todo.subject,
            originalStudyDate: today,
            reviewDates: JSON.stringify([today]),
            nextReviewDate: nextDate.toISOString().split("T")[0],
            intervalDays: 1,
            reviewCount: 1,
            mastery: mastery,
            status: "active",
          });
        }
      }

      // 9. 收集错题到错题本
      for (const q of input.questions) {
        const ans = input.answers.find(a => a.questionId === q.id);
        if (!ans) continue;

        const isChoice = q.questionType === "single_choice" || q.questionType === "multiple_choice";
        let isCorrect = false;

        if (isChoice) {
          let userAns = ans.userAnswer.trim().toUpperCase();
          let correctAns = q.correctAnswer.trim().toUpperCase();
          if (q.questionType === "multiple_choice") {
            userAns = userAns.split("").sort().join("");
            correctAns = correctAns.split("").sort().join("");
          }
          isCorrect = userAns === correctAns;
        } else {
          // 非选择题根据AI评估判断是否错误
          const questionEval = aiEvaluation?.details?.find((d: any) => d.questionId === q.id);
          isCorrect = questionEval?.isCorrect || false;
        }

        // 如果答错，收录到错题本
        if (!isCorrect) {
          // 查找是否已存在该题目的错题记录
          const existingWrong = await db
            .select()
            .from(wrongAnswers)
            .where(
              and(
                eq(wrongAnswers.userId, ctx.user.id),
                eq(wrongAnswers.questionContent, q.content)
              )
            )
            .limit(1);

          if (existingWrong.length > 0) {
            // 更新错题记录
            await db
              .update(wrongAnswers)
              .set({
                wrongCount: existingWrong[0].wrongCount + 1,
                lastWrongAt: new Date(),
                mastered: false,
              })
              .where(eq(wrongAnswers.id, existingWrong[0].id));
          } else {
            // 创建新错题记录
            await db
              .insert(wrongAnswers)
              .values({
                userId: ctx.user.id,
                questionContent: q.content,
                userAnswer: ans.userAnswer,
                wrongCount: 1,
                lastWrongAt: new Date(),
                mastered: false,
              });
          }
        }
      }

      // 10. 保存快照到任务（用于删除时回退）
      await db
        .update(dailyTodos)
        .set({ snapshot: JSON.stringify(snapshot) })
        .where(eq(dailyTodos.id, input.id));

      return {
        success: true,
        ...evaluation,
        feedback,
        nextReviewIn: calculateNextInterval(1, mastery),
      };
    }),

  // 删除任务（已完成任务会回退所有数据变更）
  delete: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [todo] = await db
        .select()
        .from(dailyTodos)
        .where(and(eq(dailyTodos.id, input.id), eq(dailyTodos.userId, ctx.user.id)));

      if (!todo) throw new Error("任务不存在");

      // 待完成/跳过的任务直接删除，无需回退数据
      if (todo.status !== "completed") {
        await db.delete(dailyTodos).where(eq(dailyTodos.id, input.id));
        return { success: true };
      }

      // 已完成的任务需要回退数据
      const snapshot = todo.snapshot ? JSON.parse(todo.snapshot) : null;
      if (!snapshot) throw new Error("无法恢复：缺少快照");

      // 1. 恢复知识节点掌握度
      for (const node of snapshot.knowledgeNodes || []) {
        await db
          .update(knowledgeNodes)
          .set({ mastery: node.mastery })
          .where(eq(knowledgeNodes.id, node.id));
      }

      // 2. 恢复技能维度
      for (const skill of snapshot.skills || []) {
        await db
          .update(skillDimensions)
          .set({
            currentLevel: skill.currentLevel,
            experience: skill.experience,
            experienceToNext: skill.experienceToNext,
          })
          .where(eq(skillDimensions.id, skill.id));
      }

      // 3. 恢复科目进度
      for (const sub of snapshot.subjects || []) {
        await db
          .update(subjects)
          .set({ progress: sub.progress })
          .where(eq(subjects.id, sub.id));
      }

      // 4. 删除学习记录并回退当日学习统计
      if (snapshot.studyLogId) {
        await db.delete(studyLogs).where(eq(studyLogs.id, snapshot.studyLogId));
      }

      const today = todo.date;
      const existingStats = await db
        .select()
        .from(studyStats)
        .where(and(eq(studyStats.userId, ctx.user.id), eq(studyStats.statDate, today)));

      if (existingStats.length > 0) {
        const stat = existingStats[0];
        const newSessionsCount = stat.sessionsCount - 1;
        const newTotalMinutes = Math.max(0, stat.totalMinutes - (todo.actualMinutes || 0));

        if (newSessionsCount <= 0 || newTotalMinutes <= 0) {
          await db.delete(studyStats).where(eq(studyStats.id, stat.id));
        } else {
          await db
            .update(studyStats)
            .set({
              totalMinutes: newTotalMinutes,
              sessionsCount: newSessionsCount,
            })
            .where(eq(studyStats.id, stat.id));
        }
      }

      // 5. 恢复复习调度
      for (const rev of snapshot.reviewSchedules || []) {
        await db
          .update(reviewSchedules)
          .set({
            reviewCount: rev.reviewCount,
            intervalDays: rev.intervalDays,
            nextReviewDate: rev.nextReviewDate,
            mastery: rev.mastery,
            reviewDates: rev.reviewDates,
            status: rev.status,
          })
          .where(eq(reviewSchedules.id, rev.id));
      }

      // 6. 删除任务
      await db.delete(dailyTodos).where(eq(dailyTodos.id, input.id));

      return { success: true };
    }),

  // 跳过任务
  skip: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await getDb()
        .update(dailyTodos)
        .set({ status: "skipped" })
        .where(and(eq(dailyTodos.id, input.id), eq(dailyTodos.userId, ctx.user.id)));
      return { success: true };
    }),

  // 获取历史任务
  list: authedQuery
    .input(
      z
        .object({
          date: z.string().optional(),
          planId: z.number().optional(),
          limit: z.number().default(30),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const conditions = [eq(dailyTodos.userId, ctx.user.id)];

      if (input?.date) conditions.push(eq(dailyTodos.date, input.date));
      if (input?.planId) conditions.push(eq(dailyTodos.planId, input.planId));

      return db
        .select()
        .from(dailyTodos)
        .where(and(...conditions))
        .orderBy(desc(dailyTodos.date))
        .limit(input?.limit || 30);
    }),

  // 生成复习任务测试题（AI考官）
  generateReviewTest: authedQuery
    .input(
      z.object({
        reviewId: z.number(),
        questionType: z.enum(["single_choice", "multiple_choice", "fill_blank", "short_answer", "essay", "mixed"]).default("mixed"),
        count: z.number().min(1).max(100).default(5),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();

      const [review] = await db
        .select()
        .from(reviewSchedules)
        .where(and(eq(reviewSchedules.id, input.reviewId), eq(reviewSchedules.userId, ctx.user.id)));

      if (!review) throw new Error("复习任务不存在");

      const [setting] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, ctx.user.id));

      // 根据复习次数和掌握度调整出题难度
      // 复习次数越多，题目越难；掌握度越低，题目越基础
      const _difficultyLevel = review.reviewCount >= 3 ? "hard" : review.reviewCount >= 1 ? "medium" : "mixed";
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      void _difficultyLevel;

      // 查找对应的subjectId和nodeId
      const subjectMatch = await db
        .select()
        .from(subjects)
        .where(
          and(
            eq(subjects.userId, ctx.user.id),
            eq(subjects.title, review.subjectTitle)
          )
        )
        .limit(1);
      const subjectId = subjectMatch.length > 0 ? subjectMatch[0].id : null;

      const nodeMatch = await db
        .select()
        .from(knowledgeNodes)
        .where(
          and(
            eq(knowledgeNodes.userId, ctx.user.id),
            eq(knowledgeNodes.title, review.nodeTitle)
          )
        )
        .limit(1);
      const nodeId = nodeMatch.length > 0 ? nodeMatch[0].id : null;

      // 获取用户的错题记录
      const userWrongAnswers = await db
        .select()
        .from(wrongAnswers)
        .where(
          and(
            eq(wrongAnswers.userId, ctx.user.id),
            eq(wrongAnswers.mastered, false)
          )
        );

      // 智能选题：先从题库中找相关题目
      const allQuestions = await db
        .select()
        .from(questions)
        .where(eq(questions.userId, ctx.user.id));

      // 根据学科和知识点精确匹配题目
      const matchedQuestions = allQuestions.filter((q) => {
        // 优先匹配nodeId（最精确）
        if (nodeId && q.nodeId === nodeId) return true;
        // 其次匹配subjectId
        if (subjectId && q.subjectId === subjectId) return true;
        // 匹配 detectedKnowledgePoint
        if (q.detectedKnowledgePoint) {
          const kpMatch = review.nodeTitle.toLowerCase().includes(q.detectedKnowledgePoint.toLowerCase()) ||
            q.detectedKnowledgePoint.toLowerCase().includes(review.nodeTitle.toLowerCase());
          if (kpMatch) return true;
        }
        // 匹配 detectedSubject
        if (q.detectedSubject) {
          const subMatch = review.subjectTitle.toLowerCase().includes(q.detectedSubject.toLowerCase()) ||
            q.detectedSubject.toLowerCase().includes(review.subjectTitle.toLowerCase());
          if (subMatch) return true;
        }
        return false;
      });

      // 给题目打分并排序（统一评分权重，与 generateTest 保持一致）
      const scoredQuestions = matchedQuestions.map((q) => {
        let score = 0;

        // nodeId 精确匹配 +100 分（最高权重）
        if (nodeId && q.nodeId === nodeId) score += 100;

        // subjectId 精确匹配 +50 分
        if (subjectId && q.subjectId === subjectId) score += 50;

        // 知识点文本匹配 +40 分
        if (q.detectedKnowledgePoint) {
          const kpMatch = review.nodeTitle.toLowerCase().includes(q.detectedKnowledgePoint.toLowerCase()) ||
            q.detectedKnowledgePoint.toLowerCase().includes(review.nodeTitle.toLowerCase());
          if (kpMatch) score += 40;
        }

        // 学科文本匹配 +10 分
        if (q.detectedSubject) {
          const subMatch = review.subjectTitle.toLowerCase().includes(q.detectedSubject.toLowerCase()) ||
            q.detectedSubject.toLowerCase().includes(review.subjectTitle.toLowerCase());
          if (subMatch) score += 10;
        }

        // 错题权重：如果是错题，大幅提高分数
        const isWrongAnswer = userWrongAnswers.some(wa =>
          wa.questionContent === q.content ||
          (wa.questionContent && q.content && wa.questionContent.includes(q.content.substring(0, 50)))
        );
        if (isWrongAnswer) score += 200;

        // 未掌握的知识点优先
        if (review.mastery < 50) score += 50;
        else if (review.mastery < 70) score += 30;

        return { question: q, score };
      });

      // 按分数排序并随机打乱同分题目
      const sortedQuestions = scoredQuestions
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return Math.random() - 0.5; // 同分随机排序
        })
        .map(sq => sq.question);

      // 如果题库中有足够题目，直接使用
      if (sortedQuestions.length >= input.count) {
        const selected = sortedQuestions.slice(0, input.count);

        return {
          questions: selected.map((q) => ({
            id: `q-${q.id}`,
            content: q.content,
            options: q.options ? JSON.parse(q.options) : undefined,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation || "",
            knowledgePoint: review.nodeTitle,
            questionType: q.questionType,
          })),
          source: "database",
          reviewInfo: {
            nodeTitle: review.nodeTitle,
            subjectTitle: review.subjectTitle,
            reviewCount: review.reviewCount,
            currentMastery: review.mastery,
          },
        };
      }

      // 题库题目不够，调用 AI 生成
      const result = await generateTodoTestQuestions(
        review.subjectTitle,
        [review.nodeTitle],
        input.questionType,
        input.count,
        setting?.aiApiKey || undefined,
        setting?.aiApiEndpoint || undefined,
        setting?.aiModel || undefined
      );

      // 将AI生成的题目保存到题库
      const savedQuestionIds: number[] = [];

      // 使用前面已查找到的 subjectId 和 nodeId
      const finalSubjectId = subjectId;
      const finalNodeId = nodeId;

      for (const q of result.questions) {
        const [{ id }] = await db
          .insert(questions)
          .values({
            userId: ctx.user.id,
            subjectId: finalSubjectId,
            nodeId: finalNodeId,
            questionType: (q.questionType || input.questionType) as "single_choice" | "multiple_choice" | "fill_blank" | "short_answer" | "essay" | "mixed",
            content: q.content,
            options: q.options ? JSON.stringify(q.options) : null,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
            difficulty: 3,
            aiGenerated: true,
            detectedSubject: review.subjectTitle,
            detectedKnowledgePoint: review.nodeTitle,
          })
          .$returningId();
        savedQuestionIds.push(id);
      }

      return {
        questions: result.questions.map((q, idx) => ({
          ...q,
          id: `ai-${savedQuestionIds[idx]}`,
        })),
        source: "ai",
        reviewInfo: {
          nodeTitle: review.nodeTitle,
          subjectTitle: review.subjectTitle,
          reviewCount: review.reviewCount,
          currentMastery: review.mastery,
        },
      };
    }),

  // 提交复习测试答案并更新掌握度
  submitReviewTest: authedQuery
    .input(
      z.object({
        reviewId: z.number(),
        questions: z.array(
          z.object({
            id: z.string(),
            content: z.string(),
            correctAnswer: z.string(),
            explanation: z.string(),
            knowledgePoint: z.string(),
            questionType: z.enum(["single_choice", "multiple_choice", "fill_blank", "short_answer", "essay", "mixed"]).optional(),
          })
        ),
        answers: z.array(
          z.object({
            questionId: z.string(),
            userAnswer: z.string(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();

      const [review] = await db
        .select()
        .from(reviewSchedules)
        .where(and(eq(reviewSchedules.id, input.reviewId), eq(reviewSchedules.userId, ctx.user.id)));

      if (!review) throw new Error("复习任务不存在");

      const [setting] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, ctx.user.id));

      // 区分选择题和非选择题
      const choiceQuestions = input.questions.filter(q =>
        q.questionType === "single_choice" || q.questionType === "multiple_choice"
      );
      const otherQuestions = input.questions.filter(q =>
        q.questionType !== "single_choice" && q.questionType !== "multiple_choice"
      );

      // 选择题本地判断
      let correctCount = 0;
      for (const q of choiceQuestions) {
        const ans = input.answers.find(a => a.questionId === q.id);
        if (ans) {
          let userAns = ans.userAnswer.trim().toUpperCase();
          let correctAns = q.correctAnswer.trim().toUpperCase();

          // 多选题：排序后比较
          if (q.questionType === "multiple_choice") {
            userAns = userAns.split("").sort().join("");
            correctAns = correctAns.split("").sort().join("");
          }

          if (userAns === correctAns) {
            correctCount++;
          }
        }
      }

      // 非选择题需要AI评估
      let aiEvaluation: any = null;
      if (otherQuestions.length > 0) {
        const otherAnswers = input.answers.filter(a =>
          otherQuestions.some(q => q.id === a.questionId)
        );
        aiEvaluation = await evaluateTodoTestAnswers(
          review.subjectTitle,
          [review.nodeTitle],
          otherQuestions,
          otherAnswers,
          setting?.aiApiKey || undefined,
          setting?.aiApiEndpoint || undefined,
          setting?.aiModel || undefined
        );
      }

      // 计算总掌握度
      const totalQuestions = input.questions.length;
      let newMastery = 0;

      if (choiceQuestions.length > 0 && otherQuestions.length === 0) {
        newMastery = Math.round((correctCount / totalQuestions) * 100);
      } else if (choiceQuestions.length === 0 && otherQuestions.length > 0) {
        newMastery = aiEvaluation?.mastery || 0;
      } else {
        const choiceWeight = choiceQuestions.length / totalQuestions;
        const otherWeight = otherQuestions.length / totalQuestions;
        const choiceMastery = Math.round((correctCount / choiceQuestions.length) * 100);
        const otherMastery = aiEvaluation?.mastery || 0;
        newMastery = Math.round(choiceMastery * choiceWeight + otherMastery * otherWeight);
      }

      // 综合历史掌握度（加权平均：新测试60% + 历史40%）
      const finalMastery = Math.round(newMastery * 0.6 + review.mastery * 0.4);

      // 计算下一次复习间隔
      const newInterval = calculateNextInterval(review.intervalDays, finalMastery);
      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + newInterval);

      // 收集测试详情用于保存
      const testDetails: any = {
        testDate: new Date().toISOString(),
        questions: input.questions.map(q => {
          const ans = input.answers.find(a => a.questionId === q.id);
          const isChoice = q.questionType === "single_choice" || q.questionType === "multiple_choice";
          let isCorrect = false;

          if (isChoice && ans) {
            let userAns = ans.userAnswer.trim().toUpperCase();
            let correctAns = q.correctAnswer.trim().toUpperCase();
            if (q.questionType === "multiple_choice") {
              userAns = userAns.split("").sort().join("");
              correctAns = correctAns.split("").sort().join("");
            }
            isCorrect = userAns === correctAns;
          }

          return {
            ...q,
            userAnswer: ans?.userAnswer || "",
            isCorrect,
          };
        }),
        correctCount,
        totalQuestions,
        newMastery,
        previousMastery: review.mastery,
        finalMastery,
        suggestions: aiEvaluation?.suggestions || [],
        weakPoints: aiEvaluation?.weakPoints || [],
      };

      // 将错题收录到错题本
      for (const q of input.questions) {
        const ans = input.answers.find(a => a.questionId === q.id);
        if (!ans) continue;

        const isChoice = q.questionType === "single_choice" || q.questionType === "multiple_choice";
        let isCorrect = false;

        if (isChoice) {
          let userAns = ans.userAnswer.trim().toUpperCase();
          let correctAns = q.correctAnswer.trim().toUpperCase();
          if (q.questionType === "multiple_choice") {
            userAns = userAns.split("").sort().join("");
            correctAns = correctAns.split("").sort().join("");
          }
          isCorrect = userAns === correctAns;
        } else {
          // 非选择题根据AI评估判断是否错误
          const questionEval = aiEvaluation?.details?.find((d: any) => d.questionId === q.id);
          isCorrect = questionEval?.isCorrect || false;
        }

        // 如果答错，收录到错题本
        if (!isCorrect) {
          // 查找是否已存在该题目的错题记录
          const existingWrong = await db
            .select()
            .from(wrongAnswers)
            .where(
              and(
                eq(wrongAnswers.userId, ctx.user.id),
                eq(wrongAnswers.questionContent, q.content)
              )
            )
            .limit(1);

          if (existingWrong.length > 0) {
            // 更新错题记录
            await db
              .update(wrongAnswers)
              .set({
                wrongCount: existingWrong[0].wrongCount + 1,
                lastWrongAt: new Date(),
                mastered: false,
              })
              .where(eq(wrongAnswers.id, existingWrong[0].id));
          } else {
            // 创建新错题记录
            await db
              .insert(wrongAnswers)
              .values({
                userId: ctx.user.id,
                questionContent: q.content,
                userAnswer: ans.userAnswer,
                wrongCount: 1,
                lastWrongAt: new Date(),
                mastered: false,
              });
          }
        }
      }

      // 更新复习调度
      const existingDates = (() => {
        try {
          return JSON.parse(review.reviewDates || "[]");
        } catch {
          return [];
        }
      })();

      await db
        .update(reviewSchedules)
        .set({
          reviewCount: review.reviewCount + 1,
          nextReviewDate: nextDate.toISOString().split("T")[0],
          intervalDays: newInterval,
          mastery: finalMastery,
          reviewDates: JSON.stringify([...existingDates, new Date().toISOString().split("T")[0]]),
          status: finalMastery >= 95 && review.reviewCount >= 2 ? "mastered" : "active",
          snapshot: JSON.stringify(testDetails),
        })
        .where(eq(reviewSchedules.id, input.reviewId));

      // 同步更新知识节点的掌握度
      const knowledgeNode = await db
        .select()
        .from(knowledgeNodes)
        .where(
          and(
            eq(knowledgeNodes.userId, ctx.user.id),
            eq(knowledgeNodes.title, review.nodeTitle)
          )
        )
        .limit(1);

      if (knowledgeNode.length > 0) {
        await db
          .update(knowledgeNodes)
          .set({ mastery: finalMastery })
          .where(eq(knowledgeNodes.id, knowledgeNode[0].id));
      }

      // 构建反馈信息
      const feedback = choiceQuestions.length > 0 && otherQuestions.length === 0
        ? `答对 ${correctCount}/${totalQuestions} 题，掌握度更新为 ${finalMastery}%`
        : choiceQuestions.length === 0 && otherQuestions.length > 0
        ? `AI评估掌握度 ${newMastery}%，综合历史记录后为 ${finalMastery}%`
        : `选择题 ${correctCount}/${choiceQuestions.length} 正确，AI评估主观题掌握度 ${aiEvaluation?.mastery || 0}%，综合掌握度 ${finalMastery}%`;

      return {
        success: true,
        mastery: finalMastery,
        newMastery,
        previousMastery: review.mastery,
        reviewCount: review.reviewCount + 1,
        nextReviewIn: newInterval,
        feedback,
        suggestions: aiEvaluation?.suggestions || [],
        weakPoints: aiEvaluation?.weakPoints || [],
        status: finalMastery >= 95 && review.reviewCount >= 2 ? "mastered" : "active",
        testDetails,
      };
    }),

  // 获取复习测试详情
  getReviewDetail: authedQuery
    .input(z.object({ reviewId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();

      const [review] = await db
        .select()
        .from(reviewSchedules)
        .where(and(eq(reviewSchedules.id, input.reviewId), eq(reviewSchedules.userId, ctx.user.id)));

      if (!review) throw new Error("复习任务不存在");

      // 解析snapshot
      let testDetails = null;
      if (review.snapshot) {
        try {
          testDetails = JSON.parse(review.snapshot);
        } catch {
          testDetails = null;
        }
      }

      return {
        review,
        testDetails,
      };
    }),

  // 回退复习测试数据（只回退掌握度等数据，不删除复习任务本身）
  rollbackReview: authedQuery
    .input(z.object({ reviewId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();

      const [review] = await db
        .select()
        .from(reviewSchedules)
        .where(and(eq(reviewSchedules.id, input.reviewId), eq(reviewSchedules.userId, ctx.user.id)));

      if (!review) throw new Error("复习任务不存在");
      if (!review.snapshot) throw new Error("该复习记录没有可回退的数据");

      // 解析snapshot
      let snapshot: any;
      try {
        snapshot = JSON.parse(review.snapshot);
      } catch {
        throw new Error("解析快照数据失败");
      }

      // 回退知识节点掌握度
      const knowledgeNode = await db
        .select()
        .from(knowledgeNodes)
        .where(
          and(
            eq(knowledgeNodes.userId, ctx.user.id),
            eq(knowledgeNodes.title, review.nodeTitle)
          )
        )
        .limit(1);

      if (knowledgeNode.length > 0) {
        await db
          .update(knowledgeNodes)
          .set({ mastery: snapshot.previousMastery || 0 })
          .where(eq(knowledgeNodes.id, knowledgeNode[0].id));
      }

      // 回退复习调度数据
      const reviewDates = (() => {
        try {
          return JSON.parse(review.reviewDates || "[]");
        } catch {
          return [];
        }
      })();

      // 移除最后一次复习日期
      const updatedDates = reviewDates.slice(0, -1);

      await db
        .update(reviewSchedules)
        .set({
          reviewCount: Math.max(0, review.reviewCount - 1),
          mastery: snapshot.previousMastery || 0,
          reviewDates: JSON.stringify(updatedDates),
          snapshot: null, // 清空snapshot
          status: "active", // 重置为active状态
        })
        .where(eq(reviewSchedules.id, input.reviewId));

      return { success: true, message: "复习数据已回退" };
    }),

  // 删除复习安排
  deleteReview: authedQuery
    .input(z.object({ reviewId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();

      const [review] = await db
        .select()
        .from(reviewSchedules)
        .where(and(eq(reviewSchedules.id, input.reviewId), eq(reviewSchedules.userId, ctx.user.id)));

      if (!review) throw new Error("复习任务不存在");

      await db
        .delete(reviewSchedules)
        .where(and(eq(reviewSchedules.id, input.reviewId), eq(reviewSchedules.userId, ctx.user.id)));

      return { success: true };
    }),
});
