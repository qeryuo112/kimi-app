import { Hono } from "hono";
import { env } from "./lib/env";
import { getDb } from "./queries/connection";
import {
  subjects,
  knowledgeNodes,
  questions,
  userAnswers,
  wrongAnswers,
  reviewSchedules,
  userSettings,
} from "@db/schema";
import { eq, and, desc, sql, like, gte, lte, isNull, isNotNull, or } from "drizzle-orm";
import { evaluateAnswer } from "./lib/ai";
import { processUrlsToContentBlocks } from "./lib/document-processor";
import { mcpAuthMiddleware, type McpContext } from "./lib/mcp-auth";

const INTERVALS = [1, 2, 4, 7, 15, 30];

const app = new Hono<{ Variables: McpContext }>();
app.use("/*", mcpAuthMiddleware);

function getToday() {
  return new Date().toISOString().split("T")[0];
}

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

// ========== 学科 ==========
app.get("/subjects", async (c) => {
  const userId = c.get("userId");
  const db = getDb();
  const rows = await db.select().from(subjects).where(eq(subjects.userId, userId));
  return c.json({ success: true, data: rows });
});

app.get("/subjects/:id", async (c) => {
  const userId = c.get("userId");
  const id = Number(c.req.param("id"));
  if (Number.isNaN(id)) return c.json({ error: "Invalid subject id" }, 400);

  const db = getDb();
  const [row] = await db
    .select()
    .from(subjects)
    .where(and(eq(subjects.id, id), eq(subjects.userId, userId)))
    .limit(1);
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ success: true, data: row });
});

app.post("/subjects", async (c) => {
  const userId = c.get("userId");
  const body = (await c.req.json()) as {
    title: string;
    description?: string;
    category?: string;
    sourceType?: string;
    status?: string;
  };
  if (!body.title) return c.json({ error: "title required" }, 400);

  const db = getDb();
  const [{ id }] = await db
    .insert(subjects)
    .values({
      userId,
      title: body.title,
      description: body.description || null,
      category: body.category || null,
      sourceType: (body.sourceType as any) || "other",
      status: (body.status as any) || "imported",
    })
    .$returningId();
  return c.json({ success: true, id }, 201);
});

app.get("/subjects/:id/chapters", async (c) => {
  const userId = c.get("userId");
  const subjectId = Number(c.req.param("id"));
  if (Number.isNaN(subjectId)) return c.json({ error: "Invalid subject id" }, 400);

  const db = getDb();
  const rows = await db
    .select()
    .from(knowledgeNodes)
    .where(
      and(
        eq(knowledgeNodes.userId, userId),
        eq(knowledgeNodes.subjectId, subjectId),
        lte(knowledgeNodes.level, 2)
      )
    )
    .orderBy(knowledgeNodes.orderIndex);
  return c.json({ success: true, data: rows });
});

// ========== 知识点 ==========
app.get("/knowledge-nodes", async (c) => {
  const userId = c.get("userId");
  const subjectId = c.req.query("subjectId");
  const q = c.req.query("q");
  const title = c.req.query("title");
  const limit = Number(c.req.query("limit") || "50");

  const db = getDb();
  const conditions: any[] = [eq(knowledgeNodes.userId, userId)];
  if (subjectId) conditions.push(eq(knowledgeNodes.subjectId, Number(subjectId)));
  if (q) conditions.push(like(knowledgeNodes.title, `%${q}%`));
  if (title) conditions.push(eq(knowledgeNodes.title, title));

  const rows = await db
    .select()
    .from(knowledgeNodes)
    .where(and(...conditions))
    .orderBy(knowledgeNodes.orderIndex)
    .limit(limit);
  return c.json({ success: true, data: rows });
});

app.get("/knowledge-nodes/:id", async (c) => {
  const userId = c.get("userId");
  const id = Number(c.req.param("id"));
  if (Number.isNaN(id)) return c.json({ error: "Invalid id" }, 400);

  const db = getDb();
  const [row] = await db
    .select()
    .from(knowledgeNodes)
    .where(and(eq(knowledgeNodes.id, id), eq(knowledgeNodes.userId, userId)))
    .limit(1);
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ success: true, data: row });
});

