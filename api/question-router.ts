import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { questions, userAnswers, wrongAnswers, knowledgeNodes, userSettings } from "@db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { generateQuestions, generateQuestionsFromFileUrls, evaluateAnswer, recognizeQuestionsFromUrls } from "./lib/ai";

export const questionRouter = createRouter({
  // 列出题库中的题目
  list: authedQuery
    .input(
      z
        .object({
          subjectId: z.number().optional(),
          nodeId: z.number().optional(),
          skillId: z.number().optional(),
          questionType: z.enum(["single_choice", "multiple_choice", "fill_blank", "short_answer", "essay", "mixed"]).optional(),
          limit: z.number().default(50),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(questions.userId, ctx.user.id)];

      if (input?.subjectId) conditions.push(eq(questions.subjectId, input.subjectId));
      if (input?.nodeId) conditions.push(eq(questions.nodeId, input.nodeId));
      if (input?.skillId) conditions.push(eq(questions.skillId, input.skillId));
      if (input?.questionType) conditions.push(eq(questions.questionType, input.questionType));

      return getDb()
        .select()
        .from(questions)
        .where(and(...conditions))
        .orderBy(desc(questions.createdAt))
        .limit(input?.limit || 50);
    }),

  // 获取单题详情
  getById: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const [q] = await getDb()
        .select()
        .from(questions)
        .where(and(eq(questions.id, input.id), eq(questions.userId, ctx.user.id)));
      return q || null;
    }),

  // AI出题
  aiGenerate: authedQuery
    .input(
      z.object({
        topic: z.string().min(1),
        knowledgeContent: z.string().optional(),
        questionType: z.enum(["single_choice", "multiple_choice", "fill_blank", "short_answer", "essay", "mixed"]).default("single_choice"),
        count: z.number().min(1).max(20).default(5),
        difficulty: z.number().min(1).max(5).default(3),
        subjectId: z.number().optional(),
        nodeId: z.number().optional(),
        skillId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [setting] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, ctx.user.id));

      // 如果没有提供知识点内容，尝试从数据库获取
      let content = input.knowledgeContent || "";
      if (!content && input.nodeId) {
        const [node] = await db
          .select()
          .from(knowledgeNodes)
          .where(and(eq(knowledgeNodes.id, input.nodeId), eq(knowledgeNodes.userId, ctx.user.id)));
        if (node) {
          content = node.description || node.title;
        }
      }

      const result = await generateQuestions(
        input.topic,
        content || input.topic,
        input.questionType,
        input.count,
        input.difficulty,
        setting?.aiApiKey || undefined,
        setting?.aiApiEndpoint || undefined,
        setting?.aiModel || undefined
      );

      // 保存题目到数据库
      const savedQuestions = [];
      for (const q of result.questions) {
        const [{ id }] = await db
          .insert(questions)
          .values({
            userId: ctx.user.id,
            subjectId: input.subjectId,
            nodeId: input.nodeId,
            skillId: input.skillId,
            questionType: input.questionType,
            content: q.content,
            options: q.options ? JSON.stringify(q.options) : null,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
            difficulty: q.difficulty,
            imageUrl: q.imageUrl || null,
            aiGenerated: true,
          })
          .$returningId();

        savedQuestions.push({ id, ...q });
      }

      return { success: true, questions: savedQuestions };
    }),

  // AI出题（从文件URL读取内容后出题）
  aiGenerateFromUrls: authedQuery
    .input(
      z.object({
        urls: z.array(z.string().url()).min(1).max(5),
        questionType: z.enum(["single_choice", "multiple_choice", "fill_blank", "short_answer", "essay", "mixed"]).default("single_choice"),
        count: z.number().min(1).max(20).default(5),
        difficulty: z.number().min(1).max(5).default(3),
        subjectId: z.number().optional(),
        nodeId: z.number().optional(),
        skillId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [setting] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, ctx.user.id));

      const result = await generateQuestionsFromFileUrls(
        input.urls,
        input.questionType,
        input.count,
        input.difficulty,
        setting?.aiApiKey || undefined,
        setting?.aiApiEndpoint || undefined,
        setting?.aiModel || undefined
      );

      // 保存题目到数据库
      const savedQuestions = [];
      for (const q of result.questions) {
        const [{ id }] = await db
          .insert(questions)
          .values({
            userId: ctx.user.id,
            subjectId: input.subjectId,
            nodeId: input.nodeId,
            skillId: input.skillId,
            questionType: input.questionType,
            content: q.content,
            options: q.options ? JSON.stringify(q.options) : null,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
            difficulty: q.difficulty,
            imageUrl: q.imageUrl || null,
            aiGenerated: true,
          })
          .$returningId();

        savedQuestions.push({ id, ...q });
      }

      return { success: true, questions: savedQuestions };
    }),

  // AI识别文档/图片中的题目
  recognizeFromUrls: authedQuery
    .input(
      z.object({
        urls: z.array(z.string().url()).min(1).max(5),
        questionType: z.enum(["single_choice", "multiple_choice", "fill_blank", "short_answer", "essay", "mixed"]).default("single_choice"),
        subjectId: z.number().optional(),
        nodeId: z.number().optional(),
        skillId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [setting] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, ctx.user.id));

      const result = await recognizeQuestionsFromUrls(
        input.urls,
        input.questionType,
        setting?.aiApiKey || undefined,
        setting?.aiApiEndpoint || undefined,
        setting?.aiModel || undefined
      );

      const savedQuestions = [];
      for (const q of result.questions) {
        const [{ id }] = await db
          .insert(questions)
          .values({
            userId: ctx.user.id,
            subjectId: input.subjectId,
            nodeId: input.nodeId,
            skillId: input.skillId,
            questionType: input.questionType,
            content: q.content,
            options: q.options ? JSON.stringify(q.options) : null,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
            difficulty: q.difficulty,
            imageUrl: q.imageUrl || null,
            aiGenerated: true,
          })
          .$returningId();

        savedQuestions.push({ id, ...q });
      }

      return { success: true, questions: savedQuestions };
    }),

  // 更新题目
  update: authedQuery
    .input(
      z.object({
        id: z.number(),
        content: z.string().optional(),
        options: z.string().optional(),
        correctAnswer: z.string().optional(),
        explanation: z.string().optional(),
        difficulty: z.number().min(1).max(5).optional(),
        imageUrl: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const updateData: Partial<typeof questions.$inferInsert> = {};

      if (input.content !== undefined) updateData.content = input.content;
      if (input.options !== undefined) updateData.options = input.options;
      if (input.correctAnswer !== undefined) updateData.correctAnswer = input.correctAnswer;
      if (input.explanation !== undefined) updateData.explanation = input.explanation;
      if (input.difficulty !== undefined) updateData.difficulty = input.difficulty;
      if (input.imageUrl !== undefined) updateData.imageUrl = input.imageUrl;

      await db
        .update(questions)
        .set(updateData)
        .where(and(eq(questions.id, input.id), eq(questions.userId, ctx.user.id)));

      return { success: true };
    }),

  // 删除题目
  delete: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .delete(userAnswers)
        .where(and(eq(userAnswers.questionId, input.id), eq(userAnswers.userId, ctx.user.id)));
      await db
        .delete(wrongAnswers)
        .where(and(eq(wrongAnswers.questionId, input.id), eq(wrongAnswers.userId, ctx.user.id)));
      await db
        .delete(questions)
        .where(and(eq(questions.id, input.id), eq(questions.userId, ctx.user.id)));
      return { success: true };
    }),

  // 批量删除题目
  deleteMany: authedQuery
    .input(z.object({ ids: z.array(z.number()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      for (const id of input.ids) {
        await db
          .delete(userAnswers)
          .where(and(eq(userAnswers.questionId, id), eq(userAnswers.userId, ctx.user.id)));
        await db
          .delete(wrongAnswers)
          .where(and(eq(wrongAnswers.questionId, id), eq(wrongAnswers.userId, ctx.user.id)));
        await db
          .delete(questions)
          .where(and(eq(questions.id, id), eq(questions.userId, ctx.user.id)));
      }
      return { success: true, count: input.ids.length };
    }),

  // 提交答案
  submitAnswer: authedQuery
    .input(
      z.object({
        questionId: z.number(),
        userAnswer: z.string(),
        timeSpent: z.number().optional(), // 秒
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();

      // 获取题目
      const [question] = await db
        .select()
        .from(questions)
        .where(and(eq(questions.id, input.questionId), eq(questions.userId, ctx.user.id)));

      if (!question) throw new Error("题目不存在");

      // AI评估答案
      const [setting] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, ctx.user.id));

      const evaluation = await evaluateAnswer(
        question.content,
        question.correctAnswer,
        input.userAnswer,
        question.questionType,
        setting?.aiApiKey || undefined,
        setting?.aiApiEndpoint || undefined,
        setting?.aiModel || undefined
      );

      // 保存答题记录
      const [{ id: answerId }] = await db
        .insert(userAnswers)
        .values({
          userId: ctx.user.id,
          questionId: input.questionId,
          userAnswer: input.userAnswer,
          isCorrect: evaluation.isCorrect,
          score: evaluation.score,
          timeSpent: input.timeSpent,
        })
        .$returningId();

      // 如果答错，加入错题本
      if (!evaluation.isCorrect) {
        const existing = await db
          .select()
          .from(wrongAnswers)
          .where(
            and(
              eq(wrongAnswers.userId, ctx.user.id),
              eq(wrongAnswers.questionId, input.questionId)
            )
          );

        if (existing.length > 0) {
          await db
            .update(wrongAnswers)
            .set({
              wrongCount: existing[0].wrongCount + 1,
              lastWrongAt: new Date(),
              userAnswer: input.userAnswer,
              mastered: false,
            })
            .where(eq(wrongAnswers.id, existing[0].id));
        } else {
          await db.insert(wrongAnswers).values({
            userId: ctx.user.id,
            questionId: input.questionId,
            userAnswer: input.userAnswer,
            wrongCount: 1,
            lastWrongAt: new Date(),
            mastered: false,
          });
        }
      } else {
        // 如果答对，更新错题本中的复习次数
        const existing = await db
          .select()
          .from(wrongAnswers)
          .where(
            and(
              eq(wrongAnswers.userId, ctx.user.id),
              eq(wrongAnswers.questionId, input.questionId)
            )
          );

        if (existing.length > 0) {
          await db
            .update(wrongAnswers)
            .set({
              reviewCount: existing[0].reviewCount + 1,
              mastered: existing[0].reviewCount >= 2, // 复习2次后标记为掌握
            })
            .where(eq(wrongAnswers.id, existing[0].id));
        }
      }

      return {
        answerId,
        isCorrect: evaluation.isCorrect,
        score: evaluation.score,
        feedback: evaluation.feedback,
        mastery: evaluation.mastery,
        explanation: question.explanation,
      };
    }),

  // 获取错题本
  getWrongAnswers: authedQuery
    .input(
      z
        .object({
          subjectId: z.number().optional(),
          mastered: z.boolean().optional(),
          limit: z.number().default(50),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const conditions = [eq(wrongAnswers.userId, ctx.user.id)];

      if (input?.mastered !== undefined) {
        conditions.push(eq(wrongAnswers.mastered, input.mastered));
      }

      const wrongs = await db
        .select()
        .from(wrongAnswers)
        .where(and(...conditions))
        .orderBy(desc(wrongAnswers.lastWrongAt))
        .limit(input?.limit || 50);

      // 关联题目信息
      const questionIds = wrongs.map((w) => w.questionId);
      const qs = questionIds.length > 0
        ? await db
            .select()
            .from(questions)
            .where(eq(questions.userId, ctx.user.id))
            .then((rows) => rows.filter((q) => questionIds.includes(q.id)))
        : [];

      const qMap = new Map(qs.map((q) => [q.id, q]));

      return wrongs.map((w) => ({
        ...w,
        question: qMap.get(w.questionId) || null,
      }));
    }),

  // 标记错题为已掌握
  markMastered: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await getDb()
        .update(wrongAnswers)
        .set({ mastered: true, reviewCount: sql`${wrongAnswers.reviewCount} + 1` })
        .where(and(eq(wrongAnswers.id, input.id), eq(wrongAnswers.userId, ctx.user.id)));

      return { success: true };
    }),

  // 获取答题统计
  getStats: authedQuery.query(async ({ ctx }) => {
    const db = getDb();

    const allAnswers = await db
      .select()
      .from(userAnswers)
      .where(eq(userAnswers.userId, ctx.user.id));

    const totalQuestions = allAnswers.length;
    const correctCount = allAnswers.filter((a) => a.isCorrect).length;
    const avgScore = totalQuestions > 0
      ? Math.round(allAnswers.reduce((sum, a) => sum + a.score, 0) / totalQuestions)
      : 0;

    const wrongCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(wrongAnswers)
      .where(and(eq(wrongAnswers.userId, ctx.user.id), eq(wrongAnswers.mastered, false)))
      .then((r) => r[0]?.count || 0);

    return {
      totalQuestions,
      correctCount,
      wrongCount,
      accuracy: totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0,
      avgScore,
    };
  }),
});
