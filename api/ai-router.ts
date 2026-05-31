import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { aiConversations, aiAnalysisTasks, subjects, knowledgeNodes, skillDimensions, studyLogs } from "@db/schema";
import { eq, and, desc } from "drizzle-orm";
import { aiAssistantChat, generateStudyPlan } from "./lib/ai";
import { userSettings } from "@db/schema";

export const aiRouter = createRouter({
  // 获取对话历史
  getConversation: authedQuery
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      return getDb()
        .select()
        .from(aiConversations)
        .where(
          and(
            eq(aiConversations.userId, ctx.user.id),
            eq(aiConversations.sessionId, input.sessionId)
          )
        )
        .orderBy(aiConversations.createdAt);
    }),

  // 发送消息给AI助手
  chat: authedQuery
    .input(
      z.object({
        sessionId: z.string(),
        message: z.string().min(1),
        contextType: z.enum(["general", "subject", "skill", "study"]).default("general"),
        contextId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // 保存用户消息
      await getDb().insert(aiConversations).values({
        userId: ctx.user.id,
        sessionId: input.sessionId,
        role: "user",
        content: input.message,
        metadata: JSON.stringify({
          contextType: input.contextType,
          contextId: input.contextId,
        }),
      });

      // 构建上下文数据
      const contextData: Record<string, unknown> = {};

      if (input.contextType === "subject" && input.contextId) {
        const [subject] = await getDb()
          .select()
          .from(subjects)
          .where(eq(subjects.id, input.contextId));
        const nodes = await getDb()
          .select()
          .from(knowledgeNodes)
          .where(eq(knowledgeNodes.subjectId, input.contextId));
        contextData.subject = subject;
        contextData.knowledgeNodes = nodes;
      }

      if (input.contextType === "skill" && input.contextId) {
        const [skill] = await getDb()
          .select()
          .from(skillDimensions)
          .where(eq(skillDimensions.id, input.contextId));
        contextData.skill = skill;
      }

      // 获取最近对话历史
      const recentMessages = await getDb()
        .select()
        .from(aiConversations)
        .where(
          and(
            eq(aiConversations.userId, ctx.user.id),
            eq(aiConversations.sessionId, input.sessionId)
          )
        )
        .orderBy(desc(aiConversations.createdAt))
        .limit(20);

      const messages = [...recentMessages]
        .reverse()
        .map((m) => ({ role: m.role, content: m.content }));

      // 读取用户AI配置
      const [setting] = await getDb()
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, ctx.user.id));

      // 调用AI
      const response = await aiAssistantChat(
        messages,
        contextData,
        setting?.aiApiKey || undefined,
        setting?.aiApiEndpoint || undefined,
        setting?.aiModel || undefined
      );

      // 保存AI回复
      await getDb().insert(aiConversations).values({
        userId: ctx.user.id,
        sessionId: input.sessionId,
        role: "assistant",
        content: response,
      });

      return { response };
    }),

  // 清除对话历史
  clearConversation: authedQuery
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await getDb()
        .delete(aiConversations)
        .where(
          and(
            eq(aiConversations.userId, ctx.user.id),
            eq(aiConversations.sessionId, input.sessionId)
          )
        );
      return { success: true };
    }),

  // 获取分析任务列表
  getTasks: authedQuery.query(async ({ ctx }) => {
    return getDb()
      .select()
      .from(aiAnalysisTasks)
      .where(eq(aiAnalysisTasks.userId, ctx.user.id))
      .orderBy(desc(aiAnalysisTasks.createdAt));
  }),

  // 生成学习计划
  generatePlan: authedQuery
    .input(
      z.object({
        subjectId: z.number(),
        dailyMinutes: z.number().min(10).default(120),
        userLevel: z.enum(["beginner", "intermediate", "advanced"]).default("intermediate"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [subject] = await getDb()
        .select()
        .from(subjects)
        .where(and(eq(subjects.id, input.subjectId), eq(subjects.userId, ctx.user.id)));

      if (!subject) throw new Error("科目不存在");

      const nodes = await getDb()
        .select()
        .from(knowledgeNodes)
        .where(eq(knowledgeNodes.subjectId, input.subjectId));

      if (nodes.length === 0) throw new Error("该科目还没有知识树，请先进行AI分析");

      // 读取用户AI配置
      const [setting] = await getDb()
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, ctx.user.id));

      const result = await generateStudyPlan(
        subject.title,
        nodes.map((n) => ({
          title: n.title,
          level: n.level,
          estimatedMinutes: n.estimatedMinutes || 30,
          difficulty: n.difficulty,
        })),
        input.dailyMinutes,
        input.userLevel,
        setting?.aiApiKey || undefined,
        setting?.aiApiEndpoint || undefined,
        setting?.aiModel || undefined
      );

      // 创建分析任务记录
      await getDb().insert(aiAnalysisTasks).values({
        userId: ctx.user.id,
        subjectId: input.subjectId,
        taskType: "study_plan",
        status: "completed",
        input: JSON.stringify({ dailyMinutes: input.dailyMinutes, userLevel: input.userLevel }),
        result: JSON.stringify(result),
      });

      return result;
    }),

  // 获取最近的AI反馈
  getRecentFeedback: authedQuery
    .input(z.object({ limit: z.number().default(5) }))
    .query(async ({ ctx, input }) => {
      return getDb()
        .select()
        .from(studyLogs)
        .where(and(eq(studyLogs.userId, ctx.user.id)))
        .orderBy(desc(studyLogs.createdAt))
        .limit(input.limit);
    }),
});
