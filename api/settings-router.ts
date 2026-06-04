import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { userSettings, appSettings } from "@db/schema";
import { eq } from "drizzle-orm";

const GLOBAL_FILE_SERVER_KEY = "fileServerUrl";
const AI_MAX_TOKENS_KEY = "aiMaxTokens";
const AI_ENABLE_THINKING_KEY = "aiEnableThinking";
const AI_TEMPERATURE_KEY = "aiTemperature";

async function getGlobalSetting(key: string): Promise<string> {
  const db = getDb();
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key));
  return row?.value || "";
}

async function setGlobalSetting(key: string, value: string) {
  const db = getDb();
  const existing = await db.select().from(appSettings).where(eq(appSettings.key, key));
  if (existing.length === 0) {
    await db.insert(appSettings).values({ key, value });
  } else {
    await db.update(appSettings).set({ value }).where(eq(appSettings.key, key));
  }
}

export const settingsRouter = createRouter({
  // 获取用户设置（fileServerUrl / aiMaxTokens 为全局值）
  get: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const [settings] = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, ctx.user.id));

    const globalFileServerUrl = await getGlobalSetting(GLOBAL_FILE_SERVER_KEY);
    const aiMaxTokensRaw = await getGlobalSetting(AI_MAX_TOKENS_KEY);
    const aiMaxTokens = aiMaxTokensRaw ? parseInt(aiMaxTokensRaw, 10) : 128000;
    const aiEnableThinking = (await getGlobalSetting(AI_ENABLE_THINKING_KEY)) !== "false";
    const aiTemperatureRaw = await getGlobalSetting(AI_TEMPERATURE_KEY);
    const aiTemperature = aiTemperatureRaw ? parseFloat(aiTemperatureRaw) : 0.5;

    const globalSettings = {
      fileServerUrl: globalFileServerUrl,
      aiMaxTokens,
      aiEnableThinking,
      aiTemperature,
    };

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

      return { ...newSettings, ...globalSettings };
    }

    return { ...settings, ...globalSettings };
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
        aiMaxTokens: z.number().min(1).optional(),
        aiEnableThinking: z.boolean().optional(),
        aiTemperature: z.number().min(0).max(2).optional(),
        defaultDifficulty: z.number().min(1).max(5).optional(),
        dailyGoal: z.number().optional(),
        weekGoal: z.number().optional(),
        notifications: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { fileServerUrl, aiMaxTokens: inputMaxTokens, aiEnableThinking: inputEnableThinking, aiTemperature: inputTemperature, ...userFields } = input;

      // 全局配置仅管理员可修改
      if (fileServerUrl !== undefined) {
        if (ctx.user.role !== "admin") {
          throw new Error("仅管理员可修改文件上传服务器地址");
        }
        await setGlobalSetting(GLOBAL_FILE_SERVER_KEY, fileServerUrl);
      }
      if (inputMaxTokens !== undefined) {
        if (ctx.user.role !== "admin") {
          throw new Error("仅管理员可修改 AI Max Tokens");
        }
        await setGlobalSetting(AI_MAX_TOKENS_KEY, String(inputMaxTokens));
      }
      if (inputEnableThinking !== undefined) {
        if (ctx.user.role !== "admin") {
          throw new Error("仅管理员可修改 AI 思考模式");
        }
        await setGlobalSetting(AI_ENABLE_THINKING_KEY, String(inputEnableThinking));
      }
      if (inputTemperature !== undefined) {
        if (ctx.user.role !== "admin") {
          throw new Error("仅管理员可修改 AI 温度");
        }
        await setGlobalSetting(AI_TEMPERATURE_KEY, String(inputTemperature));
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

      const globalFileServerUrl = await getGlobalSetting(GLOBAL_FILE_SERVER_KEY);
      const aiMaxTokensRaw = await getGlobalSetting(AI_MAX_TOKENS_KEY);
      const aiMaxTokens = aiMaxTokensRaw ? parseInt(aiMaxTokensRaw, 10) : 128000;
      const aiEnableThinking = (await getGlobalSetting(AI_ENABLE_THINKING_KEY)) !== "false";
      const aiTemperatureRaw = await getGlobalSetting(AI_TEMPERATURE_KEY);
      const aiTemperature = aiTemperatureRaw ? parseFloat(aiTemperatureRaw) : 0.5;
      return { ...settings, fileServerUrl: globalFileServerUrl, aiMaxTokens, aiEnableThinking, aiTemperature };
    }),
});
