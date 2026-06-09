// 学习评估公共逻辑 - 供 todo-router 和 study-router 共用
import { getDb } from "../queries/connection";
import {
  studyLogs,
  studyStats,
  knowledgeNodes,
  subjects,
  skillDimensions,
  reviewSchedules,
  questions as questionsTable,
  wrongAnswers,
} from "@db/schema";
import { eq, and } from "drizzle-orm";
import { evaluateTodoTestAnswers } from "./ai";
import { formatLocalDate } from "./date-utils";

// ========== 调试日志 ==========
function debugLog(label: string, data?: unknown) {
  const line = `[STUDY-EVAL] ${label} | ${data !== undefined ? JSON.stringify(data) : ""}`;
  console.log(line);
}

// ========== 间隔重复算法 ==========
export function calculateNextInterval(currentInterval: number, mastery: number): number {
  if (mastery >= 90) return Math.min(currentInterval * 3, 60);
  if (mastery >= 70) return Math.min(currentInterval * 2, 30);
  if (mastery >= 50) return Math.max(Math.round(currentInterval * 1.5), 2);
  return 1;
}

// ========== 题目匹配 ==========
export interface MatchedQuestion {
  id: number;
  content: string;
  options?: string;
  correctAnswer: string;
  explanation: string | null;
  difficulty: number;
  detectedSubject: string | null;
  detectedKnowledgePoint: string | null;
  questionType: string;
  score: number;
}

export async function matchQuestionsFromBank(
  userId: number,
  subjectId: number | null,
  nodeId: number | null,
  nodeTitle: string | null,
  subjectTitle: string | null,
  count: number
): Promise<MatchedQuestion[]> {
  const db = getDb();

  const allQuestions = await db.select().from(questionsTable).where(eq(questionsTable.userId, userId));

  const userWrongAnswers = await db
    .select()
    .from(wrongAnswers)
    .where(and(eq(wrongAnswers.userId, userId), eq(wrongAnswers.mastered, false)));

  const normalizedSubjectTitle = (subjectTitle || "").trim().toLowerCase();
  const normalizedNodeTitle = (nodeTitle || "").trim().toLowerCase();

  const scored = allQuestions
    .map((q) => {
      let score = 0;

      // nodeId 精确匹配 +100
      if (nodeId && q.nodeId === nodeId) score += 100;
      // subjectId 匹配 +50
      else if (subjectId && q.subjectId === subjectId) score += 50;
      // detectedKnowledgePoint 匹配 +30
      else if (q.detectedKnowledgePoint && normalizedNodeTitle) {
        const nqkp = q.detectedKnowledgePoint.toLowerCase();
        if (nqkp.includes(normalizedNodeTitle) || normalizedNodeTitle.includes(nqkp)) score += 30;
      }
      // detectedSubject 匹配 +10
      else if (q.detectedSubject && normalizedSubjectTitle) {
        const nqs = q.detectedSubject.trim().toLowerCase();
        if (nqs === normalizedSubjectTitle || nqs.includes(normalizedSubjectTitle) || normalizedSubjectTitle.includes(nqs)) score += 10;
      }

      // 错题权重 +200
      const isWrong = userWrongAnswers.some(
        (wa) =>
          wa.questionId === q.id ||
          (wa.userAnswer && q.content && wa.userAnswer.includes(q.content.substring(0, 50)))
      );
      if (isWrong) score += 200;

      return { ...q, score };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return Math.random() - 0.5;
    });

  return scored.slice(0, count) as MatchedQuestion[];
}

// ========== 评估混合题型答案 ==========
export interface QuestionForEval {
  id: string;
  content: string;
  correctAnswer: string;
  explanation: string;
  knowledgePoint: string;
  questionType?: string;
}

export interface AnswerForEval {
  questionId: string;
  userAnswer: string;
}

export interface EvalResult {
  mastery: number;
  correctCount: number;
  totalCount: number;
  feedback: string;
  aiEvaluation?: any;
}

