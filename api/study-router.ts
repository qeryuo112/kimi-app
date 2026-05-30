import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { studyLogs, studyStats, knowledgeNodes, subjects } from "@db/schema";
import { eq, and, desc, gte } from "drizzle-orm";

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

  // 删除学习记录
  delete: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await getDb()
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
});
