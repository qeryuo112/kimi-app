import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { subjects, knowledgeNodes, knowledgeEdges, skillDimensions, userSettings } from "@db/schema";
import { eq, and, desc } from "drizzle-orm";
import {
  analyzeContentForKnowledgeTree,
  analyzeContentForSkills,
} from "./lib/ai";

export const subjectRouter = createRouter({
  // 列出用户的所有科目
  list: authedQuery.query(async ({ ctx }) => {
    return getDb()
      .select()
      .from(subjects)
      .where(eq(subjects.userId, ctx.user.id))
      .orderBy(desc(subjects.updatedAt));
  }),

  // 获取单个科目详情
  getById: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const [subject] = await getDb()
        .select()
        .from(subjects)
        .where(and(eq(subjects.id, input.id), eq(subjects.userId, ctx.user.id)));
      return subject || null;
    }),

  // 创建科目（导入内容）
  create: authedQuery
    .input(
      z.object({
        title: z.string().min(1).max(255),
        description: z.string().optional(),
        category: z.string().optional(),
        sourceType: z.enum(["book", "course", "article", "manual", "other"]).default("other"),
        sourceContent: z.string().optional(),
        color: z.string().default("#3b82f6"),
        icon: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [{ id }] = await getDb()
        .insert(subjects)
        .values({
          ...input,
          userId: ctx.user.id,
          status: input.sourceContent ? "imported" : "analyzed",
        })
        .$returningId();

      return getDb()
        .select()
        .from(subjects)
        .where(eq(subjects.id, id))
        .then(([s]) => s);
    }),

  // 更新科目
  update: authedQuery
    .input(
      z.object({
        id: z.number(),
        title: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
        category: z.string().optional(),
        status: z.enum(["imported", "analyzing", "analyzed", "error"]).optional(),
        progress: z.number().min(0).max(100).optional(),
        difficulty: z.number().min(1).max(5).optional(),
        priority: z.number().min(1).max(5).optional(),
        color: z.string().optional(),
        icon: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await getDb()
        .update(subjects)
        .set(data)
        .where(and(eq(subjects.id, id), eq(subjects.userId, ctx.user.id)));

      return getDb()
        .select()
        .from(subjects)
        .where(eq(subjects.id, id))
        .then(([s]) => s);
    }),

  // 删除科目（级联删除知识树和技能）
  delete: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      // 删除关联的知识边
      await db
        .delete(knowledgeEdges)
        .where(and(eq(knowledgeEdges.userId, ctx.user.id)));
      // 删除知识节点
      await db
        .delete(knowledgeNodes)
        .where(and(eq(knowledgeNodes.subjectId, input.id), eq(knowledgeNodes.userId, ctx.user.id)));
      // 删除技能维度
      await db
        .delete(skillDimensions)
        .where(and(eq(skillDimensions.subjectId, input.id), eq(skillDimensions.userId, ctx.user.id)));
      // 删除科目
      await db
        .delete(subjects)
        .where(and(eq(subjects.id, input.id), eq(subjects.userId, ctx.user.id)));

      return { success: true };
    }),

  // AI分析科目内容，生成知识树和技能维度（AI自动判定难度/优先级）
  analyze: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();

      // 获取科目信息
      const [subject] = await db
        .select()
        .from(subjects)
        .where(and(eq(subjects.id, input.id), eq(subjects.userId, ctx.user.id)));

      if (!subject || !subject.sourceContent) {
        throw new Error("科目不存在或没有内容可供分析");
      }

      // 更新状态为分析中
      await db
        .update(subjects)
        .set({ status: "analyzing" })
        .where(eq(subjects.id, input.id));

      try {
        // 读取用户AI配置
        const [setting] = await db
          .select()
          .from(userSettings)
          .where(eq(userSettings.userId, ctx.user.id));

        // 1. AI分析生成知识树（同时返回科目难度和优先级）
        const knowledgeResult = await analyzeContentForKnowledgeTree(
          subject.sourceContent,
          subject.title,
          setting?.aiApiKey || undefined,
          setting?.aiApiEndpoint || undefined,
          setting?.aiModel || undefined
        );

        // 2. AI分析生成技能维度
        const skillsResult = await analyzeContentForSkills(
          subject.sourceContent,
          subject.title,
          setting?.aiApiKey || undefined,
          setting?.aiApiEndpoint || undefined,
          setting?.aiModel || undefined
        );

        // 3. 保存知识节点到数据库
        const titleToIdMap = new Map<string, number>();

        for (const node of knowledgeResult.nodes) {
          const [{ id: nodeId }] = await db
            .insert(knowledgeNodes)
            .values({
              subjectId: input.id,
              userId: ctx.user.id,
              title: node.title,
              description: node.description,
              level: node.level,
              orderIndex: node.orderIndex,
              importance: node.importance,
              difficulty: node.difficulty,
              estimatedMinutes: node.estimatedMinutes,
              tags: JSON.stringify(node.tags || []),
              isLeaf: !knowledgeResult.nodes.some((n) => n.parentTitle === node.title),
            })
            .$returningId();

          titleToIdMap.set(node.title, nodeId);
        }

        // 4. 更新父节点关系
        for (const node of knowledgeResult.nodes) {
          if (node.parentTitle && titleToIdMap.has(node.parentTitle)) {
            await db
              .update(knowledgeNodes)
              .set({ parentId: titleToIdMap.get(node.parentTitle) })
              .where(eq(knowledgeNodes.id, titleToIdMap.get(node.title)!));
          }
        }

        // 5. 保存知识边
        for (const edge of knowledgeResult.edges) {
          const sourceId = titleToIdMap.get(edge.sourceTitle);
          const targetId = titleToIdMap.get(edge.targetTitle);
          if (sourceId && targetId) {
            await db.insert(knowledgeEdges).values({
              userId: ctx.user.id,
              sourceNodeId: sourceId,
              targetNodeId: targetId,
              relationType: edge.relationType as "prerequisite" | "related" | "extends" | "partOf",
              strength: edge.strength,
            });
          }
        }

        // 6. 保存技能维度
        const skillNameToIdMap = new Map<string, number>();

        for (const skill of skillsResult.skills) {
          const [{ id: skillId }] = await db
            .insert(skillDimensions)
            .values({
              userId: ctx.user.id,
              subjectId: input.id,
              name: skill.name,
              description: skill.description,
              category: skill.category,
              icon: skill.icon,
              color: skill.color,
              weight: skill.weight,
              aiGenerated: true,
            })
            .$returningId();

          skillNameToIdMap.set(skill.name, skillId);
        }

        // 7. 更新技能的父关系
        for (const skill of skillsResult.skills) {
          if (skill.parentName && skillNameToIdMap.has(skill.parentName)) {
            await db
              .update(skillDimensions)
              .set({ parentId: skillNameToIdMap.get(skill.parentName) })
              .where(eq(skillDimensions.id, skillNameToIdMap.get(skill.name)!));
          }
        }

        // 8. 更新科目状态为已分析，同时用AI判定的难度和优先级更新科目
        await db
          .update(subjects)
          .set({
            status: "analyzed",
            difficulty: knowledgeResult.subjectDifficulty,
            priority: knowledgeResult.subjectPriority,
          })
          .where(eq(subjects.id, input.id));

        return {
          success: true,
          nodesCount: knowledgeResult.nodes.length,
          skillsCount: skillsResult.skills.length,
          difficulty: knowledgeResult.subjectDifficulty,
          priority: knowledgeResult.subjectPriority,
        };
      } catch (error) {
        // 更新状态为错误
        await db
          .update(subjects)
          .set({ status: "error" })
          .where(eq(subjects.id, input.id));

        throw error;
      }
    }),
});