export async function evaluateMixedTestAnswers(
  questions: QuestionForEval[],
  answers: AnswerForEval[],
  subjectTitle: string,
  nodeTitles: string[],
  aiApiKey?: string,
  aiApiEndpoint?: string,
  aiModel?: string
): Promise<EvalResult> {
  debugLog("evaluateMixedTestAnswers 开始", {
    questionCount: questions.length,
    answerCount: answers.length,
    subjectTitle,
    nodeTitles,
    hasApiKey: !!aiApiKey,
    hasApiEndpoint: !!aiApiEndpoint,
    model: aiModel,
  });

  const choiceQuestions = questions.filter(
    (q) => q.questionType === "single_choice" || q.questionType === "multiple_choice"
  );
  const otherQuestions = questions.filter(
    (q) => q.questionType !== "single_choice" && q.questionType !== "multiple_choice"
  );

  debugLog("题型分类结果", {
    choiceCount: choiceQuestions.length,
    otherCount: otherQuestions.length,
    choiceIds: choiceQuestions.map((q) => ({ id: q.id, type: q.questionType })),
    otherIds: otherQuestions.map((q) => ({ id: q.id, type: q.questionType })),
  });

  // 选择题本地判断
  let correctCount = 0;
  for (const q of choiceQuestions) {
    const ans = answers.find((a) => a.questionId === q.id);
    debugLog(`选择题 ${q.id} 判断`, {
      hasAnswer: !!ans,
      userAnswer: ans?.userAnswer,
      correctAnswer: q.correctAnswer,
      questionType: q.questionType,
    });
    if (ans) {
      let userAns = ans.userAnswer.trim().toUpperCase();
      let correctAns = q.correctAnswer.trim().toUpperCase();
      if (q.questionType === "multiple_choice") {
        userAns = userAns.split("").sort().join("");
        correctAns = correctAns.split("").sort().join("");
      }
      const isCorrect = userAns === correctAns;
      if (isCorrect) correctCount++;
      debugLog(`选择题 ${q.id} 结果`, { userAns, correctAns, isCorrect });
    }
  }
  debugLog("选择题判断完成", { correctCount, totalChoice: choiceQuestions.length });

  // 非选择题 AI 评估
  let aiEvaluation: any = null;
  if (otherQuestions.length > 0) {
    const otherAnswers = answers.filter((a) =>
      otherQuestions.some((q) => q.id === a.questionId)
    );
    debugLog("调用AI评估非选择题", {
      otherQuestionCount: otherQuestions.length,
      otherAnswerCount: otherAnswers.length,
      questions: otherQuestions.map((q) => ({ id: q.id, content: q.content.slice(0, 50) })),
      answers: otherAnswers.map((a) => ({ questionId: a.questionId, userAnswer: a.userAnswer.slice(0, 50) })),
    });
    try {
      aiEvaluation = await evaluateTodoTestAnswers(
        subjectTitle,
        nodeTitles,
        otherQuestions,
        otherAnswers,
        aiApiKey,
        aiApiEndpoint,
        aiModel
      );
      debugLog("AI评估返回结果", { aiEvaluation });
    } catch (err: any) {
      debugLog("AI评估调用异常", { error: err?.message, stack: err?.stack });
      throw err;
    }
  }

  const totalCount = questions.length;
  let mastery = 0;
  let feedback = "";

  if (choiceQuestions.length > 0 && otherQuestions.length === 0) {
    mastery = Math.round((correctCount / totalCount) * 100);
    feedback = `答对 ${correctCount}/${totalCount} 题，掌握度 ${mastery}%`;
    debugLog("纯选择题结果", { mastery, correctCount, totalCount, feedback });
  } else if (choiceQuestions.length === 0 && otherQuestions.length > 0) {
    mastery = aiEvaluation?.mastery || 0;
    feedback = `AI评估掌握度 ${mastery}%`;
    debugLog("纯非选择题结果", { mastery, aiMastery: aiEvaluation?.mastery, feedback });
  } else {
    const choiceWeight = choiceQuestions.length / totalCount;
    const otherWeight = otherQuestions.length / totalCount;
    const choiceMastery = choiceQuestions.length > 0
      ? Math.round((correctCount / choiceQuestions.length) * 100)
      : 0;
    const otherMastery = aiEvaluation?.mastery || 0;
    mastery = Math.round(choiceMastery * choiceWeight + otherMastery * otherWeight);
    feedback = `选择题 ${correctCount}/${choiceQuestions.length} 正确，AI评估主观题掌握度 ${otherMastery}%，综合掌握度 ${mastery}%`;
    debugLog("混合题型结果", { mastery, choiceMastery, otherMastery, choiceWeight, otherWeight, feedback });
  }

  const result = {
    mastery,
    correctCount: correctCount + (aiEvaluation?.correctCount || 0),
    totalCount,
    feedback,
    aiEvaluation,
  };
  debugLog("evaluateMixedTestAnswers 最终返回", result);
  return result;
}