app.post("/knowledge-nodes", async (c) => {
  const userId = c.get("userId");
  const body = (await c.req.json()) as {
    subjectId: number;
    parentId?: number | null;
    title: string;
    description?: string;
    level?: number;
    orderIndex?: number;
    importance?: number;
    difficulty?: number;
    estimatedMinutes?: number;
    tags?: string[];
  };
  if (!body.subjectId || !body.title) {
    return c.json({ error: "subjectId and title required" }, 400);
  }

  const db = getDb();
  const [{ id }] = await db
    .insert(knowledgeNodes)
    .values({
      userId,
      subjectId: body.subjectId,
      parentId: body.parentId || null,
      title: body.title,
      description: body.description || null,
      level: body.level ?? 3,
      orderIndex: body.orderIndex ?? 0,
      importance: body.importance ?? 3,
      difficulty: body.difficulty ?? 3,
      estimatedMinutes: body.estimatedMinutes ?? null,
      tags: body.tags ? JSON.stringify(body.tags) : null,
      isLeaf: (body.level ?? 3) > 2,
    })
    .$returningId();
  return c.json({ success: true, id }, 201);
});

app.patch("/knowledge-nodes/:id", async (c) => {
  const userId = c.get("userId");
  const id = Number(c.req.param("id"));
  if (Number.isNaN(id)) return c.json({ error: "Invalid id" }, 400);

  const body = (await c.req.json()) as Record<string, any>;
  const allowed = new Set([
    "title",
    "description",
    "parentId",
    "level",
    "orderIndex",
    "importance",
    "difficulty",
    "estimatedMinutes",
    "tags",
    "mastery",
    "isLeaf",
  ]);

  const sets: Record<string, any> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!allowed.has(k)) continue;
    sets[k] = k === "tags" && Array.isArray(v) ? JSON.stringify(v) : v;
  }
  if (Object.keys(sets).length === 0) {
    return c.json({ error: "No fields to update" }, 400);
  }
  sets.updatedAt = new Date();

  const db = getDb();
  await db
    .update(knowledgeNodes)
    .set(sets)
    .where(and(eq(knowledgeNodes.id, id), eq(knowledgeNodes.userId, userId)));
  return c.json({ success: true });
});

// ========== 题库 ==========
app.get("/questions", async (c) => {
  const userId = c.get("userId");
  const subjectId = c.req.query("subjectId");
  const nodeId = c.req.query("nodeId");
  const questionType = c.req.query("questionType");
  const q = c.req.query("q");
  const limit = Number(c.req.query("limit") || "50");

  const db = getDb();
  const conditions: any[] = [eq(questions.userId, userId)];
  if (subjectId) conditions.push(eq(questions.subjectId, Number(subjectId)));
  if (nodeId) conditions.push(eq(questions.nodeId, Number(nodeId)));
  if (questionType) conditions.push(eq(questions.questionType, questionType as any));
  if (q) conditions.push(like(questions.content, `%${q}%`));

  const rows = await db
    .select()
    .from(questions)
    .where(and(...conditions))
    .orderBy(desc(questions.createdAt))
    .limit(limit);
  return c.json({ success: true, data: rows });
});

app.get("/questions/count", async (c) => {
  const userId = c.get("userId");
  const subjectId = c.req.query("subjectId");
  const nodeId = c.req.query("nodeId");
  const questionType = c.req.query("questionType");

  const db = getDb();
  const conditions: any[] = [eq(questions.userId, userId)];
  if (subjectId) conditions.push(eq(questions.subjectId, Number(subjectId)));
  if (nodeId) conditions.push(eq(questions.nodeId, Number(nodeId)));
  if (questionType) conditions.push(eq(questions.questionType, questionType as any));

  const [{ value }] = await db
    .select({ value: sql<number>`count(*)` })
    .from(questions)
    .where(and(...conditions));
  return c.json({ success: true, count: Number(value) });
});

app.get("/questions/:id", async (c) => {
  const userId = c.get("userId");
  const id = Number(c.req.param("id"));
  if (Number.isNaN(id)) return c.json({ error: "Invalid question id" }, 400);

  const db = getDb();
  const [row] = await db
    .select()
    .from(questions)
    .where(and(eq(questions.id, id), eq(questions.userId, userId)));
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ success: true, data: row });
});

