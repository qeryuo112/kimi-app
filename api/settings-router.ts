import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { userSettings } from "@db/schema";
import { eq } from "drizzle-orm";

export const settingsRouter = createRouter({
  // 获取用户设置
  get: authedQuery.query(async ({ ctx }) => {
    const [settings] = await getDb()
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, ctx.user.id));

    if (!settings) {
      // 创建默认设置
      const [{ id }] = await getDb()
        .insert(userSettings)
        .values({
          userId: ctx.user.id,
        })
        .$returningId();

      const [newSettings] = await getDb()
        .select()
        .from(userSettings)
        .where(eq(userSettings.id, id));

      return newSettings;
    }

    return settings;
  }),

  // 更新用户设置
  update: authedQuery
    .input(
      z.object({
        theme: z.enum(["light", "dark", "system"]).optional(),
        language: z.string().optional(),
        aiModel: z.string().optional(),
        aiApiKey: z.string().optional(),
        aiApiEndpoint: z.string().optional(),
        defaultDifficulty: z.number().min(1).max(5).optional(),
        dailyGoal: z.number().optional(),
        weekGoal: z.number().optional(),
        notifications: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await getDb()
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, ctx.user.id));

      if (existing.length === 0) {
        await getDb()
          .insert(userSettings)
          .values({
            userId: ctx.user.id,
            ...input,
          });
      } else {
        await getDb()
          .update(userSettings)
          .set(input)
          .where(eq(userSettings.userId, ctx.user.id));
      }

      return getDb()
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, ctx.user.id))
        .then(([s]) => s);
    }),
});