// ========== 更新学习统计 ==========
export async function upsertStudyStats(
  userId: number,
  statDate: string,
  actualMinutes: number,
  quality: number,
  nodesCount: number
) {
  const db = getDb();
  const existing = await db
    .select()
    .from(studyStats)
    .where(and(eq(studyStats.userId, userId), eq(studyStats.statDate, statDate)));

  if (existing.length > 0) {
    const stat = existing[0];
    const currentAvg = stat.avgQuality || 0;
    await db
      .update(studyStats)
      .set({
        totalMinutes: stat.totalMinutes + actualMinutes,
        sessionsCount: stat.sessionsCount + 1,
        avgQuality:
          Math.round(
            ((currentAvg * stat.sessionsCount + quality) / (stat.sessionsCount + 1)) * 10
          ) / 10,
      })
      .where(eq(studyStats.id, stat.id));
  } else {
    await db.insert(studyStats).values({
      userId,
      statDate,
      totalMinutes: actualMinutes,
      sessionsCount: 1,
      avgQuality: quality,
      nodesStudied: nodesCount,
    });
  }
}

// ========== 更新知识节点掌握度 ==========
export async function updateNodeMastery(
  userId: number,
  nodeTitles: string[],
  testMastery: number
) {
  const db = getDb();
  for (const title of nodeTitles) {
    const matched = await db
      .select()
      .from(knowledgeNodes)
      .where(and(eq(knowledgeNodes.userId, userId), eq(knowledgeNodes.title, title)));
    for (const kn of matched) {
      const newMastery = Math.round(kn.mastery * 0.7 + testMastery * 0.3);
      await db
        .update(knowledgeNodes)
        .set({ mastery: Math.min(100, newMastery) })
        .where(eq(knowledgeNodes.id, kn.id));
    }
  }
}

// ========== 更新科目进度 ==========
export async function updateSubjectProgress(userId: number, subjectId: number) {
  const db = getDb();
  const nodes = await db
    .select()
    .from(knowledgeNodes)
    .where(and(eq(knowledgeNodes.userId, userId), eq(knowledgeNodes.subjectId, subjectId)));

  if (nodes.length > 0) {
    const avgMastery = nodes.reduce((sum, n) => sum + n.mastery, 0) / nodes.length;
    await db
      .update(subjects)
      .set({ progress: Math.round(avgMastery) })
      .where(eq(subjects.id, subjectId));
  }
}

// ========== 更新技能维度 ==========
export async function updateSkillDimensions(
  userId: number,
  subjectId: number,
  mastery: number,
  actualMinutes: number
) {
  const db = getDb();
  const subSkills = await db
    .select()
    .from(skillDimensions)
    .where(and(eq(skillDimensions.userId, userId), eq(skillDimensions.subjectId, subjectId)));

  for (const skill of subSkills) {
    const expGain = Math.round((mastery / 100) * actualMinutes * skill.weight);
    const newExp = skill.experience + expGain;
    let newLevel = skill.currentLevel;
    let newExpToNext = skill.experienceToNext;
    let remainingExp = newExp;

    while (remainingExp >= newExpToNext && newLevel < skill.maxLevel) {
      remainingExp -= newExpToNext;
      newLevel += 1;
      newExpToNext = Math.round(newExpToNext * 1.2);
    }

    await db
      .update(skillDimensions)
      .set({
        currentLevel: newLevel,
        experience: remainingExp,
        experienceToNext: newExpToNext,
      })
      .where(eq(skillDimensions.id, skill.id));
  }
}

