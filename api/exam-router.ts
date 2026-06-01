import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { examPapers, questions } from "@db/schema";
import { eq, and, desc } from "drizzle-orm";

export const examRouter = createRouter({
  // 列出所有试卷
  list: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const papers = await db
      .select()
      .from(examPapers)
      .where(eq(examPapers.userId, ctx.user.id))
      .orderBy(desc(examPapers.createdAt));

    return papers;
  }),

  // 获取单个试卷详情（包含题目内容）
  getById: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();

      const [paper] = await db
        .select()
        .from(examPapers)
        .where(and(eq(examPapers.id, input.id), eq(examPapers.userId, ctx.user.id)));

      if (!paper) throw new Error("试卷不存在");

      // 获取题目详情
      const questionIds = (() => {
        try {
          return JSON.parse(paper.questionIds);
        } catch {
          return [];
        }
      })();

      if (questionIds.length === 0) {
        return { paper, questions: [] };
      }

      const qs = await db
        .select()
        .from(questions)
        .where(and(eq(questions.userId, ctx.user.id)));

      const paperQuestions = qs.filter((q) => questionIds.includes(q.id));

      return { paper, questions: paperQuestions };
    }),

  // 创建试卷
  create: authedQuery
    .input(
      z.object({
        title: z.string().min(1).max(255),
        description: z.string().optional(),
        questionIds: z.array(z.number()).min(1),
        subjectId: z.number().optional(),
        timeLimit: z.number().min(1).max(300).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();

      // 获取题目详情用于计算总分
      const qs = await db
        .select()
        .from(questions)
        .where(and(eq(questions.userId, ctx.user.id)));

      const selectedQuestions = qs.filter((q) => input.questionIds.includes(q.id));

      if (selectedQuestions.length === 0) {
        throw new Error("未找到有效的题目");
      }

      // 提取关联的知识点
      const nodeIds = selectedQuestions
        .map((q) => q.nodeId)
        .filter(Boolean);

      const [{ id }] = await db
        .insert(examPapers)
        .values({
          userId: ctx.user.id,
          title: input.title,
          description: input.description || null,
          questionIds: JSON.stringify(input.questionIds),
          subjectId: input.subjectId || null,
          knowledgeNodeIds: nodeIds.length > 0 ? JSON.stringify(nodeIds) : null,
          totalQuestions: selectedQuestions.length,
          totalScore: selectedQuestions.length * 10, // 每题默认10分
          timeLimit: input.timeLimit || null,
        })
        .$returningId();

      return { id, success: true };
    }),

  // 更新试卷
  update: authedQuery
    .input(
      z.object({
        id: z.number(),
        title: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
        questionIds: z.array(z.number()).min(1).optional(),
        timeLimit: z.number().min(1).max(300).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const updateData: any = {};

      if (input.title !== undefined) updateData.title = input.title;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.timeLimit !== undefined) updateData.timeLimit = input.timeLimit;

      if (input.questionIds !== undefined) {
        updateData.questionIds = JSON.stringify(input.questionIds);
        updateData.totalQuestions = input.questionIds.length;
        updateData.totalScore = input.questionIds.length * 10;

        // 更新知识点关联
        const qs = await db
          .select()
          .from(questions)
          .where(and(eq(questions.userId, ctx.user.id)));
        const selectedQuestions = qs.filter((q) => input.questionIds?.includes(q.id));
        const nodeIds = selectedQuestions.map((q) => q.nodeId).filter(Boolean);
        if (nodeIds.length > 0) {
          updateData.knowledgeNodeIds = JSON.stringify(nodeIds);
        }
      }

      await db
        .update(examPapers)
        .set(updateData)
        .where(and(eq(examPapers.id, input.id), eq(examPapers.userId, ctx.user.id)));

      return { success: true };
    }),

  // 删除试卷
  delete: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .delete(examPapers)
        .where(and(eq(examPapers.id, input.id), eq(examPapers.userId, ctx.user.id)));
      return { success: true };
    }),
});
