import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { env } from "./lib/env";
import fs from "fs";
import path from "path";

// 调试日志工具
const PLAN_DEBUG_LOG = path.join(process.cwd(), "plan-debug.log");
function planDebugLog(label: string, data?: unknown) {
  const now = new Date().toISOString();
  const line = data !== undefined
    ? `[${now}] [PLAN-DEBUG] ${label} | ${typeof data === "string" ? data : JSON.stringify(data)}`
    : `[${now}] [PLAN-DEBUG] ${label}`;
  console.log(line);
  try {
    fs.appendFileSync(PLAN_DEBUG_LOG, line + "\n");
  } catch {
    // 忽略日志文件写入错误
  }
}
import {
  plans,
  planSubjects,
  subjects,
  knowledgeNodes,
  knowledgeEdges,
  skillDimensions,
  userSettings,
  dailyTodos,
  reviewSchedules,
  studyLogs,
  skillAssessments,
  questions,
  userAnswers,
  wrongAnswers,
} from "@db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { searchAndAnalyzeSubjects, generateRoundAndMonthlyPlan, generateWeeklyPlan, generateDailyPlan, analyzeContentForKnowledgeTree, analyzeContentForSkills, generateCompleteStudyPlanFromFile, generateRoundAndMonthlyPlanFromFile, generateWeeklyPlanFromFile, generateDailyPlanFromFile, generateWeeklyDailyPlanFromFile } from "./lib/ai";

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

  // 删除计划（级联删除所有相关数据：科目、知识树、技能、任务、复习调度等）
  delete: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();

      // 1. 获取该计划关联的所有科目ID
      const planSubjectLinks = await db
        .select({ subjectId: planSubjects.subjectId })
        .from(planSubjects)
        .where(eq(planSubjects.planId, input.id));

      const subjectIds = planSubjectLinks.map((ps) => ps.subjectId);

      // 2. 如果有关联科目，清理相关数据
      if (subjectIds.length > 0) {
        // 2.1 获取这些科目下的所有知识节点ID
        const nodes = await db
          .select({ id: knowledgeNodes.id })
          .from(knowledgeNodes)
          .where(
            and(
              eq(knowledgeNodes.userId, ctx.user.id),
              inArray(knowledgeNodes.subjectId, subjectIds)
            )
          );

        const nodeIds = nodes.map((n) => n.id);

        // 2.2 获取这些科目下的所有技能维度ID
        const skills = await db
          .select({ id: skillDimensions.id })
          .from(skillDimensions)
          .where(
            and(
              eq(skillDimensions.userId, ctx.user.id),
              inArray(skillDimensions.subjectId, subjectIds)
            )
          );

        const skillIds = skills.map((s) => s.id);

        // 2.3 删除知识边（基于知识节点）
        if (nodeIds.length > 0) {
          await db
            .delete(knowledgeEdges)
            .where(
              and(
                eq(knowledgeEdges.userId, ctx.user.id),
                inArray(knowledgeEdges.sourceNodeId, nodeIds)
              )
            );
        }

        // 2.4 删除知识节点
        await db
          .delete(knowledgeNodes)
          .where(
            and(
              eq(knowledgeNodes.userId, ctx.user.id),
              inArray(knowledgeNodes.subjectId, subjectIds)
            )
          );

        // 2.5 删除技能评估（基于技能维度）
        if (skillIds.length > 0) {
          await db
            .delete(skillAssessments)
            .where(
              and(
                eq(skillAssessments.userId, ctx.user.id),
                inArray(skillAssessments.skillId, skillIds)
              )
            );
        }

        // 2.6 删除技能维度
        await db
          .delete(skillDimensions)
          .where(
            and(
              eq(skillDimensions.userId, ctx.user.id),
              inArray(skillDimensions.subjectId, subjectIds)
            )
          );

        // 2.7 删除学习记录
        await db
          .delete(studyLogs)
          .where(
            and(
              eq(studyLogs.userId, ctx.user.id),
              inArray(studyLogs.subjectId, subjectIds)
            )
          );

        // 2.8 获取这些科目下的所有题目ID
        const subjectQuestions = await db
          .select({ id: questions.id })
          .from(questions)
          .where(
            and(
              eq(questions.userId, ctx.user.id),
              inArray(questions.subjectId, subjectIds)
            )
          );

        const questionIds = subjectQuestions.map((q) => q.id);

        // 2.9 删除用户答题记录（基于题目）
        if (questionIds.length > 0) {
          await db
            .delete(userAnswers)
            .where(
              and(
                eq(userAnswers.userId, ctx.user.id),
                inArray(userAnswers.questionId, questionIds)
              )
            );
        }

        // 2.10 删除错题记录（基于题目）
        if (questionIds.length > 0) {
          await db
            .delete(wrongAnswers)
            .where(
              and(
                eq(wrongAnswers.userId, ctx.user.id),
                inArray(wrongAnswers.questionId, questionIds)
              )
            );
        }

        // 2.11 删除科目
        await db
          .delete(subjects)
          .where(
            and(
              eq(subjects.userId, ctx.user.id),
              inArray(subjects.id, subjectIds)
            )
          );
      }

      // 3. 删除每日任务
      await db
        .delete(dailyTodos)
        .where(
          and(
            eq(dailyTodos.userId, ctx.user.id),
            eq(dailyTodos.planId, input.id)
          )
        );

      // 4. 删除复习调度
      await db
        .delete(reviewSchedules)
        .where(
          and(
            eq(reviewSchedules.userId, ctx.user.id),
            eq(reviewSchedules.planId, input.id)
          )
        );

      // 5. 删除计划科目关联
      await db
        .delete(planSubjects)
        .where(eq(planSubjects.planId, input.id));

      // 6. 删除计划
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

  // 将已存在的科目（来自科目管理）添加到计划
  addExistingSubjectsToPlan: authedQuery
    .input(
      z.object({
        planId: z.number(),
        subjectIds: z.array(z.number()).min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();

      // 1. 验证计划存在且属于当前用户
      const [plan] = await db
        .select()
        .from(plans)
        .where(and(eq(plans.id, input.planId), eq(plans.userId, ctx.user.id)));

      if (!plan) {
        throw new Error("计划不存在");
      }

      const results = [];

      for (const subjectId of input.subjectIds) {
        // 2. 验证科目存在且属于当前用户
        const [subject] = await db
          .select()
          .from(subjects)
          .where(and(eq(subjects.id, subjectId), eq(subjects.userId, ctx.user.id)));

        if (!subject) {
          results.push({ subjectId, success: false, error: "科目不存在或无权限" });
          continue;
        }

        // 3. 验证科目已分析（有知识节点）
        const nodes = await db
          .select({ id: knowledgeNodes.id })
          .from(knowledgeNodes)
          .where(
            and(
              eq(knowledgeNodes.subjectId, subjectId),
              eq(knowledgeNodes.userId, ctx.user.id)
            )
          );

        if (nodes.length === 0) {
          results.push({ subjectId, title: subject.title, success: false, error: "科目尚未分析，请先使用AI分析功能生成知识树" });
          continue;
        }

        // 4. 检查是否已关联
        const [existing] = await db
          .select()
          .from(planSubjects)
          .where(
            and(
              eq(planSubjects.planId, input.planId),
              eq(planSubjects.subjectId, subjectId)
            )
          );

        if (existing) {
          results.push({ subjectId, title: subject.title, success: false, error: "该科目已关联到此计划" });
          continue;
        }

        // 5. 获取当前最大 orderIndex
        const [lastOrder] = await db
          .select({ orderIndex: planSubjects.orderIndex })
          .from(planSubjects)
          .where(eq(planSubjects.planId, input.planId))
          .orderBy(desc(planSubjects.orderIndex))
          .limit(1);

        const orderIndex = (lastOrder?.orderIndex ?? -1) + 1;

        // 6. 关联到计划
        await db.insert(planSubjects).values({
          planId: input.planId,
          subjectId,
          priority: subject.priority || 2,
          orderIndex,
        });

        results.push({ subjectId, title: subject.title, success: true });
      }

      const successCount = results.filter((r) => r.success).length;

      return {
        success: successCount > 0,
        added: successCount,
        total: input.subjectIds.length,
        results,
      };
    }),
  aiGenerateSchedule: authedQuery
    .input(z.object({ id: z.number(), requirements: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const overallStart = Date.now();
      planDebugLog("aiGenerateSchedule 开始", { planId: input.id, requirements: input.requirements });

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

      planDebugLog("aiGenerateSchedule 科目信息", { subjectCount: planSubs.length, subjectTitles: planSubs.map(s => s.title) });
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
        planDebugLog("aiGenerateSchedule 存在未分析科目", { unanalyzedSubjects });
        throw new Error(`以下科目尚未分析，请先使用AI分析功能生成知识树：${unanalyzedSubjects.join("、")}`);
      }

      planDebugLog("aiGenerateSchedule 所有科目已分析", {
        totalNodes: planSubs.reduce((sum, s) => sum + (subjectNodeTitlesMap.get(s.id)?.length || 0), 0)
      });

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

      // 将科目和知识树数据保存为临时文件
      const subjectsData = planSubs.map((s) => ({
        title: s.title,
        priority: s.priority,
        difficulty: s.difficulty,
        knowledgeNodes: subjectNodesMap.get(s.id) || [],
      }));

      const fileData = {
        subjects: subjectsData,
        config: {
          dailyMinutes: plan.dailyMinutes,
          startDate,
          totalMonths,
          reviewRounds,
          requirements: input.requirements || undefined,
        }
      };

      // 获取文件服务器URL
      const fileServerUrl = setting?.fileServerUrl?.trim();
      if (!fileServerUrl) {
        throw new Error("请先设置文件上传服务器地址。在「设置」页配置 fileServerUrl（如 http://VPS_IP:3001）");
      }

      // 保存到临时文件（使用.txt扩展名以兼容上传服务器）
      const tempDir = path.join(process.cwd(), "temp");
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      const tempFileName = `plan-data-${ctx.user.id}-${plan.id}-${Date.now()}.txt`;
      const tempFilePath = path.join(tempDir, tempFileName);
      fs.writeFileSync(tempFilePath, JSON.stringify(fileData, null, 2));

      planDebugLog("aiGenerateSchedule 已保存临时文件", { tempFilePath });

      // 上传到文件服务器
      const uploadFormData = new FormData();
      const fileBuffer = fs.readFileSync(tempFilePath);
      const blob = new Blob([fileBuffer], { type: "application/json" });
      uploadFormData.append("file", blob, tempFileName);

      const uploadUrl = `${fileServerUrl.replace(/\/$/, "")}/upload`;
      planDebugLog("aiGenerateSchedule 开始上传文件", { uploadUrl, tempFileName });

      let uploadRes;
      try {
        uploadRes = await fetch(uploadUrl, {
          method: "POST",
          body: uploadFormData,
        });
        planDebugLog("aiGenerateSchedule 文件上传请求完成", { status: uploadRes.status });
      } catch (fetchErr) {
        planDebugLog("aiGenerateSchedule 文件上传请求失败", { error: String(fetchErr) });
        throw new Error(`文件上传请求失败: ${fetchErr}`);
      }

      // 删除临时文件
      try {
        fs.unlinkSync(tempFilePath);
      } catch {}

      if (!uploadRes.ok) {
        const errText = await uploadRes.text().catch(() => "{}");
        planDebugLog("aiGenerateSchedule 文件上传返回错误", { status: uploadRes.status, error: errText });
        throw new Error(`文件上传失败: ${uploadRes.status} - ${errText}`);
      }

      let uploadData;
      try {
        uploadData = await uploadRes.json();
      } catch (parseErr) {
        const resText = await uploadRes.text().catch(() => "无法读取响应");
        planDebugLog("aiGenerateSchedule 解析上传响应失败", { error: String(parseErr), response: resText });
        throw new Error(`解析上传响应失败: ${parseErr}`);
      }

      const fileUrl = uploadData.url;
      if (!fileUrl) {
        planDebugLog("aiGenerateSchedule 上传响应缺少URL", { uploadData });
        throw new Error("文件上传响应中缺少URL");
      }

      planDebugLog("aiGenerateSchedule 文件上传成功", { fileUrl, subjectsCount: subjectsData.length });

      // 验证文件URL是否可访问
      try {
        const fileCheckRes = await fetch(fileUrl, { method: "HEAD" });
        planDebugLog("aiGenerateSchedule 文件URL验证", {
          fileUrl,
          accessible: fileCheckRes.ok,
          status: fileCheckRes.status,
          contentType: fileCheckRes.headers.get("content-type"),
          contentLength: fileCheckRes.headers.get("content-length"),
        });
      } catch (checkErr) {
        planDebugLog("aiGenerateSchedule 文件URL验证失败(非致命)", { error: String(checkErr) });
      }

      // 第1层：生成轮次+月计划（使用文件URL）
      planDebugLog("aiGenerateSchedule 开始第1层：轮次/月计划", { totalMonths, reviewRounds });
      const stage1Start = Date.now();

      const roundMonthlyResult = await generateRoundAndMonthlyPlanFromFile(
        fileUrl,
        {
          dailyMinutes: plan.dailyMinutes,
          startDate,
          totalMonths,
          reviewRounds,
          requirements: input.requirements || undefined,
        },
        setting?.aiApiKey || undefined,
        setting?.aiApiEndpoint || undefined,
        setting?.aiModel || undefined
      );

      planDebugLog("aiGenerateSchedule 第1层完成", {
        elapsedMs: Date.now() - stage1Start,
        roundsCount: roundMonthlyResult.rounds.length,
        monthsCount: roundMonthlyResult.months.length,
        sampleRounds: roundMonthlyResult.rounds.slice(0, 2),
        sampleMonths: roundMonthlyResult.months.slice(0, 2)
      });

      // 第2层：生成周计划（使用文件URL）
      const monthlyContext = roundMonthlyResult.months
        .map((m) => `第${m.month}月(${m.monthName})：${m.focus}；科目：${m.subjects?.join("、")}；目标：${m.goals?.join("、")}`)
        .join("\n");

      const totalWeeks = Math.ceil(totalMonths * 4.3);

      planDebugLog("aiGenerateSchedule 开始第2层：周计划", { totalWeeks });
      const stage2Start = Date.now();

      const weeklyResult = await generateWeeklyPlanFromFile(
        fileUrl,
        {
          dailyMinutes: plan.dailyMinutes,
          totalWeeks,
          monthlyContext,
          requirements: input.requirements || undefined,
        },
        setting?.aiApiKey || undefined,
        setting?.aiApiEndpoint || undefined,
        setting?.aiModel || undefined
      );

      planDebugLog("aiGenerateSchedule 第2层完成", {
        elapsedMs: Date.now() - stage2Start,
        weeksCount: weeklyResult.weeks.length,
        sampleWeeks: weeklyResult.weeks.slice(0, 3)
      });

      // 日计划留空，按周单独生成
      const fullPlan = {
        roundPlan: roundMonthlyResult.rounds,
        monthlyPlan: roundMonthlyResult.months,
        weeklyPlan: weeklyResult.weeks,
        dailyPlan: [],
        generatedWeeks: [], // 记录哪些周已生成日计划
      };

      planDebugLog("aiGenerateSchedule 全部完成（不含日计划）", {
        totalElapsedMs: Date.now() - overallStart,
        roundPlanCount: fullPlan.roundPlan.length,
        monthlyPlanCount: fullPlan.monthlyPlan.length,
        weeklyPlanCount: fullPlan.weeklyPlan.length,
      });

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

  // 为指定周生成日计划
  aiGenerateWeeklyDaily: authedQuery
    .input(z.object({
      planId: z.number(),
      weekNumber: z.number(),
      requirements: z.string().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      planDebugLog("aiGenerateWeeklyDaily 开始", { planId: input.planId, weekNumber: input.weekNumber });

      const db = getDb();
      const [plan] = await db
        .select()
        .from(plans)
        .where(and(eq(plans.id, input.planId), eq(plans.userId, ctx.user.id)));

      if (!plan) throw new Error("计划不存在");

      const aiPlan = plan.aiPlan ? JSON.parse(plan.aiPlan) : null;
      if (!aiPlan || !aiPlan.weeklyPlan) {
        throw new Error("请先生成整体计划");
      }

      const weekData = aiPlan.weeklyPlan.find((w: {week: number}) => w.week === input.weekNumber);
      if (!weekData) {
        throw new Error(`第${input.weekNumber}周不存在`);
      }

      // 检查该周是否已生成
      const generatedWeeks: number[] = aiPlan.generatedWeeks || [];
      if (generatedWeeks.includes(input.weekNumber)) {
        throw new Error(`第${input.weekNumber}周的日计划已生成`);
      }

      const [setting] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, ctx.user.id));

      const startDate = plan.startDate
        ? new Date(plan.startDate).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0];

      // 获取科目数据
      const ps = await db
        .select()
        .from(planSubjects)
        .where(eq(planSubjects.planId, plan.id));
      const subjectIds = ps.map((p) => p.subjectId);

      const planSubs = await db
        .select()
        .from(subjects)
        .where(and(eq(subjects.userId, ctx.user.id)))
        .then((rows) => rows.filter((s) => subjectIds.includes(s.id)));

      const subjectsData = planSubs.map((s) => ({
        title: s.title,
        priority: s.priority,
        difficulty: s.difficulty,
      }));

      // 构建周上下文
      const weeklyContext = `第${weekData.week}周(第${weekData.month}月)：${weekData.focus}；知识点：${weekData.knowledgeNodes?.join("、")}`;

      // 上传数据到文件服务器
      const fileData = {
        subjects: subjectsData,
        week: weekData,
        config: {
          dailyMinutes: plan.dailyMinutes,
          startDate,
          weekNumber: input.weekNumber,
          requirements: input.requirements,
        }
      };

      const fileServerUrl = setting?.fileServerUrl?.trim();
      if (!fileServerUrl) {
        throw new Error("请先设置文件上传服务器地址");
      }

      const tempDir = path.join(process.cwd(), "temp");
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      const tempFileName = `weekly-daily-${ctx.user.id}-${plan.id}-${input.weekNumber}-${Date.now()}.txt`;
      const tempFilePath = path.join(tempDir, tempFileName);
      fs.writeFileSync(tempFilePath, JSON.stringify(fileData, null, 2));

      const uploadFormData = new FormData();
      const fileBuffer = fs.readFileSync(tempFilePath);
      const blob = new Blob([fileBuffer], { type: "application/json" });
      uploadFormData.append("file", blob, tempFileName);

      const uploadUrl = `${fileServerUrl.replace(/\/$/, "")}/upload`;
      const uploadRes = await fetch(uploadUrl, {
        method: "POST",
        body: uploadFormData,
      });

      try {
        fs.unlinkSync(tempFilePath);
      } catch {}

      if (!uploadRes.ok) {
        throw new Error(`文件上传失败: ${uploadRes.status}`);
      }

      const uploadData = await uploadRes.json();
      const fileUrl = uploadData.url;
      if (!fileUrl) {
        throw new Error("文件上传响应中缺少URL");
      }

      // 调用AI生成该周日计划
      const weekDaysResult = await generateWeeklyDailyPlanFromFile(
        fileUrl,
        {
          dailyMinutes: plan.dailyMinutes,
          startDate,
          weekNumber: input.weekNumber,
          weeklyContext,
          requirements: input.requirements,
        },
        setting?.aiApiKey || undefined,
        setting?.aiApiEndpoint || undefined,
        setting?.aiModel || undefined
      );

      // 更新AI计划
      const existingDays: Array<{
        day: number;
        date: string;
        week: number;
        month: number;
        subject: string;
        knowledgeNodes: string[];
        estimatedMinutes: number;
        focus: string;
        review: boolean;
      }> = aiPlan.dailyPlan || [];

      // 合并新生成的日计划
      const mergedDays = [...existingDays, ...weekDaysResult.days];
      // 按day排序
      mergedDays.sort((a, b) => a.day - b.day);

      // 更新generatedWeeks
      const newGeneratedWeeks = [...generatedWeeks, input.weekNumber];

      const updatedPlan = {
        ...aiPlan,
        dailyPlan: mergedDays,
        generatedWeeks: newGeneratedWeeks,
      };

      await db
        .update(plans)
        .set({ aiPlan: JSON.stringify(updatedPlan) })
        .where(eq(plans.id, input.planId));

      planDebugLog("aiGenerateWeeklyDaily 完成", {
        weekNumber: input.weekNumber,
        daysCount: weekDaysResult.days.length,
        totalDays: mergedDays.length
      });

      return { success: true, weekNumber: input.weekNumber, daysCount: weekDaysResult.days.length };
    }),
});
