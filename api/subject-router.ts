import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { subjects, knowledgeNodes, knowledgeEdges, skillDimensions, userSettings } from "@db/schema";
import { eq, and, desc } from "drizzle-orm";
import {
  analyzeContentForKnowledgeTree,
  analyzeContentForSkills,
  analyzeFilesForKnowledgeTree,
  analyzeFilesForSkills,
} from "./lib/ai";
import fs from "fs";
import path from "path";

// ========== 科目分析调试日志 ==========
const DEBUG_LOG_FILE = path.join(process.cwd(), "subject-debug.log");

function debugLog(label: string, data?: unknown) {
  const now = new Date().toISOString();
  const line = data !== undefined
    ? `[${now}] [SUBJECT-DEBUG] ${label} | ${typeof data === "string" ? data : JSON.stringify(data, null, 2)}`
    : `[${now}] [SUBJECT-DEBUG] ${label}`;
  console.log(line);
  try {
    fs.appendFileSync(DEBUG_LOG_FILE, line + "\n");
  } catch {
    // 忽略日志文件写入错误
  }
}

function debugLogError(label: string, error: unknown) {
  const now = new Date().toISOString();
  const errMsg = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack}` : String(error);
  const line = `[${now}] [SUBJECT-DEBUG-ERROR] ${label}\n${errMsg}`;
  console.error(line);
  try {
    fs.appendFileSync(DEBUG_LOG_FILE, line + "\n");
  } catch {
    // 忽略日志文件写入错误
  }
}

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
      console.log("[BACKEND analyze] mutation started, id=", input.id, "userId=", ctx.user.id);
      const db = getDb();
      const startTime = Date.now();

      debugLog("=== analyze mutation 开始 ===", {
        subjectId: input.id,
        userId: ctx.user.id,
        timestamp: new Date().toISOString(),
      });

      try {
        // 1. 获取科目信息
        debugLog("步骤1: 获取科目信息", { subjectId: input.id });
        const [subject] = await db
          .select()
          .from(subjects)
          .where(and(eq(subjects.id, input.id), eq(subjects.userId, ctx.user.id)));

        if (!subject) {
          debugLogError("步骤1失败", new Error("科目不存在"));
          throw new Error("科目不存在或没有内容可供分析");
        }

        if (!subject.sourceContent) {
          debugLogError("步骤1失败", new Error("科目没有sourceContent"));
          throw new Error("科目不存在或没有内容可供分析");
        }

        debugLog("步骤1完成", {
          subjectId: subject.id,
          title: subject.title,
          sourceContentLength: subject.sourceContent?.length || 0,
          status: subject.status,
        });

        // 2. 更新状态为分析中
        debugLog("步骤2: 更新科目状态为 analyzing");
        await db
          .update(subjects)
          .set({ status: "analyzing" })
          .where(eq(subjects.id, input.id));
        debugLog("步骤2完成");

        // 3. 读取用户AI配置
        debugLog("步骤3: 读取用户AI配置", { userId: ctx.user.id });
        const [setting] = await db
          .select()
          .from(userSettings)
          .where(eq(userSettings.userId, ctx.user.id));

        debugLog("步骤3完成", {
          hasSetting: !!setting,
          aiModel: setting?.aiModel || "(未配置，使用默认)",
          aiApiEndpoint: setting?.aiApiEndpoint ? "(已配置)" : "(未配置)",
          aiApiKey: setting?.aiApiKey ? "(已配置)" : "(未配置)",
        });

        // 4. 检测内容是否包含文件URL
        const fileUrlRegex = /https?:\/\/[^\s]+\.(?:pdf|doc|docx|txt|png|jpg|jpeg|gif|webp)/gi;
        const fileUrls = subject.sourceContent ? subject.sourceContent.match(fileUrlRegex) || [] : [];
        const hasFileUrls = fileUrls.length > 0;

        debugLog("步骤4: 检测文件URL", {
          hasFileUrls,
          fileUrlCount: fileUrls.length,
          fileUrls: fileUrls.slice(0, 5),
        });

        let knowledgeResult;
        let skillsResult;

        // 5. 调用AI分析
        const aiStartTime = Date.now();
        if (hasFileUrls) {
          debugLog("步骤5: 使用文件分析模式");
          knowledgeResult = await analyzeFilesForKnowledgeTree(
            fileUrls,
            subject.title,
            setting?.aiApiKey || undefined,
            setting?.aiApiEndpoint || undefined,
            setting?.aiModel || undefined
          );

          skillsResult = await analyzeFilesForSkills(
            fileUrls,
            subject.title,
            setting?.aiApiKey || undefined,
            setting?.aiApiEndpoint || undefined,
            setting?.aiModel || undefined
          );
        } else {
          debugLog("步骤5: 使用文本分析模式", {
            title: subject.title,
            contentLength: subject.sourceContent?.length || 0,
            apiKey: setting?.aiApiKey ? "(已配置)" : "(未配置，使用fallback)",
            apiEndpoint: setting?.aiApiEndpoint || "(未配置，使用fallback)",
            model: setting?.aiModel || "(未配置，使用默认)",
          });

          knowledgeResult = await analyzeContentForKnowledgeTree(
            subject.sourceContent,
            subject.title,
            setting?.aiApiKey || undefined,
            setting?.aiApiEndpoint || undefined,
            setting?.aiModel || undefined
          );

          skillsResult = await analyzeContentForSkills(
            subject.sourceContent,
            subject.title,
            setting?.aiApiKey || undefined,
            setting?.aiApiEndpoint || undefined,
            setting?.aiModel || undefined
          );
        }
        const aiElapsed = Date.now() - aiStartTime;

        debugLog("步骤5完成", {
          aiElapsedMs: aiElapsed,
          nodesCount: knowledgeResult.nodes?.length || 0,
          edgesCount: knowledgeResult.edges?.length || 0,
          subjectDifficulty: knowledgeResult.subjectDifficulty,
          subjectPriority: knowledgeResult.subjectPriority,
          skillsCount: skillsResult.skills?.length || 0,
        });

        // 6. 保存知识节点到数据库
        debugLog("步骤6: 保存知识节点", { expectedCount: knowledgeResult.nodes?.length || 0 });
        const fullPathToIdMap = new Map<string, number>();

        for (let i = 0; i < knowledgeResult.nodes.length; i++) {
          const node = knowledgeResult.nodes[i];
          debugLog(`步骤6[${i + 1}/${knowledgeResult.nodes.length}]: 插入节点`, {
            title: node.title,
            fullPath: node.fullPath,
            level: node.level,
            orderIndex: node.orderIndex,
            parentTitle: node.parentTitle,
            tags: node.tags,
          });

          try {
            const insertResult = await db
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
                isLeaf: !knowledgeResult.nodes.some((n) => n.parentTitle === node.fullPath),
              })
              .$returningId();

            debugLog(`步骤6[${i + 1}] insert结果`, { insertResult: JSON.stringify(insertResult) });

            if (!insertResult || insertResult.length === 0) {
              debugLogError(`步骤6[${i + 1}] insert返回空`, new Error("$returningId() returned empty array"));
              throw new Error(`节点 "${node.title}" 插入失败：未返回ID`);
            }

            const nodeId = insertResult[0].id;
            debugLog(`步骤6[${i + 1}] 节点ID`, { nodeId, type: typeof nodeId });
            fullPathToIdMap.set(node.fullPath, Number(nodeId));
          } catch (insertErr) {
            debugLogError(`步骤6[${i + 1}] 节点插入失败`, insertErr);
            throw insertErr;
          }
        }
        debugLog("步骤6完成", { savedNodes: fullPathToIdMap.size });

        // 7. 更新父节点关系
        debugLog("步骤7: 更新父节点关系", { nodesWithParent: knowledgeResult.nodes.filter((n) => n.parentTitle).length });
        for (const node of knowledgeResult.nodes) {
          if (node.parentTitle && fullPathToIdMap.has(node.parentTitle)) {
            const nodeId = fullPathToIdMap.get(node.fullPath);
            const parentId = fullPathToIdMap.get(node.parentTitle);
            debugLog("步骤7: 更新parentId", { nodeTitle: node.title, nodeFullPath: node.fullPath, nodeId, parentTitle: node.parentTitle, parentId });
            await db
              .update(knowledgeNodes)
              .set({ parentId: parentId })
              .where(eq(knowledgeNodes.id, nodeId!));
          } else if (node.parentTitle) {
            debugLog(`步骤7: 父节点未找到`, { nodeTitle: node.title, parentTitle: node.parentTitle });
          }
        }
        debugLog("步骤7完成");

        // 8. 保存知识边
        debugLog("步骤8: 保存知识边", { expectedCount: knowledgeResult.edges?.length || 0 });
        let savedEdges = 0;
        for (let i = 0; i < knowledgeResult.edges.length; i++) {
          const edge = knowledgeResult.edges[i];
          const sourceId = fullPathToIdMap.get(edge.sourceTitle);
          const targetId = fullPathToIdMap.get(edge.targetTitle);
          debugLog(`步骤8[${i + 1}]`, { sourceTitle: edge.sourceTitle, sourceId, targetTitle: edge.targetTitle, targetId, relationType: edge.relationType });
          if (sourceId && targetId) {
            await db.insert(knowledgeEdges).values({
              userId: ctx.user.id,
              sourceNodeId: sourceId,
              targetNodeId: targetId,
              relationType: edge.relationType as "prerequisite" | "related" | "extends" | "partOf",
              strength: edge.strength,
            });
            savedEdges++;
          } else {
            debugLog(`步骤8[${i + 1}] 跳过：sourceId或targetId不存在`);
          }
        }
        debugLog("步骤8完成", { savedEdges });

        // 9. 保存技能维度
        debugLog("步骤9: 保存技能维度", { expectedCount: skillsResult.skills?.length || 0 });
        const skillNameToIdMap = new Map<string, number>();

        for (let i = 0; i < skillsResult.skills.length; i++) {
          const skill = skillsResult.skills[i];
          debugLog(`步骤9[${i + 1}/${skillsResult.skills.length}]: 插入技能`, { name: skill.name, category: skill.category, parentName: skill.parentName });

          try {
            const insertResult = await db
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

            debugLog(`步骤9[${i + 1}] insert结果`, { insertResult: JSON.stringify(insertResult) });

            if (!insertResult || insertResult.length === 0) {
              debugLogError(`步骤9[${i + 1}] insert返回空`, new Error("$returningId() returned empty array"));
              throw new Error(`技能 "${skill.name}" 插入失败：未返回ID`);
            }

            const skillId = insertResult[0].id;
            skillNameToIdMap.set(skill.name, Number(skillId));
          } catch (insertErr) {
            debugLogError(`步骤9[${i + 1}] 技能插入失败`, insertErr);
            throw insertErr;
          }
        }
        debugLog("步骤9完成", { savedSkills: skillNameToIdMap.size });

        // 10. 更新技能的父关系
        debugLog("步骤10: 更新技能父关系", { skillsWithParent: skillsResult.skills.filter((s) => s.parentName).length });
        for (const skill of skillsResult.skills) {
          if (skill.parentName && skillNameToIdMap.has(skill.parentName)) {
            const skillId = skillNameToIdMap.get(skill.name);
            const parentId = skillNameToIdMap.get(skill.parentName);
            debugLog("步骤10: 更新parentId", { skillName: skill.name, skillId, parentName: skill.parentName, parentId });
            await db
              .update(skillDimensions)
              .set({ parentId: parentId })
              .where(eq(skillDimensions.id, skillId!));
          }
        }
        debugLog("步骤10完成");

        // 11. 更新科目状态为已分析
        debugLog("步骤11: 更新科目状态为 analyzed", {
          difficulty: knowledgeResult.subjectDifficulty,
          priority: knowledgeResult.subjectPriority,
        });
        await db
          .update(subjects)
          .set({
            status: "analyzed",
            difficulty: knowledgeResult.subjectDifficulty,
            priority: knowledgeResult.subjectPriority,
          })
          .where(eq(subjects.id, input.id));

        const totalElapsed = Date.now() - startTime;
        debugLog("=== analyze mutation 完成 ===", {
          totalElapsedMs: totalElapsed,
          nodesCount: knowledgeResult.nodes.length,
          edgesCount: savedEdges,
          skillsCount: skillsResult.skills.length,
          difficulty: knowledgeResult.subjectDifficulty,
          priority: knowledgeResult.subjectPriority,
        });

        console.log("[BACKEND analyze] success, returning", { nodesCount: knowledgeResult.nodes.length, skillsCount: skillsResult.skills.length });
        return {
          success: true,
          nodesCount: knowledgeResult.nodes.length,
          skillsCount: skillsResult.skills.length,
          difficulty: knowledgeResult.subjectDifficulty,
          priority: knowledgeResult.subjectPriority,
        };
      } catch (error) {
        console.error("[BACKEND analyze] ERROR:", error);
        const totalElapsed = Date.now() - startTime;
        debugLogError(`=== analyze mutation 失败 (耗时${totalElapsed}ms) ===`, error);

        // 更新状态为错误
        try {
          await db
            .update(subjects)
            .set({ status: "error" })
            .where(eq(subjects.id, input.id));
          debugLog("科目状态已更新为 error");
        } catch (dbErr) {
          debugLogError("更新科目状态为 error 时再次失败", dbErr);
        }

        throw error;
      }
    }),
});
