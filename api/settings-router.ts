import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { userSettings, appSettings } from "@db/schema";
import { eq } from "drizzle-orm";

const GLOBAL_FILE_SERVER_KEY = "fileServerUrl";

async function getGlobalFileServerUrl(): Promise<string> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, GLOBAL_FILE_SERVER_KEY));
  return row?.value || "";
}

async function setGlobalFileServerUrl(url: string) {
  const db = getDb();
  const existing = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, GLOBAL_FILE_SERVER_KEY));

  if (existing.length === 0) {
    await db.insert(appSettings).values({ key: GLOBAL_FILE_SERVER_KEY, value: url });
  } else {
    await db
      .update(appSettings)
      .set({ value: url })
      .where(eq(appSettings.key, GLOBAL_FILE_SERVER_KEY));
  }
}

export const settingsRouter = createRouter({
  // 获取用户设置（fileServerUrl 为全局值）
  get: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const [settings] = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, ctx.user.id));

    const globalFileServerUrl = await getGlobalFileServerUrl();

    if (!settings) {
      // 创建默认设置
      const [{ id }] = await db
        .insert(userSettings)
        .values({
          userId: ctx.user.id,
        })
        .$returningId();

      const [newSettings] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.id, id));

      return { ...newSettings, fileServerUrl: globalFileServerUrl };
    }

    return { ...settings, fileServerUrl: globalFileServerUrl };
  }),

  // 更新用户设置（fileServerUrl 存到全局配置表）
  update: authedQuery
    .input(
      z.object({
        theme: z.enum(["light", "dark", "system"]).optional(),
        language: z.string().optional(),
        aiModel: z.string().optional(),
        aiApiKey: z.string().optional(),
        aiApiEndpoint: z.string().optional(),
        fileServerUrl: z.string().optional(),
        defaultDifficulty: z.number().min(1).max(5).optional(),
        dailyGoal: z.number().optional(),
        weekGoal: z.number().optional(),
        notifications: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { fileServerUrl, ...userFields } = input;

      // fileServerUrl 仅管理员可修改
      if (fileServerUrl !== undefined) {
        if (ctx.user.role !== "admin") {
          throw new Error("仅管理员可修改文件上传服务器地址");
        }
        await setGlobalFileServerUrl(fileServerUrl);
      }

      // 其他字段更新到用户设置
      const existing = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, ctx.user.id));

      if (existing.length === 0) {
        await db.insert(userSettings).values({ userId: ctx.user.id, ...userFields });
      } else if (Object.keys(userFields).length > 0) {
        await db
          .update(userSettings)
          .set(userFields)
          .where(eq(userSettings.userId, ctx.user.id));
      }

      const [settings] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, ctx.user.id));

      const globalFileServerUrl = await getGlobalFileServerUrl();
      return { ...settings, fileServerUrl: globalFileServerUrl };
    }),
});
