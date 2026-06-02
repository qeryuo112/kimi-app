import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { studyLogs, studyStats, knowledgeNodes, subjects, userSettings, questions, skillDimensions, reviewSchedules, wrongAnswers } from "@db/schema";
import { eq, and, desc, gte } from "drizzle-orm";
import { evaluateStudyLogQuality, generateStudyLogTests, generateTodoTestQuestions, generateTodoTestFromFiles } from "./lib/ai";
import {
  matchQuestionsFromBank,
  evaluateMixedTestAnswers,
  upsertStudyStats,
  updateNodeMastery,
  updateSubjectProgress,
  updateSkillDimensions,
  upsertReviewSchedule,
  collectWrongAnswers,
  buildStudyLogContent,
  calculateNextInterval,
} from "./lib/study-evaluation";

export const studyRouter = createRouter({
  // 列出用户的学习记录
  list: authedQuery
    .input(
      z
        .object({
          subjectId: z.number().optional(),
          limit: z.number().default(50),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(studyLogs.userId, ctx.user.id)];

      if (input?.subjectId) {
        conditions.push(eq(studyLogs.subjectId, input.subjectId));
      }

      return getDb()
        .select()
        .from(studyLogs)
        .where(and(...conditions))
        .orderBy(desc(studyLogs.createdAt))
        .limit(input?.limit || 50);
    }),

  // 创建学习记录
  create: authedQuery
    .input(
      z.object({
        subjectId: z.number().optional(),
        nodeId: z.number().optional(),
        title: z.string().min(1),
        content: z.string().optional(),
        duration: z.number().min(1), // 分钟
        quality: z.number().min(1).max(5).default(3),
        mood: z.enum(["great", "good", "normal", "tired", "bad"]).default("normal"),
        tags: z.string().optional(),
        attachments: z.string().optional(),
        date: z.date().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const logDate = input.date || new Date();

      const [{ id }] = await getDb()
        .insert(studyLogs)
        .values({
          ...input,
          userId: ctx.user.id,
          date: logDate,
        })
        .$returningId();

      // 更新统计
      const dateStr = logDate.toISOString().split("T")[0];
      const existingStats = await getDb()
        .select()
        .from(studyStats)
        .where(
          and(
            eq(studyStats.userId, ctx.user.id),
            eq(studyStats.statDate, dateStr),
            input.subjectId
              ? eq(studyStats.subjectId, input.subjectId)
              : undefined
          )
        );

      if (existingStats.length > 0) {
        const stat = existingStats[0];
        const currentAvg = stat.avgQuality || 0;
        await getDb()
          .update(studyStats)
          .set({
            totalMinutes: stat.totalMinutes + input.duration,
            sessionsCount: stat.sessionsCount + 1,
            avgQuality:
              Math.round(
                ((currentAvg * stat.sessionsCount + input.quality) /
                  (stat.sessionsCount + 1)) *
                  10
              ) / 10,
          })
          .where(eq(studyStats.id, stat.id));
      } else {
        await getDb().insert(studyStats).values({
          userId: ctx.user.id,
          subjectId: input.subjectId,
          statDate: dateStr,
          totalMinutes: input.duration,
          sessionsCount: 1,
          avgQuality: input.quality,
          nodesStudied: input.nodeId ? 1 : 0,
        });
      }

      // 如果有节点，增加经验
      if (input.nodeId) {
        const [node] = await getDb()
          .select()
          .from(knowledgeNodes)
          .where(eq(knowledgeNodes.id, input.nodeId));

        if (node) {
          // 增加节点掌握度
          const masteryIncrease = Math.min(100, node.mastery + input.quality * 3);
          await getDb()
            .update(knowledgeNodes)
            .set({ mastery: masteryIncrease })
            .where(eq(knowledgeNodes.id, input.nodeId));
        }
      }

      // 更新科目进度
      if (input.subjectId) {
        const nodes = await getDb()
          .select()
          .from(knowledgeNodes)
          .where(eq(knowledgeNodes.subjectId, input.subjectId));

        if (nodes.length > 0) {
          const avgMastery = nodes.reduce((sum, n) => sum + n.mastery, 0) / nodes.length;
          await getDb()
            .update(subjects)
            .set({ progress: Math.round(avgMastery) })
            .where(eq(subjects.id, input.subjectId));
        }
      }

      return getDb()
        .select()
        .from(studyLogs)
        .where(eq(studyLogs.id, id))
        .then(([l]) => l);
    }),

  // 更新学习记录
  update: authedQuery
    .input(
      z.object({
        id: z.number(),
        title: z.string().min(1).optional(),
        content: z.string().optional(),
        duration: z.number().min(1).optional(),
        quality: z.number().min(1).max(5).optional(),
        mood: z.enum(["great", "good", "normal", "tired", "bad"]).optional(),
        tags: z.string().optional(),
        aiFeedback: z.string().optional(),
        aiTestScore: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await getDb()
        .update(studyLogs)
        .set(data)
        .where(and(eq(studyLogs.id, id), eq(studyLogs.userId, ctx.user.id)));

      return getDb()
        .select()
        .from(studyLogs)
        .where(eq(studyLogs.id, id))
        .then(([l]) => l);
    }),

  // 删除学习记录（有快照则回退数据）
  delete: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();

      const [log] = await db
        .select()
        .from(studyLogs)
        .where(and(eq(studyLogs.id, input.id), eq(studyLogs.userId, ctx.user.id)));

      if (!log) throw new Error("记录不存在");

      // 回退当日学习统计（无论有无快照都要执行）
      const logDate = new Date(log.date).toISOString().split("T")[0];
      const existingStats = await db
        .select()
        .from(studyStats)
        .where(and(eq(studyStats.userId, ctx.user.id), eq(studyStats.statDate, logDate)));

      if (existingStats.length > 0) {
        const stat = existingStats[0];
        const newSessions = stat.sessionsCount - 1;
        const newMinutes = Math.max(0, stat.totalMinutes - log.duration);

        if (newSessions <= 0 || newMinutes <= 0) {
          await db.delete(studyStats).where(eq(studyStats.id, stat.id));
        } else {
          const oldAvg = stat.avgQuality || 0;
          const newAvg = newSessions > 0
            ? Math.round(((oldAvg * stat.sessionsCount) - log.quality) / newSessions * 10) / 10
            : 0;
          await db
            .update(studyStats)
            .set({
              totalMinutes: newMinutes,
              sessionsCount: newSessions,
              avgQuality: newAvg > 0 ? newAvg : 0,
            })
            .where(eq(studyStats.id, stat.id));
        }
      }

      // 如果有快照，回退其他相关数据
      if (log.snapshot) {
        const snapshot = JSON.parse(log.snapshot);

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

        // 4. 恢复复习调度
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
      }

      // 删除学习记录
      await db
        .delete(studyLogs)
        .where(and(eq(studyLogs.id, input.id), eq(studyLogs.userId, ctx.user.id)));

      return { success: true };
    }),

  // 获取学习统计
  getStats: authedQuery
    .input(
      z
        .object({
          days: z.number().default(30),
          subjectId: z.number().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const days = input?.days || 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const conditions = [
        eq(studyStats.userId, ctx.user.id),
        gte(studyStats.statDate, startDate.toISOString().split("T")[0]),
      ];

      if (input?.subjectId) {
        conditions.push(eq(studyStats.subjectId, input.subjectId));
      }

      const stats = await getDb()
        .select()
        .from(studyStats)
        .where(and(...conditions))
        .orderBy(studyStats.statDate);

      const totalMinutes = stats.reduce((sum, s) => sum + s.totalMinutes, 0);
      const totalSessions = stats.reduce((sum, s) => sum + s.sessionsCount, 0);
      const avgQuality =
        stats.length > 0
          ? stats.reduce((sum, s) => sum + (s.avgQuality || 0), 0) / stats.length
          : 0;

      return {
        stats,
        summary: {
          totalMinutes,
          totalSessions,
          avgQuality: Math.round(avgQuality * 10) / 10,
          avgDailyMinutes: Math.round(totalMinutes / days),
        },
      };
    }),

  // AI评估学习记录质量
  aiEvaluate: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();

      const [log] = await db
        .select()
        .from(studyLogs)
        .where(and(eq(studyLogs.id, input.id), eq(studyLogs.userId, ctx.user.id)));

      if (!log) throw new Error("学习记录不存在");

      const [setting] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, ctx.user.id));

      const result = await evaluateStudyLogQuality(
        log.title,
        log.content || "",
        log.duration,
        setting?.aiApiKey || undefined,
        setting?.aiApiEndpoint || undefined,
        setting?.aiModel || undefined
      );

      // 更新学习记录的AI反馈和质量
      await db
        .update(studyLogs)
        .set({
          aiFeedback: result.feedback,
          quality: result.quality,
        })
        .where(eq(studyLogs.id, input.id));

      return result;
    }),

  // AI根据学习记录生成测试题
  aiGenerateTests: authedQuery
    .input(
      z.object({
        id: z.number(),
        count: z.number().min(1).max(10).default(5),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();

      const [log] = await db
        .select()
        .from(studyLogs)
        .where(and(eq(studyLogs.id, input.id), eq(studyLogs.userId, ctx.user.id)));

      if (!log) throw new Error("学习记录不存在");
      if (!log.content) throw new Error("学习记录没有内容，无法生成测试题");

      const [setting] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, ctx.user.id));

      const result = await generateStudyLogTests(
        log.title,
        log.content,
        input.count,
        setting?.aiApiKey || undefined,
        setting?.aiApiEndpoint || undefined,
        setting?.aiModel || undefined
      );

      return result;
    }),

  // 根据科目/知识点匹配题库题目（支持文件上传出题）
  matchQuestions: authedQuery
    .input(
      z.object({
        subjectId: z.number().optional(),
        nodeId: z.number().optional(),
        count: z.number().min(1).max(20).default(5),
        questionType: z.enum(["single_choice", "multiple_choice", "fill_blank", "short_answer", "essay", "mixed"]).default("mixed"),
        fileUrls: z.array(z.string().url()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();

      let subjectTitle = "";
      let nodeTitle = "";

      if (input.subjectId) {
        const [sub] = await db
          .select()
          .from(subjects)
          .where(and(eq(subjects.id, input.subjectId), eq(subjects.userId, ctx.user.id)));
        if (sub) subjectTitle = sub.title;
      }

      if (input.nodeId) {
        const [node] = await db
          .select()
          .from(knowledgeNodes)
          .where(and(eq(knowledgeNodes.id, input.nodeId), eq(knowledgeNodes.userId, ctx.user.id)));
        if (node) nodeTitle = node.title;
      }

      const [setting] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, ctx.user.id));

      // 如果上传了文件，优先基于文件内容出题
      if (input.fileUrls && input.fileUrls.length > 0) {
        const result = await generateTodoTestFromFiles(
          input.fileUrls,
          subjectTitle || "综合测试",
          nodeTitle ? [nodeTitle] : [],
          input.questionType,
          input.count,
          setting?.aiApiKey || undefined,
          setting?.aiApiEndpoint || undefined,
          setting?.aiModel || undefined
        );

        // 保存AI生成的题目到题库
        const savedIds: number[] = [];
        for (const q of result.questions) {
          const [{ id }] = await db
            .insert(questions)
            .values({
              userId: ctx.user.id,
              subjectId: input.subjectId,
              nodeId: input.nodeId,
              questionType: q.questionType || input.questionType,
              content: q.content,
              options: q.options ? JSON.stringify(q.options) : null,
              correctAnswer: q.correctAnswer,
              explanation: q.explanation,
              difficulty: 3,
              aiGenerated: true,
              detectedSubject: subjectTitle || undefined,
              detectedKnowledgePoint: q.knowledgePoint || nodeTitle || undefined,
            })
            .$returningId();
          savedIds.push(id);
        }

        return {
          questions: result.questions.map((q, idx) => ({
            ...q,
            id: `ai-${savedIds[idx]}`,
          })),
          source: "ai-file",
        };
      }

      // 从题库匹配
      const matched = await matchQuestionsFromBank(
        ctx.user.id,
        input.subjectId || null,
        input.nodeId || null,
        nodeTitle,
        subjectTitle,
        input.count
      );

      if (matched.length >= input.count) {
        return {
          questions: matched.map((q) => ({
            id: `q-${q.id}`,
            content: q.content,
            options: q.options ? JSON.parse(q.options) : undefined,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation || "",
            knowledgePoint: q.detectedKnowledgePoint || nodeTitle || "综合",
            questionType: q.questionType,
          })),
          source: "database",
        };
      }

      // 题库不够，AI生成补充
      const result = await generateTodoTestQuestions(
        subjectTitle || "综合测试",
        nodeTitle ? [nodeTitle] : [],
        input.questionType,
        input.count,
        setting?.aiApiKey || undefined,
        setting?.aiApiEndpoint || undefined,
        setting?.aiModel || undefined
      );

      // 保存AI生成的题目到题库
      const savedIds: number[] = [];
      for (const q of result.questions) {
        const [{ id }] = await db
          .insert(questions)
          .values({
            userId: ctx.user.id,
            subjectId: input.subjectId,
            nodeId: input.nodeId,
            questionType: q.questionType || input.questionType,
            content: q.content,
            options: q.options ? JSON.stringify(q.options) : null,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
            difficulty: 3,
            aiGenerated: true,
            detectedSubject: subjectTitle || undefined,
            detectedKnowledgePoint: q.knowledgePoint || nodeTitle || undefined,
          })
          .$returningId();
        savedIds.push(id);
      }

      return {
        questions: result.questions.map((q, idx) => ({
          ...q,
          id: `ai-${savedIds[idx]}`,
        })),
        source: "ai",
      };
    }),

  // 提交学习测试，创建学习记录并更新所有数据
  submitStudyTest: authedQuery
    .input(
      z.object({
        subjectId: z.number().optional(),
        nodeId: z.number().optional(),
        title: z.string().min(1),
        content: z.string().optional(),
        duration: z.number().min(1),
        mood: z.enum(["great", "good", "normal", "tired", "bad"]).default("normal"),
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

      console.log("[submitStudyTest] 开始", {
        userId: ctx.user.id,
        subjectId: input.subjectId,
        nodeId: input.nodeId,
        title: input.title,
        questionCount: input.questions.length,
        answerCount: input.answers.length,
      });

      // 获取科目和知识点信息
      let subjectTitle = "";
      let nodeTitle = "";

      if (input.subjectId) {
        const [sub] = await db
          .select()
          .from(subjects)
          .where(and(eq(subjects.id, input.subjectId), eq(subjects.userId, ctx.user.id)));
        if (sub) subjectTitle = sub.title;
      }

      if (input.nodeId) {
        const [node] = await db
          .select()
          .from(knowledgeNodes)
          .where(and(eq(knowledgeNodes.id, input.nodeId), eq(knowledgeNodes.userId, ctx.user.id)));
        if (node) nodeTitle = node.title;
      }

      console.log("[submitStudyTest] 科目/知识点", { subjectTitle, nodeTitle });

      const [setting] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, ctx.user.id));

      console.log("[submitStudyTest] 用户设置", {
        hasApiKey: !!setting?.aiApiKey,
        hasApiEndpoint: !!setting?.aiApiEndpoint,
        model: setting?.aiModel,
      });

      // 评估答案
      console.log("[submitStudyTest] 调用 evaluateMixedTestAnswers");
      let evaluation;
      try {
        evaluation = await evaluateMixedTestAnswers(
          input.questions,
          input.answers,
          subjectTitle || input.title,
          nodeTitle ? [nodeTitle] : [],
          setting?.aiApiKey || undefined,
          setting?.aiApiEndpoint || undefined,
          setting?.aiModel || undefined
        );
        console.log("[submitStudyTest] evaluateMixedTestAnswers 返回", evaluation);
      } catch (err: any) {
        console.error("[submitStudyTest] evaluateMixedTestAnswers 异常", err?.message, err?.stack);
        throw err;
      }

      const quality = Math.max(1, Math.min(5, Math.round(evaluation.mastery / 20)));
      const nodeTitles = nodeTitle ? [nodeTitle] : [];
      console.log("[submitStudyTest] 计算结果", { quality, mastery: evaluation.mastery, nodeTitles });

      // ========== 收集快照数据（删除时回退用）==========
      console.log("[submitStudyTest] 开始收集快照");
      const snapshot: any = {
        knowledgeNodes: [],
        skills: [],
        subjects: [],
        studyStats: null,
        reviewSchedules: [],
      };

      // 收集知识节点旧掌握度
      console.log("[submitStudyTest] 查询知识节点");
      for (const title of nodeTitles) {
        const matched = await db
          .select()
          .from(knowledgeNodes)
          .where(and(eq(knowledgeNodes.userId, ctx.user.id), eq(knowledgeNodes.title, title)));
        console.log("[submitStudyTest] 知识节点查询结果", { title, matchedCount: matched.length });
        for (const kn of matched) {
          snapshot.knowledgeNodes.push({ id: kn.id, mastery: kn.mastery });
        }
      }

      // 收集科目旧进度
      console.log("[submitStudyTest] 查询科目");
      if (input.subjectId) {
        const [sub] = await db
          .select()
          .from(subjects)
          .where(and(eq(subjects.id, input.subjectId), eq(subjects.userId, ctx.user.id)));
        console.log("[submitStudyTest] 科目查询结果", { found: !!sub });
        if (sub) snapshot.subjects.push({ id: sub.id, progress: sub.progress });
      }

      // 收集技能维度旧数据
      console.log("[submitStudyTest] 查询技能维度");
      if (input.subjectId) {
        const subSkills = await db
          .select()
          .from(skillDimensions)
          .where(and(eq(skillDimensions.userId, ctx.user.id), eq(skillDimensions.subjectId, input.subjectId)));
        console.log("[submitStudyTest] 技能维度查询结果", { count: subSkills.length });
        for (const skill of subSkills) {
          snapshot.skills.push({
            id: skill.id,
            currentLevel: skill.currentLevel,
            experience: skill.experience,
            experienceToNext: skill.experienceToNext,
          });
        }
      }

      // 收集学习统计旧数据
      console.log("[submitStudyTest] 查询学习统计", { today });
      const existingStats = await db
        .select()
        .from(studyStats)
        .where(and(eq(studyStats.userId, ctx.user.id), eq(studyStats.statDate, today)));
      console.log("[submitStudyTest] 学习统计查询结果", { count: existingStats.length });
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
      console.log("[submitStudyTest] 查询复习调度");
      if (nodeTitle && subjectTitle) {
        const [rev] = await db
          .select()
          .from(reviewSchedules)
          .where(
            and(
              eq(reviewSchedules.userId, ctx.user.id),
              eq(reviewSchedules.nodeTitle, nodeTitle),
              eq(reviewSchedules.subjectTitle, subjectTitle)
            )
          );
        console.log("[submitStudyTest] 复习调度查询结果", { found: !!rev });
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

      console.log("[submitStudyTest] 快照收集完成", { snapshotKeys: Object.keys(snapshot) });

      // 1. 创建学习记录
      const studyContent = input.content
        ? `${input.content}\n\n---\n${buildStudyLogContent(subjectTitle || input.title, nodeTitles, evaluation)}`
        : buildStudyLogContent(subjectTitle || input.title, nodeTitles, evaluation);

      console.log("[submitStudyTest] 准备创建学习记录");
      const [{ id: studyLogId }] = await db
        .insert(studyLogs)
        .values({
          userId: ctx.user.id,
          subjectId: input.subjectId,
          nodeId: input.nodeId,
          title: input.title,
          content: studyContent,
          duration: input.duration,
          quality,
          mood: input.mood,
          date: new Date(),
          aiFeedback: evaluation.feedback,
          aiTestScore: evaluation.mastery,
          tags: JSON.stringify(nodeTitles),
          snapshot: JSON.stringify(snapshot),
        })
        .$returningId();
      console.log("[submitStudyTest] 学习记录创建完成", { studyLogId });

      // 2. 更新学习统计
      console.log("[submitStudyTest] 更新学习统计");
      await upsertStudyStats(ctx.user.id, today, input.duration, quality, nodeTitles.length);
      console.log("[submitStudyTest] 学习统计更新完成");

      // 3. 更新知识节点掌握度
      if (nodeTitles.length > 0) {
        console.log("[submitStudyTest] 更新知识节点掌握度");
        await updateNodeMastery(ctx.user.id, nodeTitles, evaluation.mastery);
        console.log("[submitStudyTest] 知识节点掌握度更新完成");
      }

      // 4. 更新科目进度
      if (input.subjectId) {
        console.log("[submitStudyTest] 更新科目进度");
        await updateSubjectProgress(ctx.user.id, input.subjectId);
        console.log("[submitStudyTest] 科目进度更新完成");
      }

      // 5. 更新技能维度
      if (input.subjectId) {
        console.log("[submitStudyTest] 更新技能维度");
        await updateSkillDimensions(ctx.user.id, input.subjectId, evaluation.mastery, input.duration);
        console.log("[submitStudyTest] 技能维度更新完成");
      }

      // 6. 更新复习调度
      if (nodeTitle && subjectTitle) {
        console.log("[submitStudyTest] 更新复习调度");
        await upsertReviewSchedule(
          ctx.user.id,
          null,
          nodeTitle,
          subjectTitle,
          evaluation.mastery
        );
        console.log("[submitStudyTest] 复习调度更新完成");
      }

      // 7. 收集错题
      console.log("[submitStudyTest] 收集错题");
      await collectWrongAnswers(
        ctx.user.id,
        input.questions,
        input.answers,
        evaluation.aiEvaluation,
        input.subjectId,
        input.nodeId
      );
      console.log("[submitStudyTest] 错题收集完成");

      console.log("[submitStudyTest] 全部完成，准备返回");
      return {
        success: true,
        studyLogId,
        mastery: evaluation.mastery,
        quality,
        feedback: evaluation.feedback,
        correctCount: evaluation.correctCount,
        totalCount: evaluation.totalCount,
        nextReviewIn: calculateNextInterval(1, evaluation.mastery),
        weakPoints: evaluation.aiEvaluation?.weakPoints || [],
        suggestions: evaluation.aiEvaluation?.suggestions || [],
      };
    }),
});
