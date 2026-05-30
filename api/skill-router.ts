import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { skillDimensions, skillAssessments } from "@db/schema";
import { eq, and, desc } from "drizzle-orm";

export const skillRouter = createRouter({
  // 列出用户的所有技能维度
  list: authedQuery.query(async ({ ctx }) => {
    return getDb()
      .select()
      .from(skillDimensions)
      .where(eq(skillDimensions.userId, ctx.user.id))
      .orderBy(desc(skillDimensions.updatedAt));
  }),

  // 获取科目的技能维度
  getBySubject: authedQuery
    .input(z.object({ subjectId: z.number() }))
    .query(async ({ ctx, input }) => {
      return getDb()
        .select()
        .from(skillDimensions)
        .where(
          and(
            eq(skillDimensions.subjectId, input.subjectId),
            eq(skillDimensions.userId, ctx.user.id)
          )
        );
    }),

  // 获取技能详情
  getById: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const [skill] = await getDb()
        .select()
        .from(skillDimensions)
        .where(and(eq(skillDimensions.id, input.id), eq(skillDimensions.userId, ctx.user.id)));

      if (!skill) return null;

      // 获取评估历史
      const assessments = await getDb()
        .select()
        .from(skillAssessments)
        .where(eq(skillAssessments.skillId, input.id))
        .orderBy(desc(skillAssessments.createdAt));

      return { ...skill, assessments };
    }),

  // 创建技能维度
  create: authedQuery
    .input(
      z.object({
        subjectId: z.number().optional(),
        name: z.string().min(1).max(255),
        description: z.string().optional(),
        category: z.string().optional(),
        icon: z.string().optional(),
        color: z.string().default("#10b981"),
        weight: z.number().default(1.0),
        parentId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [{ id }] = await getDb()
        .insert(skillDimensions)
        .values({
          ...input,
          userId: ctx.user.id,
        })
        .$returningId();

      return getDb()
        .select()
        .from(skillDimensions)
        .where(eq(skillDimensions.id, id))
        .then(([s]) => s);
    }),

  // 更新技能维度
  update: authedQuery
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
        category: z.string().optional(),
        icon: z.string().optional(),
        color: z.string().optional(),
        currentLevel: z.number().min(1).optional(),
        experience: z.number().optional(),
        weight: z.number().optional(),
        parentId: z.number().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await getDb()
        .update(skillDimensions)
        .set(data)
        .where(and(eq(skillDimensions.id, id), eq(skillDimensions.userId, ctx.user.id)));

      return getDb()
        .select()
        .from(skillDimensions)
        .where(eq(skillDimensions.id, id))
        .then(([s]) => s);
    }),

  // 删除技能维度
  delete: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await getDb()
        .delete(skillAssessments)
        .where(eq(skillAssessments.skillId, input.id));
      await getDb()
        .delete(skillDimensions)
        .where(and(eq(skillDimensions.id, input.id), eq(skillDimensions.userId, ctx.user.id)));

      return { success: true };
    }),

  // 添加技能评估
  addAssessment: authedQuery
    .input(
      z.object({
        skillId: z.number(),
        score: z.number().min(0).max(100),
        notes: z.string().optional(),
        assessedBy: z.enum(["self", "ai", "system"]).default("self"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await getDb().insert(skillAssessments).values({
        userId: ctx.user.id,
        ...input,
      });

      // 更新技能等级（基于最新评估）
      const recentAssessments = await getDb()
        .select()
        .from(skillAssessments)
        .where(eq(skillAssessments.skillId, input.skillId))
        .orderBy(desc(skillAssessments.createdAt))
        .limit(10);

      const avgScore =
        recentAssessments.reduce((sum, a) => sum + a.score, 0) / recentAssessments.length;
      const newLevel = Math.max(1, Math.min(100, Math.round(avgScore)));

      await getDb()
        .update(skillDimensions)
        .set({
          currentLevel: newLevel,
          experience: newLevel * 10,
          experienceToNext: (newLevel + 1) * 10,
        })
        .where(eq(skillDimensions.id, input.skillId));

      return { success: true, newLevel };
    }),

  // 更新经验值（学习后自动增加）
  addExperience: authedQuery
    .input(
      z.object({
        skillId: z.number(),
        exp: z.number().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [skill] = await getDb()
        .select()
        .from(skillDimensions)
        .where(
          and(eq(skillDimensions.id, input.skillId), eq(skillDimensions.userId, ctx.user.id))
        );

      if (!skill) throw new Error("技能不存在");

      let newExp = skill.experience + input.exp;
      let newLevel = skill.currentLevel;
      let expToNext = skill.experienceToNext;

      // 升级检查
      while (newExp >= expToNext && newLevel < skill.maxLevel) {
        newExp -= expToNext;
        newLevel += 1;
        expToNext = (newLevel + 1) * 10;
      }

      await getDb()
        .update(skillDimensions)
        .set({
          currentLevel: newLevel,
          experience: newExp,
          experienceToNext: expToNext,
        })
        .where(eq(skillDimensions.id, input.skillId));

      return { success: true, newLevel, newExp };
    }),
});