// ========== 更新/创建复习调度 ==========
export async function upsertReviewSchedule(
  userId: number,
  planId: number | null,
  nodeTitle: string,
  subjectTitle: string,
  mastery: number
) {
  const db = getDb();
  const today = formatLocalDate();

  const conditions: any[] = [
    eq(reviewSchedules.userId, userId),
    eq(reviewSchedules.nodeTitle, nodeTitle),
    eq(reviewSchedules.subjectTitle, subjectTitle),
  ];
  if (planId !== null) {
    conditions.push(eq(reviewSchedules.planId, planId));
  }

  const [existing] = await db
    .select()
    .from(reviewSchedules)
    .where(and(...conditions));

  if (existing) {
    const newInterval = calculateNextInterval(existing.intervalDays, mastery);
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + newInterval);

    const existingDates = (() => {
      try {
        return JSON.parse(existing.reviewDates || "[]");
      } catch {
        return [];
      }
    })();

    await db
      .update(reviewSchedules)
      .set({
        reviewCount: existing.reviewCount + 1,
        nextReviewDate: formatLocalDate(nextDate),
        intervalDays: newInterval,
        mastery: Math.max(existing.mastery, mastery),
        reviewDates: JSON.stringify([...existingDates, today]),
        status: mastery >= 95 && existing.reviewCount >= 2 ? "mastered" : "active",
      })
      .where(eq(reviewSchedules.id, existing.id));
  } else {
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + 1);

    await db.insert(reviewSchedules).values({
      userId,
      planId,
      nodeTitle,
      subjectTitle,
      originalStudyDate: today,
      reviewDates: JSON.stringify([]),
      nextReviewDate: formatLocalDate(nextDate),
      intervalDays: 1,
      reviewCount: 0,
      mastery,
      status: "active",
    });
  }
}