app.post("/questions", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();
  const items = Array.isArray(body) ? body : body.questions;
  if (!Array.isArray(items) || items.length === 0) {
    return c.json({ error: "questions array required" }, 400);
  }

  const db = getDb();
  const saved: number[] = [];
  for (const q of items) {
    const insertValues = {
      userId,
      subjectId: q.subjectId || null,
      nodeId: q.nodeId || null,
      skillId: q.skillId || null,
      questionType: q.questionType || "short_answer",
      content: q.content || "",
      options: q.options ? JSON.stringify(q.options) : null,
      correctAnswer: q.correctAnswer || "",
      explanation: q.explanation || null,
      difficulty: q.difficulty ?? 3,
      imageUrl: q.imageUrl || null,
      aiGenerated: q.aiGenerated ?? false,
      detectedSubject: q.detectedSubject || null,
      detectedKnowledgePoint: q.detectedKnowledgePoint || null,
      smiles: q.smiles || null,
      inchi: q.inchi || null,
    };
    const [{ id }] = await db.insert(questions).values(insertValues as any).$returningId();
    saved.push(id);
  }
  return c.json({ success: true, ids: saved, count: saved.length }, 201);
});

app.put("/questions/:id", async (c) => {
  const userId = c.get("userId");
  const id = Number(c.req.param("id"));
  if (Number.isNaN(id)) return c.json({ error: "Invalid question id" }, 400);

  const body = (await c.req.json()) as Record<string, any>;
  const allowed = new Set([
    "subjectId",
    "nodeId",
    "skillId",
    "questionType",
    "content",
    "options",
    "correctAnswer",
    "explanation",
    "difficulty",
    "imageUrl",
    "aiGenerated",
    "detectedSubject",
    "detectedKnowledgePoint",
    "smiles",
    "inchi",
  ]);

  const sets: Record<string, any> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!allowed.has(k)) continue;
    sets[k] = k === "options" && Array.isArray(v) ? JSON.stringify(v) : v;
  }
  if (Object.keys(sets).length === 0) {
    return c.json({ error: "No fields to update" }, 400);
  }

  const db = getDb();
  await db
    .update(questions)
    .set(sets)
    .where(and(eq(questions.id, id), eq(questions.userId, userId)));
  return c.json({ success: true });
});

app.delete("/questions/:id", async (c) => {
  const userId = c.get("userId");
  const id = Number(c.req.param("id"));
  if (Number.isNaN(id)) return c.json({ error: "Invalid question id" }, 400);

  const db = getDb();
  await db
    .delete(questions)
    .where(and(eq(questions.id, id), eq(questions.userId, userId)));
  return c.json({ success: true });
});

// ========== 组卷 ==========
app.post("/quiz", async (c) => {
  const userId = c.get("userId");
  const body = (await c.req.json()) as {
    subjectId?: number;
    nodeId?: number;
    questionType?: string;
    count?: number;
    excludeIds?: number[];
  };
  const count = Math.min(Math.max(body.count || 10, 1), 100);

  const db = getDb();
  const conditions: any[] = [eq(questions.userId, userId)];
  if (body.subjectId) conditions.push(eq(questions.subjectId, body.subjectId));
  if (body.nodeId) conditions.push(eq(questions.nodeId, body.nodeId));
  if (body.questionType) conditions.push(eq(questions.questionType, body.questionType as any));
  if (body.excludeIds?.length) {
    conditions.push(sql`${questions.id} NOT IN ${body.excludeIds}`);
  }

  const rows = await db
    .select()
    .from(questions)
    .where(and(...conditions))
    .orderBy(sql`rand()`)
    .limit(count);
  return c.json({ success: true, data: rows });
});

