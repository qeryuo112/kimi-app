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
} from "@db/schema";
import { eq, and, lte, desc, inArray } from "drizzle-orm";
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

        // 为新知识点创建复习调度
        const nodes = item.knowledgeNodes || [];
        for (const node of nodes) {
          const existingReview = await db
            .select()
            .from(reviewSchedules)
            .where(
              and(
                eq(reviewSchedules.userId, ctx.user.id),
                eq(reviewSchedules.planId, input.planId),
                eq(reviewSchedules.nodeTitle, node)
              )
            );

          if (existingReview.length === 0) {
            // 首次学习，安排第一次复习（1天后）
            const nextDate = new Date(today);
            nextDate.setDate(nextDate.getDate() + 1);
            await db.insert(reviewSchedules).values({
              userId: ctx.user.id,
              planId: input.planId,
              nodeTitle: node,
              subjectTitle: item.subject || "",
              originalStudyDate: today,
              reviewDates: JSON.stringify([]),
              nextReviewDate: nextDate.toISOString().split("T")[0],
              intervalDays: 1,
              reviewCount: 0,
              mastery: 0,
              status: "active",
            });
          }
        }
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
  getToday: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const today = new Date().toISOString().split("T")[0];

    const todos = await db
      .select()
      .from(dailyTodos)
      .where(and(eq(dailyTodos.userId, ctx.user.id), eq(dailyTodos.date, today)))
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
        count: z.number().min(1).max(20).default(5),
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

      if (nodes.length === 0) throw new Error("该任务没有关联知识点，无法生成测试题");

      // 获取知识点详情用于映射
      const nodeIds = nodes.map((n: any) => n.id).filter(Boolean);
      const nodeDetails = nodeIds.length > 0
        ? await db
            .select()
            .from(knowledgeNodes)
            .where(and(
              eq(knowledgeNodes.userId, ctx.user.id),
              inArray(knowledgeNodes.id, nodeIds)
            ))
        : [];
      const nodeMap = new Map(nodeDetails.map((n) => [n.id, n]));

      const [setting] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, ctx.user.id));

      // 智能选题：先从题库中找相关题目
      const allQuestions = await db
        .select()
        .from(questions)
        .where(eq(questions.userId, ctx.user.id));

      // 根据知识点匹配题目
      const matchedQuestions = allQuestions.filter((q) => {
        // 匹配 nodeId
        if (q.nodeId && nodes.some((n: any) => n.id === q.nodeId)) return true;
        // 匹配 detectedKnowledgePoint
        if (q.detectedKnowledgePoint) {
          return nodes.some((n: any) =>
            n.title?.toLowerCase().includes(q.detectedKnowledgePoint!.toLowerCase()) ||
            q.detectedKnowledgePoint!.toLowerCase().includes(n.title?.toLowerCase() || "")
          );
        }
        return false;
      });

      // 如果题库中有足够题目，直接使用
      if (matchedQuestions.length >= input.count) {
        // 随机选择指定数量的题目
        const shuffled = matchedQuestions.sort(() => 0.5 - Math.random());
        const selected = shuffled.slice(0, input.count);

        return {
          questions: selected.map((q) => ({
            id: `q-${q.id}`,
            content: q.content,
            options: q.options ? JSON.parse(q.options) : undefined,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation || "",
            knowledgePoint: q.detectedKnowledgePoint || nodeMap.get(q.nodeId)?.title || "综合",
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

      return { ...result, source: "ai" };
    }),

  // 从文件生成测试题
  generateTestFromFiles: authedQuery
    .input(
      z.object({
        id: z.number(),
        urls: z.array(z.string().url()).min(1).max(5),
        questionType: z.enum(["single_choice", "multiple_choice", "fill_blank", "short_answer", "essay", "mixed"]).default("mixed"),
        count: z.number().min(1).max(20).default(5),
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

      return { ...result, source: "ai" };
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

      // AI考官评估答题
      const evaluation = await evaluateTodoTestAnswers(
        todo.subject,
        nodes,
        input.questions,
        input.answers,
        setting?.aiApiKey || undefined,
        setting?.aiApiEndpoint || undefined,
        setting?.aiModel || undefined
      );

      const mastery = evaluation.mastery;
      const feedback = `答对 ${evaluation.correctCount}/${evaluation.totalCount} 题。${evaluation.feedback}`;

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

      // 7. 更新复习调度
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
        }
      }

      // 8. 保存快照到任务（用于删除时回退）
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
});