// ========== 收集错题 ==========
export async function collectWrongAnswers(
  userId: number,
  questions: QuestionForEval[],
  answers: AnswerForEval[],
  aiEvaluation?: any,
  subjectId?: number,
  nodeId?: number
) {
  const db = getDb();
  console.log("[collectWrongAnswers] 开始", { userId, questionCount: questions.length, answerCount: answers.length, subjectId, nodeId });

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    console.log(`[collectWrongAnswers] 处理第${i + 1}/${questions.length}题`, { questionId: q.id, type: q.questionType });
    const ans = answers.find((a) => a.questionId === q.id);
    if (!ans) {
      console.log(`[collectWrongAnswers] 第${i + 1}题无答案，跳过`);
      continue;
    }

    const isChoice = q.questionType === "single_choice" || q.questionType === "multiple_choice";
    let isCorrect = false;

    if (isChoice) {
      let userAns = ans.userAnswer.trim().toUpperCase();
      let correctAns = q.correctAnswer.trim().toUpperCase();
      if (q.questionType === "multiple_choice") {
        userAns = userAns.split("").sort().join("");
        correctAns = correctAns.split("").sort().join("");
      }
      isCorrect = userAns === correctAns;
      console.log(`[collectWrongAnswers] 第${i + 1}题选择题判断`, { userAns, correctAns, isCorrect });
    } else {
      const questionEval = aiEvaluation?.details?.find((d: any) => d.questionId === q.id);
      isCorrect = questionEval?.isCorrect || false;
      console.log(`[collectWrongAnswers] 第${i + 1}题非选择题判断`, { isCorrect, hasEvalDetail: !!questionEval });
    }

    if (!isCorrect) {
      console.log(`[collectWrongAnswers] 第${i + 1}题答错，查询题库`);
      let questionId: number | null = null;
      try {
        // 1. 尝试精确匹配 content
        const dbQuestions = await db
          .select()
          .from(questionsTable)
          .where(and(eq(questionsTable.userId, userId), eq(questionsTable.content, q.content)))
          .limit(1);
        console.log(`[collectWrongAnswers] 第${i + 1}题精确匹配结果`, { matched: dbQuestions.length > 0 });

        if (dbQuestions.length > 0) {
          questionId = dbQuestions[0].id;
        } else {
          // 2. 尝试 content 前100字符模糊匹配
          const fuzzyMatch = await db
            .select()
            .from(questionsTable)
            .where(
              and(
                eq(questionsTable.userId, userId),
                q.content.length >= 50
                  ? eq(questionsTable.content, q.content.substring(0, 100))
                  : undefined
              )
            )
            .limit(1);
          console.log(`[collectWrongAnswers] 第${i + 1}题模糊匹配结果`, { matched: fuzzyMatch.length > 0 });

          if (fuzzyMatch.length > 0) {
            questionId = fuzzyMatch[0].id;
          }
        }

        // 3. 题库中没有，插入新题目
        if (!questionId) {
          console.log(`[collectWrongAnswers] 第${i + 1}题题库中未找到，自动插入题库`);
          try {
            const [{ id: newId }] = await db
              .insert(questionsTable)
              .values({
                userId,
                subjectId: subjectId || null,
                nodeId: nodeId || null,
                questionType: (q.questionType || "single_choice") as "single_choice" | "multiple_choice" | "fill_blank" | "short_answer" | "essay" | "mixed",
                content: q.content,
                options: null,
                correctAnswer: q.correctAnswer,
                explanation: q.explanation,
                difficulty: 3,
                aiGenerated: true,
                detectedKnowledgePoint: q.knowledgePoint,
              })
              .$returningId();
            questionId = newId;
            console.log(`[collectWrongAnswers] 第${i + 1}题插入题库成功`, { questionId: newId });
          } catch (insertErr: any) {
            console.error(`[collectWrongAnswers] 第${i + 1}题插入题库失败`, insertErr?.message);
          }
        }

        // 4. 记录到错题本
        if (questionId) {
          console.log(`[collectWrongAnswers] 第${i + 1}题查询错题记录`, { questionId });
          const existingWrong = await db
            .select()
            .from(wrongAnswers)
            .where(
              and(
                eq(wrongAnswers.userId, userId),
                eq(wrongAnswers.questionId, questionId)
              )
            )
            .limit(1);
          console.log(`[collectWrongAnswers] 第${i + 1}题错题记录查询结果`, { exists: existingWrong.length > 0 });

          if (existingWrong.length > 0) {
            await db
              .update(wrongAnswers)
              .set({
                wrongCount: existingWrong[0].wrongCount + 1,
                lastWrongAt: new Date(),
                mastered: false,
              })
              .where(eq(wrongAnswers.id, existingWrong[0].id));
            console.log(`[collectWrongAnswers] 第${i + 1}题错题记录更新完成`);
          } else {
            await db.insert(wrongAnswers).values({
              userId,
              questionId,
              userAnswer: ans.userAnswer,
              wrongCount: 1,
              lastWrongAt: new Date(),
              mastered: false,
            });
            console.log(`[collectWrongAnswers] 第${i + 1}题错题记录插入完成`);
          }
        } else {
          console.log(`[collectWrongAnswers] 第${i + 1}题无法获取questionId，跳过`);
        }
      } catch (err: any) {
        console.error(`[collectWrongAnswers] 第${i + 1}题处理异常`, err?.message);
        throw err;
      }
    } else {
      console.log(`[collectWrongAnswers] 第${i + 1}题答对，跳过`);
    }
  }
  console.log("[collectWrongAnswers] 全部完成");
}

// ========== 构建学习记录内容 ==========
export function buildStudyLogContent(
  subjectTitle: string,
  nodeTitles: string[],
  evaluation: EvalResult
): string {
  const weakPoints = evaluation.aiEvaluation?.weakPoints || [];
  const suggestions = evaluation.aiEvaluation?.suggestions || [];
  return `今日学习：${subjectTitle}\n知识点：${nodeTitles.join("、")}\n\nAI测试成绩：${evaluation.correctCount}/${evaluation.totalCount} 题\n掌握度：${evaluation.mastery}%\n\n${weakPoints.length > 0 ? `薄弱点：${weakPoints.join("、")}\n` : ""}${suggestions.length > 0 ? `建议：${suggestions.join("；")}` : ""}`;
}