// ========== 答题 ==========
app.post("/answers", async (c) => {
  const userId = c.get("userId");
  const body = (await c.req.json()) as {
    questionId: number;
    userAnswer: string;
    durationSeconds?: number;
    score?: number; // 可选：AI 深度批改覆盖（0-1）
    isCorrect?: boolean; // 可选：AI 深度批改覆盖
  };
  if (!body.questionId || body.userAnswer === undefined) {
    return c.json({ error: "questionId and userAnswer required" }, 400);
  }

  const db = getDb();
  const [question] = await db
    .select()
    .from(questions)
    .where(and(eq(questions.id, body.questionId), eq(questions.userId, userId)));
  if (!question) return c.json({ error: "Question not found" }, 404);

  const [setting] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId));

  // AI 深度批改覆盖优先；否则调用远端评估（配置了 AI key 时走 AI，否则内置关键词评分）
  const evaluation =
    body.isCorrect !== undefined || body.score !== undefined
      ? {
          isCorrect: body.isCorrect ?? (body.score !== undefined && body.score >= 0.7),
          score: body.score !== undefined ? body.score : body.isCorrect ? 1 : 0,
          feedback: "AI 深度批改覆盖",
          mastery: body.score !== undefined ? Math.round(body.score * 100) : body.isCorrect ? 85 : 30,
        }
      : await evaluateAnswer(
          question.content,
          question.correctAnswer,
          body.userAnswer,
          question.questionType,
          setting?.aiApiKey || undefined,
          setting?.aiApiEndpoint || undefined,
          setting?.aiModel || undefined
        );

  await db.insert(userAnswers).values({
    userId,
    questionId: question.id,
    userAnswer: body.userAnswer,
    isCorrect: evaluation.isCorrect,
    score: evaluation.score,
    timeSpent: body.durationSeconds || 0,
  } as any);

  if (evaluation.isCorrect) {
    const [wrong] = await db
      .select()
      .from(wrongAnswers)
      .where(
        and(
          eq(wrongAnswers.userId, userId),
          eq(wrongAnswers.questionId, question.id),
          eq(wrongAnswers.mastered, false)
        )
      );
    if (wrong) {
      await db
        .update(wrongAnswers)
        .set({
          mastered: true,
          reviewCount: (wrong.reviewCount || 0) + 1,
        })
        .where(eq(wrongAnswers.id, wrong.id));
    }
  } else {
    const [existing] = await db
      .select()
      .from(wrongAnswers)
      .where(and(eq(wrongAnswers.userId, userId), eq(wrongAnswers.questionId, question.id)));
    if (existing) {
      await db
        .update(wrongAnswers)
        .set({
          wrongCount: (existing.wrongCount || 0) + 1,
          lastWrongAt: new Date(),
          userAnswer: body.userAnswer,
        })
        .where(eq(wrongAnswers.id, existing.id));
    } else {
      await db.insert(wrongAnswers).values({
        userId,
        questionId: question.id,
        userAnswer: body.userAnswer,
      });
    }
  }

  if (question.nodeId) {
    await db
      .update(knowledgeNodes)
      .set({ mastery: Math.round(evaluation.mastery) })
      .where(and(eq(knowledgeNodes.id, question.nodeId), eq(knowledgeNodes.userId, userId)));
  }

  return c.json({
    success: true,
    isCorrect: evaluation.isCorrect,
    score: evaluation.score,
    feedback: evaluation.feedback,
    mastery: evaluation.mastery,
  });
});

// ========== 错题本 ==========
app.get("/wrong-answers", async (c) => {
  const userId = c.get("userId");
  const subjectId = c.req.query("subjectId");
  const mastered = c.req.query("mastered"); // 0=未掌握(默认) 1=已掌握；缺省只返回未掌握
  const db = getDb();

  const rows = await db
    .select({
      wrong: wrongAnswers,
      question: questions,
    })
    .from(wrongAnswers)
    .leftJoin(questions, eq(questions.id, wrongAnswers.questionId))
    .where(
      and(
        eq(wrongAnswers.userId, userId),
        mastered === "1" ? eq(wrongAnswers.mastered, true) : eq(wrongAnswers.mastered, false),
        subjectId ? eq(questions.subjectId, Number(subjectId)) : undefined
      )
    )
    .orderBy(desc(wrongAnswers.lastWrongAt));
  return c.json({ success: true, data: rows });
});

app.post("/wrong-answers/:id/resolve", async (c) => {
  const userId = c.get("userId");
  const id = Number(c.req.param("id"));
  if (Number.isNaN(id)) return c.json({ error: "Invalid id" }, 400);

  const db = getDb();
  await db
    .update(wrongAnswers)
    .set({ mastered: true, reviewCount: sql`${wrongAnswers.reviewCount} + 1` })
    .where(and(eq(wrongAnswers.id, id), eq(wrongAnswers.userId, userId)));
  return c.json({ success: true });
});

// ========== 复习队列 ==========
app.get("/review-queue", async (c) => {
  const userId = c.get("userId");
  const today = getToday();
  const includeFuture = c.req.query("includeFuture") === "1"; // 1=返回全部 active 调度（含未来），供学习计划聚合
  const db = getDb();

  const rows = await db
    .select()
    .from(reviewSchedules)
    .where(
      and(
        eq(reviewSchedules.userId, userId),
        eq(reviewSchedules.status, "active"),
        includeFuture
          ? isNotNull(reviewSchedules.nextReviewDate)
          : or(isNull(reviewSchedules.nextReviewDate), lte(reviewSchedules.nextReviewDate, today))
      )
    )
    .orderBy(reviewSchedules.nextReviewDate);
  return c.json({ success: true, data: rows });
});

