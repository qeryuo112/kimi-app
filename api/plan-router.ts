import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { plans, planSubjects, subjects, knowledgeNodes, knowledgeEdges, skillDimensions, userSettings } from "@db/schema";
import { eq, and, desc } from "drizzle-orm";
import { searchAndAnalyzeSubjects, generateRoundAndMonthlyPlan, generateWeeklyPlan, generateDailyPlan, analyzeContentForKnowledgeTree, analyzeContentForSkills } from "./lib/ai";

export const planRouter = createRouter({
  // 列出用户的所有计划
  list: authedQuery.query(async ({ ctx }) => {
    return getDb()
      .select()
      .from(plans)
      .where(eq(plans.userId, ctx.user.id))
      .orderBy(desc(plans.createdAt));
  }),

  // 获取单个计划详情（含关联科目）
  getById: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const [plan] = await db
        .select()
        .from(plans)
        .where(and(eq(plans.id, input.id), eq(plans.userId, ctx.user.id)));

      if (!plan) return null;

      const ps = await db
        .select()
        .from(planSubjects)
        .where(eq(planSubjects.planId, plan.id));

      const subjectIds = ps.map((p) => p.subjectId);
      const planSubs = subjectIds.length > 0
        ? await db
            .select()
            .from(subjects)
            .where(and(eq(subjects.userId, ctx.user.id)))
            .then((rows) => rows.filter((s) => subjectIds.includes(s.id)))
        : [];

      return { ...plan, subjects: planSubs, planSubjects: ps };
    }),

  // 创建计划
  create: authedQuery
    .input(
      z.object({
        title: z.string().min(1).max(255),
        description: z.string().optional(),
        goal: z.string().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        dailyMinutes: z.number().min(10).default(120),
        totalMonths: z.number().min(1).max(36).default(3),
        reviewRounds: z.number().min(1).max(10).default(3),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [{ id }] = await getDb()
        .insert(plans)
        .values({
          ...input,
          userId: ctx.user.id,
          status: "active",
        })
        .$returningId();

      return getDb()
        .select()
        .from(plans)
        .where(eq(plans.id, id))
        .then(([p]) => p);
    }),

  // 更新计划
  update: authedQuery
    .input(
      z.object({
        id: z.number(),
        title: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
        goal: z.string().optional(),
        status: z.enum(["active", "paused", "completed"]).optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        dailyMinutes: z.number().min(10).optional(),
        totalMonths: z.number().min(1).max(36).optional(),
        reviewRounds: z.number().min(1).max(10).optional(),
        aiPlan: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await getDb()
        .update(plans)
        .set(data)
        .where(and(eq(plans.id, id), eq(plans.userId, ctx.user.id)));

      return getDb()
        .select()
        .from(plans)
        .where(eq(plans.id, id))
        .then(([p]) => p);
    }),

  // 删除计划
  delete: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .delete(planSubjects)
        .where(eq(planSubjects.planId, input.id));
      await db
        .delete(plans)
        .where(and(eq(plans.id, input.id), eq(plans.userId, ctx.user.id)));
      return { success: true };
    }),

  // AI联网搜索科目并自动分析
  aiSearchSubjects: authedQuery
    .input(z.object({ goal: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [setting] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, ctx.user.id));

      const result = await searchAndAnalyzeSubjects(
        input.goal,
        setting?.aiApiKey || undefined,
        setting?.aiApiEndpoint || undefined,
        setting?.aiModel || undefined
      );

      return result.subjects;
    }),

  // 将AI搜索的科目添加到计划，并自动分析生成知识树
  addSubjectsToPlan: authedQuery
    .input(
      z.object({
        planId: z.number(),
        subjects: z.array(
          z.object({
            title: z.string(),
            description: z.string().optional(),
            category: z.string().optional(),
            difficulty: z.number().default(3),
            priority: z.number().default(2),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [setting] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, ctx.user.id));

      const createdSubjects = [];

      for (let i = 0; i < input.subjects.length; i++) {
        const s = input.subjects[i];

        // 1. 创建科目（先设为分析中）
        const [{ id: subjectId }] = await db
          .insert(subjects)
          .values({
            userId: ctx.user.id,
            title: s.title,
            description: s.description,
            category: s.category,
            difficulty: s.difficulty,
            priority: s.priority,
            status: "analyzing",
            sourceType: "other",
          })
          .$returningId();

        // 关联到计划
        await db.insert(planSubjects).values({
          planId: input.planId,
          subjectId,
          priority: s.priority,
          orderIndex: i,
        });

        // 2. AI联网分析该科目，生成知识树
        try {
          const content = `${s.title}\n${s.description || ""}`;

          const [knowledgeResult, skillsResult] = await Promise.all([
            analyzeContentForKnowledgeTree(
              content,
              s.title,
              setting?.aiApiKey || undefined,
              setting?.aiApiEndpoint || undefined,
              setting?.aiModel || undefined
            ),
            analyzeContentForSkills(
              content,
              s.title,
              setting?.aiApiKey || undefined,
              setting?.aiApiEndpoint || undefined,
              setting?.aiModel || undefined
            ),
          ]);

          // 3. 保存知识节点
          const titleToIdMap = new Map<string, number>();
          for (const node of knowledgeResult.nodes) {
            const [{ id: nodeId }] = await db
              .insert(knowledgeNodes)
              .values({
                subjectId,
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

          // 更新父节点关系
          for (const node of knowledgeResult.nodes) {
            if (node.parentTitle && titleToIdMap.has(node.parentTitle)) {
              await db
                .update(knowledgeNodes)
                .set({ parentId: titleToIdMap.get(node.parentTitle) })
                .where(eq(knowledgeNodes.id, titleToIdMap.get(node.title)!));
            }
          }

          // 保存知识边
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

          // 4. 保存技能维度
          const skillNameToIdMap = new Map<string, number>();
          for (const skill of skillsResult.skills) {
            const [{ id: skillId }] = await db
              .insert(skillDimensions)
              .values({
                userId: ctx.user.id,
                subjectId,
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

          // 更新技能的父关系
          for (const skill of skillsResult.skills) {
            if (skill.parentName && skillNameToIdMap.has(skill.parentName)) {
              await db
                .update(skillDimensions)
                .set({ parentId: skillNameToIdMap.get(skill.parentName) })
                .where(eq(skillDimensions.id, skillNameToIdMap.get(skill.name)!));
            }
          }

          // 5. 更新科目状态为已分析，并同步AI判定的难度/优先级
          await db
            .update(subjects)
            .set({
              status: "analyzed",
              difficulty: knowledgeResult.subjectDifficulty,
              priority: knowledgeResult.subjectPriority,
            })
            .where(eq(subjects.id, subjectId));

          createdSubjects.push({ id: subjectId, title: s.title, analyzed: true, nodesCount: knowledgeResult.nodes.length });
        } catch (err) {
          // 分析失败，标记为错误状态
          await db
            .update(subjects)
            .set({ status: "error" })
            .where(eq(subjects.id, subjectId));
          createdSubjects.push({ id: subjectId, title: s.title, analyzed: false, error: (err as Error).message });
        }
      }

      return { success: true, subjects: createdSubjects };
    }),

  // AI生成复习计划（两层：月计划 + 日计划）
  aiGenerateSchedule: authedQuery
    .input(z.object({ id: z.number(), requirements: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [plan] = await db
        .select()
        .from(plans)
        .where(and(eq(plans.id, input.id), eq(plans.userId, ctx.user.id)));

      if (!plan) throw new Error("计划不存在");

      // 获取计划关联的科目
      const ps = await db
        .select()
        .from(planSubjects)
        .where(eq(planSubjects.planId, plan.id));

      const subjectIds = ps.map((p) => p.subjectId);
      if (subjectIds.length === 0) throw new Error("请先添加科目到计划");

      const planSubs = await db
        .select()
        .from(subjects)
        .where(and(eq(subjects.userId, ctx.user.id)))
        .then((rows) => rows.filter((s) => subjectIds.includes(s.id)));

      // 检查每个科目是否已分析（有知识节点）
      const unanalyzedSubjects: string[] = [];
      const subjectNodesMap = new Map<number, Array<{ title: string; estimatedMinutes: number; difficulty: number; importance: number }>>();
      const subjectNodeTitlesMap = new Map<number, string[]>();

      for (const sub of planSubs) {
        const nodes = await db
          .select()
          .from(knowledgeNodes)
          .where(
            and(
              eq(knowledgeNodes.subjectId, sub.id),
              eq(knowledgeNodes.userId, ctx.user.id)
            )
          );

        if (nodes.length === 0) {
          unanalyzedSubjects.push(sub.title);
        } else {
          subjectNodesMap.set(sub.id, nodes.map((n) => ({
            title: n.title,
            estimatedMinutes: n.estimatedMinutes || 30,
            difficulty: n.difficulty || 3,
            importance: n.importance || 3,
          })));
          subjectNodeTitlesMap.set(sub.id, nodes.map((n) => n.title));
        }
      }

      if (unanalyzedSubjects.length > 0) {
        throw new Error(`以下科目尚未分析，请先使用AI分析功能生成知识树：${unanalyzedSubjects.join("、")}`);
      }

      const [setting] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, ctx.user.id));

      const startDate = plan.startDate
        ? new Date(plan.startDate).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0];

      // 使用用户设定的参数
      const totalMonths = plan.totalMonths || 3;
      const reviewRounds = plan.reviewRounds || 3;

      // 第一层：生成轮次计划 + 月计划
      const roundMonthlyResult = await generateRoundAndMonthlyPlan(
        planSubs.map((s) => ({
          title: s.title,
          priority: s.priority,
          difficulty: s.difficulty,
          knowledgeNodes: subjectNodeTitlesMap.get(s.id) || [],
        })),
        plan.dailyMinutes,
        startDate,
        totalMonths,
        reviewRounds,
        input.requirements || undefined,
        setting?.aiApiKey || undefined,
        setting?.aiApiEndpoint || undefined,
        setting?.aiModel || undefined
      );

      // 第二层：生成周计划
      const monthlyContext = roundMonthlyResult.months
        .map((m) => `第${m.month}月(${m.monthName})：${m.focus}；科目：${m.subjects?.join("、")}；目标：${m.goals?.join("、")}`)
        .join("\n");

      const totalWeeks = Math.ceil(totalMonths * 4.3);
      const weeklyResult = await generateWeeklyPlan(
        planSubs.map((s) => ({
          title: s.title,
          priority: s.priority,
          difficulty: s.difficulty,
          knowledgeNodes: subjectNodesMap.get(s.id) || [],
        })),
        plan.dailyMinutes,
        totalWeeks,
        monthlyContext,
        input.requirements || undefined,
        setting?.aiApiKey || undefined,
        setting?.aiApiEndpoint || undefined,
        setting?.aiModel || undefined
      );

      // 第三层：生成日计划
      const weeklyContext = weeklyResult.weeks
        .map((w) => `第${w.week}周(第${w.month}月)：${w.focus}；知识点：${w.knowledgeNodes?.join("、")}`)
        .join("\n");

      const totalDays = totalMonths * 30;
      const dailyResult = await generateDailyPlan(
        planSubs.map((s) => ({
          title: s.title,
          priority: s.priority,
          difficulty: s.difficulty,
          knowledgeNodes: subjectNodesMap.get(s.id) || [],
        })),
        plan.dailyMinutes,
        startDate,
        totalDays,
        weeklyContext,
        input.requirements || undefined,
        setting?.aiApiKey || undefined,
        setting?.aiApiEndpoint || undefined,
        setting?.aiModel || undefined
      );

      const fullPlan = {
        roundPlan: roundMonthlyResult.rounds,
        monthlyPlan: roundMonthlyResult.months,
        weeklyPlan: weeklyResult.weeks,
        dailyPlan: dailyResult.days,
      };

      // 保存AI计划
      await db
        .update(plans)
        .set({ aiPlan: JSON.stringify(fullPlan) })
        .where(eq(plans.id, input.id));

      return fullPlan;
    }),

  // 删除生成的复习计划
  deleteSchedule: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await getDb()
        .update(plans)
        .set({ aiPlan: null })
        .where(and(eq(plans.id, input.id), eq(plans.userId, ctx.user.id)));
      return { success: true };
    }),
});
