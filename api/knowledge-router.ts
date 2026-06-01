import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { knowledgeNodes, knowledgeEdges } from "@db/schema";
import { eq, and } from "drizzle-orm";

export const knowledgeRouter = createRouter({
  // 获取所有知识节点（用于题目关联）
  list: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const nodes = await db
      .select()
      .from(knowledgeNodes)
      .where(eq(knowledgeNodes.userId, ctx.user.id));
    return nodes;
  }),

  // 获取科目的知识树
  getTree: authedQuery
    .input(z.object({ subjectId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();

      const nodes = await db
        .select()
        .from(knowledgeNodes)
        .where(
          and(
            eq(knowledgeNodes.subjectId, input.subjectId),
            eq(knowledgeNodes.userId, ctx.user.id)
          )
        );

      const edges = await db
        .select()
        .from(knowledgeEdges)
        .where(eq(knowledgeEdges.userId, ctx.user.id));

      return { nodes, edges };
    }),

  // 获取单个节点详情
  getNode: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const [node] = await getDb()
        .select()
        .from(knowledgeNodes)
        .where(and(eq(knowledgeNodes.id, input.id), eq(knowledgeNodes.userId, ctx.user.id)));
      return node || null;
    }),

  // 更新节点掌握度
  updateMastery: authedQuery
    .input(
      z.object({
        id: z.number(),
        mastery: z.number().min(0).max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await getDb()
        .update(knowledgeNodes)
        .set({ mastery: input.mastery })
        .where(and(eq(knowledgeNodes.id, input.id), eq(knowledgeNodes.userId, ctx.user.id)));

      return { success: true };
    }),

  // 更新节点信息
  updateNode: authedQuery
    .input(
      z.object({
        id: z.number(),
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        mastery: z.number().min(0).max(100).optional(),
        importance: z.number().min(1).max(5).optional(),
        difficulty: z.number().min(1).max(5).optional(),
        estimatedMinutes: z.number().optional(),
        tags: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await getDb()
        .update(knowledgeNodes)
        .set(data)
        .where(and(eq(knowledgeNodes.id, id), eq(knowledgeNodes.userId, ctx.user.id)));

      return { success: true };
    }),

  // 创建节点
  createNode: authedQuery
    .input(
      z.object({
        subjectId: z.number(),
        parentId: z.number().optional(),
        title: z.string().min(1),
        description: z.string().optional(),
        level: z.number().min(1).max(5).default(1),
        importance: z.number().min(1).max(5).default(3),
        difficulty: z.number().min(1).max(5).default(3),
        estimatedMinutes: z.number().default(30),
        tags: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [{ id }] = await getDb()
        .insert(knowledgeNodes)
        .values({
          ...input,
          userId: ctx.user.id,
        })
        .$returningId();

      return getDb()
        .select()
        .from(knowledgeNodes)
        .where(eq(knowledgeNodes.id, id))
        .then(([n]) => n);
    }),

  // 删除节点
  deleteNode: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await getDb()
        .delete(knowledgeEdges)
        .where(
          and(
            eq(knowledgeEdges.userId, ctx.user.id),
            eq(knowledgeEdges.sourceNodeId, input.id)
          )
        );
      await getDb()
        .delete(knowledgeEdges)
        .where(
          and(
            eq(knowledgeEdges.userId, ctx.user.id),
            eq(knowledgeEdges.targetNodeId, input.id)
          )
        );
      await getDb()
        .delete(knowledgeNodes)
        .where(and(eq(knowledgeNodes.id, input.id), eq(knowledgeNodes.userId, ctx.user.id)));

      return { success: true };
    }),

  // 添加知识边
  createEdge: authedQuery
    .input(
      z.object({
        sourceNodeId: z.number(),
        targetNodeId: z.number(),
        relationType: z.enum(["prerequisite", "related", "extends", "partOf"]).default("related"),
        strength: z.number().min(1).max(5).default(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await getDb().insert(knowledgeEdges).values({
        userId: ctx.user.id,
        ...input,
      });
      return { success: true };
    }),

  // 删除知识边
  deleteEdge: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await getDb()
        .delete(knowledgeEdges)
        .where(and(eq(knowledgeEdges.id, input.id), eq(knowledgeEdges.userId, ctx.user.id)));
      return { success: true };
    }),
});