app.post("/review-queue/:id/record", async (c) => {
  const userId = c.get("userId");
  const id = Number(c.req.param("id"));
  const body = (await c.req.json()) as { mastery?: number; result?: "again" | "hard" | "good" | "easy" };
  if (Number.isNaN(id)) return c.json({ error: "Invalid id" }, 400);

  const db = getDb();
  const [schedule] = await db
    .select()
    .from(reviewSchedules)
    .where(and(eq(reviewSchedules.id, id), eq(reviewSchedules.userId, userId)));
  if (!schedule) return c.json({ error: "Not found" }, 404);

  let mastery = Math.max(0, Math.min(100, body.mastery ?? 60));
  if (body.result) {
    const map: Record<string, number> = { again: 20, hard: 50, good: 75, easy: 95 };
    mastery = map[body.result] ?? mastery;
  }

  const nextIndex = Math.min((schedule.reviewCount || 0), INTERVALS.length - 1);
  let interval = INTERVALS[nextIndex];
  if (mastery >= 80 && schedule.reviewCount && schedule.reviewCount >= 2) {
    interval = Math.min(interval * 2, 60);
  }
  if (mastery < 40) {
    interval = 1;
  }

  const nextReviewDate = addDays(getToday(), interval);
  const newReviewCount = (schedule.reviewCount || 0) + 1;
  const mastered = mastery >= 90 || newReviewCount >= 6;

  await db
    .update(reviewSchedules)
    .set({
      mastery,
      reviewCount: newReviewCount,
      intervalDays: interval,
      nextReviewDate,
      status: mastered ? "mastered" : "active",
    })
    .where(eq(reviewSchedules.id, id));

  return c.json({ success: true, nextReviewDate, interval, mastered });
});

// ========== 进度报告 ==========
app.get("/progress", async (c) => {
  const userId = c.get("userId");
  const db = getDb();

  const subjectRows = await db
    .select({
      id: subjects.id,
      title: subjects.title,
    })
    .from(subjects)
    .where(eq(subjects.userId, userId));

  const result = [];
  for (const s of subjectRows) {
    const [{ total }] = await db
      .select({ total: sql<number>`count(*)` })
      .from(questions)
      .where(and(eq(questions.userId, userId), eq(questions.subjectId, s.id)));

    const [{ answered }] = await db
      .select({ answered: sql<number>`count(distinct ${userAnswers.questionId})` })
      .from(userAnswers)
      .leftJoin(questions, eq(questions.id, userAnswers.questionId))
      .where(and(eq(userAnswers.userId, userId), eq(questions.subjectId, s.id)));

    const [{ correct }] = await db
      .select({ correct: sql<number>`count(*)` })
      .from(userAnswers)
      .leftJoin(questions, eq(questions.id, userAnswers.questionId))
      .where(
        and(
          eq(userAnswers.userId, userId),
          eq(userAnswers.isCorrect, true),
          eq(questions.subjectId, s.id)
        )
      );

    const [{ avgMastery }] = await db
      .select({ avgMastery: sql<number>`avg(${knowledgeNodes.mastery})` })
      .from(knowledgeNodes)
      .where(and(eq(knowledgeNodes.userId, userId), eq(knowledgeNodes.subjectId, s.id)));

    result.push({
      subjectId: s.id,
      title: s.title,
      totalQuestions: Number(total),
      answeredQuestions: Number(answered),
      correctCount: Number(correct),
      knowledgeMastery: Math.round(Number(avgMastery || 0)),
    });
  }
  return c.json({ success: true, data: result });
});

// ========== 导入 ==========
app.post("/import/text", async (c) => {
  return c.json({ error: "Use POST /questions with structured array" }, 400);
});

app.post("/import/document", async (c) => {
  const body = (await c.req.json()) as { fileUrl?: string; urls?: string[] };
  const urls = body.urls || (body.fileUrl ? [body.fileUrl] : []);
  if (urls.length === 0) return c.json({ error: "fileUrl or urls required" }, 400);

  try {
    const blocks = await processUrlsToContentBlocks(urls);
    const text = blocks
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n\n");
    return c.json({ success: true, text });
  } catch (err) {
    return c.json(
      { error: "Document processing failed", message: err instanceof Error ? err.message : String(err) },
      500
    );
  }
});

export default app;
