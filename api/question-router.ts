import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { questions, userAnswers, wrongAnswers, knowledgeNodes, userSettings, subjects } from "@db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { generateQuestions, generateQuestionsFromFileUrls, evaluateAnswer, recognizeQuestionsFromUrls, chatWithAI } from "./lib/ai";
import type { KimiContent } from "./lib/ai";

export const questionRouter = createRouter({
  // 列出题库中的题目
  list: authedQuery
    .input(
      z
        .object({
          subjectId: z.number().optional(),
          nodeId: z.number().optional(),
          skillId: z.number().optional(),
          questionType: z.enum(["single_choice", "multiple_choice", "fill_blank", "short_answer", "essay", "mixed"]).optional(),
          limit: z.number().default(50),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(questions.userId, ctx.user.id)];

      if (input?.subjectId) conditions.push(eq(questions.subjectId, input.subjectId));
      if (input?.nodeId) conditions.push(eq(questions.nodeId, input.nodeId));
      if (input?.skillId) conditions.push(eq(questions.skillId, input.skillId));
      if (input?.questionType) conditions.push(eq(questions.questionType, input.questionType));

      return getDb()
        .select()
        .from(questions)
        .where(and(...conditions))
        .orderBy(desc(questions.createdAt))
        .limit(input?.limit || 50);
    }),

  // 获取单题详情
  getById: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const [q] = await getDb()
        .select()
        .from(questions)
        .where(and(eq(questions.id, input.id), eq(questions.userId, ctx.user.id)));
      return q || null;
    }),

  // AI出题
  aiGenerate: authedQuery
    .input(
      z.object({
        topic: z.string().min(1),
        knowledgeContent: z.string().optional(),
        questionType: z.enum(["single_choice", "multiple_choice", "fill_blank", "short_answer", "essay", "mixed"]).default("single_choice"),
        count: z.number().min(1).max(20).default(5),
        difficulty: z.number().min(1).max(5).default(3),
        subjectId: z.number().optional(),
        nodeId: z.number().optional(),
        skillId: z.number().optional(),
        requireChemicalStructure: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [setting] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, ctx.user.id));

      // 如果没有提供知识点内容，尝试从数据库获取
      let content = input.knowledgeContent || "";
      if (!content && input.nodeId) {
        const [node] = await db
          .select()
          .from(knowledgeNodes)
          .where(and(eq(knowledgeNodes.id, input.nodeId), eq(knowledgeNodes.userId, ctx.user.id)));
        if (node) {
          content = node.description || node.title;
        }
      }

      const result = await generateQuestions(
        input.topic,
        content || input.topic,
        input.questionType,
        input.count,
        input.difficulty,
        setting?.aiApiKey || undefined,
        setting?.aiApiEndpoint || undefined,
        setting?.aiModel || undefined,
        input.requireChemicalStructure || false
      );

      // 获取用户的学科和知识点列表，用于AI识别匹配
      const userSubjects = await db
        .select()
        .from(subjects)
        .where(eq(subjects.userId, ctx.user.id));

      const userNodes = await db
        .select()
        .from(knowledgeNodes)
        .where(eq(knowledgeNodes.userId, ctx.user.id));

      // 保存题目到数据库
      const savedQuestions = [];
      console.log("[question.aiGenerate] 开始保存题目", { count: result.questions.length, firstQuestion: result.questions[0] });
      for (const q of result.questions) {
        // 尝试根据AI识别的学科和知识点匹配本地数据
        let matchedSubjectId = input.subjectId;
        let matchedNodeId = input.nodeId;

        if (!matchedSubjectId && q.detectedSubject) {
          // 尝试匹配学科名称（模糊匹配）
          const matchedSubject = userSubjects.find(
            s => s.title.toLowerCase().includes(q.detectedSubject!.toLowerCase()) ||
                 q.detectedSubject!.toLowerCase().includes(s.title.toLowerCase())
          );
          if (matchedSubject) {
            matchedSubjectId = matchedSubject.id;
          }
        }

        if (!matchedNodeId && q.detectedKnowledgePoint) {
          // 尝试匹配知识点名称（模糊匹配）
          const matchedNode = userNodes.find(
            n => n.title.toLowerCase().includes(q.detectedKnowledgePoint!.toLowerCase()) ||
                 q.detectedKnowledgePoint!.toLowerCase().includes(n.title.toLowerCase())
          );
          if (matchedNode) {
            matchedNodeId = matchedNode.id;
            // 如果匹配到知识点但没有匹配到学科，使用知识点的学科
            if (!matchedSubjectId) {
              matchedSubjectId = matchedNode.subjectId;
            }
          }
        }

        const insertValues = {
          userId: ctx.user.id,
          subjectId: matchedSubjectId,
          nodeId: matchedNodeId,
          skillId: input.skillId,
          questionType: input.questionType,
          content: q.content,
          options: q.options ? JSON.stringify(q.options) : null,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation,
          difficulty: q.difficulty,
          imageUrl: q.imageUrl || null,
          aiGenerated: true,
          detectedSubject: q.detectedSubject || null,
          detectedKnowledgePoint: q.detectedKnowledgePoint || null,
          smiles: (q as any).smiles || null,
          inchi: (q as any).inchi || null,
        };
        console.log("[question.aiGenerate] 准备插入题目", {
          content: q.content?.slice(0, 50),
          optionsType: typeof q.options,
          options: q.options,
          optionsJson: insertValues.options,
          difficulty: q.difficulty,
          difficultyType: typeof q.difficulty,
        });

        let insertResult;
        try {
          insertResult = await db
            .insert(questions)
            .values(insertValues)
            .$returningId();
        } catch (insertErr) {
          console.error("[question.aiGenerate] 插入题目失败", {
            error: insertErr instanceof Error ? insertErr.message : String(insertErr),
            stack: insertErr instanceof Error ? insertErr.stack : undefined,
            insertValues,
          });
          throw insertErr;
        }
        console.log("[question.aiGenerate] 插入题目成功", { id: insertResult?.[0]?.id });
        const [{ id }] = insertResult;

        savedQuestions.push({ id, ...q, subjectId: matchedSubjectId, nodeId: matchedNodeId });
      }

      return { success: true, questions: savedQuestions };
    }),

  // AI出题（从文件URL读取内容后出题）
  aiGenerateFromUrls: authedQuery
    .input(
      z.object({
        urls: z.array(z.string().url()).min(1).max(5),
        questionType: z.enum(["single_choice", "multiple_choice", "fill_blank", "short_answer", "essay", "mixed"]).default("single_choice"),
        count: z.number().min(1).max(20).default(5),
        difficulty: z.number().min(1).max(5).default(3),
        subjectId: z.number().optional(),
        nodeId: z.number().optional(),
        skillId: z.number().optional(),
        requireChemicalStructure: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [setting] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, ctx.user.id));

      const result = await generateQuestionsFromFileUrls(
        input.urls,
        input.questionType,
        input.count,
        input.difficulty,
        setting?.aiApiKey || undefined,
        setting?.aiApiEndpoint || undefined,
        setting?.aiModel || undefined,
        input.requireChemicalStructure || false
      );

      // 获取用户的学科和知识点列表，用于AI识别匹配
      const userSubjects = await db
        .select()
        .from(subjects)
        .where(eq(subjects.userId, ctx.user.id));

      const userNodes = await db
        .select()
        .from(knowledgeNodes)
        .where(eq(knowledgeNodes.userId, ctx.user.id));

      // 保存题目到数据库
      const savedQuestions = [];
      for (const q of result.questions) {
        // 尝试根据AI识别的学科和知识点匹配本地数据
        let matchedSubjectId = input.subjectId;
        let matchedNodeId = input.nodeId;

        if (!matchedSubjectId && q.detectedSubject) {
          const matchedSubject = userSubjects.find(
            s => s.title.toLowerCase().includes(q.detectedSubject!.toLowerCase()) ||
                 q.detectedSubject!.toLowerCase().includes(s.title.toLowerCase())
          );
          if (matchedSubject) {
            matchedSubjectId = matchedSubject.id;
          }
        }

        if (!matchedNodeId && q.detectedKnowledgePoint) {
          const matchedNode = userNodes.find(
            n => n.title.toLowerCase().includes(q.detectedKnowledgePoint!.toLowerCase()) ||
                 q.detectedKnowledgePoint!.toLowerCase().includes(n.title.toLowerCase())
          );
          if (matchedNode) {
            matchedNodeId = matchedNode.id;
            if (!matchedSubjectId) {
              matchedSubjectId = matchedNode.subjectId;
            }
          }
        }

        const [{ id }] = await db
          .insert(questions)
          .values({
            userId: ctx.user.id,
            subjectId: matchedSubjectId,
            nodeId: matchedNodeId,
            skillId: input.skillId,
            questionType: input.questionType,
            content: q.content,
            options: q.options ? JSON.stringify(q.options) : null,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
            difficulty: q.difficulty,
            imageUrl: q.imageUrl || null,
            aiGenerated: true,
            detectedSubject: q.detectedSubject || null,
            detectedKnowledgePoint: q.detectedKnowledgePoint || null,
          })
          .$returningId();

        savedQuestions.push({ id, ...q, subjectId: matchedSubjectId, nodeId: matchedNodeId });
      }

      return { success: true, questions: savedQuestions };
    }),

  // AI识别文档/图片中的题目
  recognizeFromUrls: authedQuery
    .input(
      z.object({
        urls: z.array(z.string().url()).min(1).max(5),
        questionType: z.enum(["single_choice", "multiple_choice", "fill_blank", "short_answer", "essay", "mixed"]).default("single_choice"),
        subjectId: z.number().optional(),
        nodeId: z.number().optional(),
        skillId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [setting] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, ctx.user.id));

      const result = await recognizeQuestionsFromUrls(
        input.urls,
        input.questionType,
        setting?.aiApiKey || undefined,
        setting?.aiApiEndpoint || undefined,
        setting?.aiModel || undefined
      );

      // 获取用户的学科和知识点列表，用于AI识别匹配
      const userSubjects = await db
        .select()
        .from(subjects)
        .where(eq(subjects.userId, ctx.user.id));

      const userNodes = await db
        .select()
        .from(knowledgeNodes)
        .where(eq(knowledgeNodes.userId, ctx.user.id));

      const savedQuestions = [];
      for (const q of result.questions) {
        // 尝试根据AI识别的学科和知识点匹配本地数据
        let matchedSubjectId = input.subjectId;
        let matchedNodeId = input.nodeId;

        if (!matchedSubjectId && q.detectedSubject) {
          const matchedSubject = userSubjects.find(
            s => s.title.toLowerCase().includes(q.detectedSubject!.toLowerCase()) ||
                 q.detectedSubject!.toLowerCase().includes(s.title.toLowerCase())
          );
          if (matchedSubject) {
            matchedSubjectId = matchedSubject.id;
          }
        }

        if (!matchedNodeId && q.detectedKnowledgePoint) {
          const matchedNode = userNodes.find(
            n => n.title.toLowerCase().includes(q.detectedKnowledgePoint!.toLowerCase()) ||
                 q.detectedKnowledgePoint!.toLowerCase().includes(n.title.toLowerCase())
          );
          if (matchedNode) {
            matchedNodeId = matchedNode.id;
            if (!matchedSubjectId) {
              matchedSubjectId = matchedNode.subjectId;
            }
          }
        }

        const [{ id }] = await db
          .insert(questions)
          .values({
            userId: ctx.user.id,
            subjectId: matchedSubjectId,
            nodeId: matchedNodeId,
            skillId: input.skillId,
            questionType: input.questionType,
            content: q.content,
            options: q.options ? JSON.stringify(q.options) : null,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
            difficulty: q.difficulty,
            imageUrl: q.imageUrl || null,
            aiGenerated: true,
            detectedSubject: q.detectedSubject || null,
            detectedKnowledgePoint: q.detectedKnowledgePoint || null,
          })
          .$returningId();

        savedQuestions.push({ id, ...q, subjectId: matchedSubjectId, nodeId: matchedNodeId });
      }

      return { success: true, questions: savedQuestions };
    }),

  // 更新题目（如有图片则调用AI重新生成答案和解析）
  update: authedQuery
    .input(
      z.object({
        id: z.number(),
        content: z.string().optional(),
        options: z.string().optional(),
        correctAnswer: z.string().optional(),
        explanation: z.string().optional(),
        difficulty: z.number().min(1).max(5).optional(),
        imageUrl: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      console.log("[question.update] 开始", { questionId: input.id, userId: ctx.user.id });

      // 查询现有题目
      const [existing] = await db
        .select()
        .from(questions)
        .where(and(eq(questions.id, input.id), eq(questions.userId, ctx.user.id)));

      if (!existing) {
        console.log("[question.update] 题目不存在");
        throw new Error("题目不存在");
      }
      console.log("[question.update] 现有题目", {
        id: existing.id,
        hasImage: !!existing.imageUrl,
        imageUrl: existing.imageUrl,
        contentLength: existing.content?.length,
      });

      const updateData: Partial<typeof questions.$inferInsert> = {};

      if (input.content !== undefined) updateData.content = input.content;
      if (input.options !== undefined) updateData.options = input.options;
      if (input.correctAnswer !== undefined) updateData.correctAnswer = input.correctAnswer;
      if (input.explanation !== undefined) updateData.explanation = input.explanation;
      if (input.difficulty !== undefined) updateData.difficulty = input.difficulty;
      if (input.imageUrl !== undefined) updateData.imageUrl = input.imageUrl;

      // 合并后的题目数据（用于判断是否需要AI重生成）
      const mergedContent = input.content !== undefined ? input.content : existing.content;
      const mergedImageUrl = input.imageUrl !== undefined ? input.imageUrl : existing.imageUrl;
      const mergedOptions = input.options !== undefined ? input.options : existing.options;

      console.log("[question.update] 合并后数据", {
        hasImage: !!mergedImageUrl,
        imageUrl: mergedImageUrl,
        contentChanged: input.content !== undefined,
        imageChanged: input.imageUrl !== undefined,
      });

      // 如果题目有图片（新上传或原本就有），调用AI重新生成答案和解析
      if (mergedImageUrl) {
        console.log("[question.update] 检测到图片，准备调用AI重新生成答案和解析");

        const [setting] = await db
          .select()
          .from(userSettings)
          .where(eq(userSettings.userId, ctx.user.id));

        console.log("[question.update] 用户设置", {
          hasApiKey: !!setting?.aiApiKey,
          hasApiEndpoint: !!setting?.aiApiEndpoint,
          model: setting?.aiModel,
        });

        // 构建多模态消息
        const contentBlocks: KimiContent[] = [];

        // 添加图片
        const imageExts = ["png", "jpg", "jpeg", "gif", "webp", "bmp"];
        const ext = mergedImageUrl.split("?")[0].split(".").pop()?.toLowerCase() || "";
        if (imageExts.includes(ext)) {
          contentBlocks.push({ type: "image_url", image_url: { url: mergedImageUrl, detail: "high" } });
          console.log("[question.update] 使用 image_url 发送图片", { url: mergedImageUrl, ext });
        } else {
          contentBlocks.push({ type: "file_url", file_url: { url: mergedImageUrl } });
          console.log("[question.update] 使用 file_url 发送文件", { url: mergedImageUrl, ext });
        }

        // 添加题干文字
        let promptText = `请根据以下题目内容${mergedImageUrl ? "和图片" : ""}，重新生成或修正正确答案和详细解析。\n\n题目内容：\n${mergedContent}`;
        if (mergedOptions) {
          try {
            const opts = JSON.parse(mergedOptions);
            if (Array.isArray(opts) && opts.length > 0) {
              promptText += "\n\n选项：\n" + opts.map((o: any) => `${o.label}. ${o.text}`).join("\n");
            }
          } catch {
            console.log("[question.update] 选项解析失败，忽略选项");
          }
        }
        promptText += "\n\n请严格按照以下JSON格式返回，不要包含任何其他文本：\n{\n  \"correctAnswer\": \"正确答案\",\n  \"explanation\": \"详细解析\"\n}";

        contentBlocks.push({ type: "text", text: promptText });
        console.log("[question.update] promptText长度", { length: promptText.length });

        const systemPrompt = "你是一个专业的教育AI。请仔细分析用户提供的题目内容和图片，给出准确的正确答案和详细的解析。请严格按照JSON格式返回。";

        try {
          console.log("[question.update] 开始调用chatWithAI");
          const aiResult = await chatWithAI(
            [
              { role: "system", content: systemPrompt },
              { role: "user", content: contentBlocks },
            ],
            setting?.aiApiKey || undefined,
            setting?.aiApiEndpoint || undefined,
            setting?.aiModel || undefined,
            true,
            "question.update.regenerate"
          );
          console.log("[question.update] chatWithAI 返回", { resultLength: aiResult.length, first200: aiResult.slice(0, 200) });

          // 解析JSON
          let parsed: any;
          try {
            // 去除markdown代码块
            let cleaned = aiResult.trim();
            if (cleaned.startsWith("```")) {
              const lines = cleaned.split("\n");
              const startIdx = lines[0].startsWith("```") ? 1 : 0;
              const endIdx = lines[lines.length - 1] === "```" ? lines.length - 1 : lines.length;
              cleaned = lines.slice(startIdx, endIdx).join("\n");
            }
            // 查找JSON对象
            const braceStart = cleaned.indexOf("{");
            const braceEnd = cleaned.lastIndexOf("}");
            if (braceStart >= 0 && braceEnd > braceStart) {
              cleaned = cleaned.slice(braceStart, braceEnd + 1);
            }
            parsed = JSON.parse(cleaned);
            console.log("[question.update] JSON解析成功", { parsed });
          } catch (parseErr: any) {
            console.error("[question.update] JSON解析失败", parseErr?.message, "raw:", aiResult.slice(0, 500));
            // 解析失败不影响保存，继续用用户提供的值
            parsed = null;
          }

          if (parsed) {
            if (parsed.correctAnswer) {
              updateData.correctAnswer = parsed.correctAnswer;
              console.log("[question.update] AI生成correctAnswer", { correctAnswer: parsed.correctAnswer });
            }
            if (parsed.explanation) {
              updateData.explanation = parsed.explanation;
              console.log("[question.update] AI生成explanation", { explanationLength: parsed.explanation.length });
            }
          }
        } catch (aiErr: any) {
          console.error("[question.update] AI调用失败", aiErr?.message);
          // AI失败不影响保存，继续用用户提供的值
        }
      } else {
        console.log("[question.update] 无图片，跳过AI重新生成");
      }

      console.log("[question.update] 最终更新数据", { keys: Object.keys(updateData) });

      await db
        .update(questions)
        .set(updateData)
        .where(and(eq(questions.id, input.id), eq(questions.userId, ctx.user.id)));

      console.log("[question.update] 数据库更新完成");

      // 查询更新后的题目返回
      const [updated] = await db
        .select()
        .from(questions)
        .where(and(eq(questions.id, input.id), eq(questions.userId, ctx.user.id)));

      return {
        success: true,
        question: updated,
        aiRegenerated: !!mergedImageUrl,
      };
    }),

  // 删除题目
  delete: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .delete(userAnswers)
        .where(and(eq(userAnswers.questionId, input.id), eq(userAnswers.userId, ctx.user.id)));
      await db
        .delete(wrongAnswers)
        .where(and(eq(wrongAnswers.questionId, input.id), eq(wrongAnswers.userId, ctx.user.id)));
      await db
        .delete(questions)
        .where(and(eq(questions.id, input.id), eq(questions.userId, ctx.user.id)));
      return { success: true };
    }),

  // 批量删除题目
  deleteMany: authedQuery
    .input(z.object({ ids: z.array(z.number()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      for (const id of input.ids) {
        await db
          .delete(userAnswers)
          .where(and(eq(userAnswers.questionId, id), eq(userAnswers.userId, ctx.user.id)));
        await db
          .delete(wrongAnswers)
          .where(and(eq(wrongAnswers.questionId, id), eq(wrongAnswers.userId, ctx.user.id)));
        await db
          .delete(questions)
          .where(and(eq(questions.id, id), eq(questions.userId, ctx.user.id)));
      }
      return { success: true, count: input.ids.length };
    }),

  // 提交答案
  submitAnswer: authedQuery
    .input(
      z.object({
        questionId: z.number(),
        userAnswer: z.string(),
        timeSpent: z.number().optional(), // 秒
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();

      // 获取题目
      const [question] = await db
        .select()
        .from(questions)
        .where(and(eq(questions.id, input.questionId), eq(questions.userId, ctx.user.id)));

      if (!question) throw new Error("题目不存在");

      // AI评估答案
      const [setting] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, ctx.user.id));

      const evaluation = await evaluateAnswer(
        question.content,
        question.correctAnswer,
        input.userAnswer,
        question.questionType,
        setting?.aiApiKey || undefined,
        setting?.aiApiEndpoint || undefined,
        setting?.aiModel || undefined
      );

      // 保存答题记录
      const [{ id: answerId }] = await db
        .insert(userAnswers)
        .values({
          userId: ctx.user.id,
          questionId: input.questionId,
          userAnswer: input.userAnswer,
          isCorrect: evaluation.isCorrect,
          score: evaluation.score,
          timeSpent: input.timeSpent,
        })
        .$returningId();

      // 如果答错，加入错题本
      if (!evaluation.isCorrect) {
        const existing = await db
          .select()
          .from(wrongAnswers)
          .where(
            and(
              eq(wrongAnswers.userId, ctx.user.id),
              eq(wrongAnswers.questionId, input.questionId)
            )
          );

        if (existing.length > 0) {
          await db
            .update(wrongAnswers)
            .set({
              wrongCount: existing[0].wrongCount + 1,
              lastWrongAt: new Date(),
              userAnswer: input.userAnswer,
              mastered: false,
            })
            .where(eq(wrongAnswers.id, existing[0].id));
        } else {
          await db.insert(wrongAnswers).values({
            userId: ctx.user.id,
            questionId: input.questionId,
            userAnswer: input.userAnswer,
            wrongCount: 1,
            lastWrongAt: new Date(),
            mastered: false,
          });
        }
      } else {
        // 如果答对，更新错题本中的复习次数
        const existing = await db
          .select()
          .from(wrongAnswers)
          .where(
            and(
              eq(wrongAnswers.userId, ctx.user.id),
              eq(wrongAnswers.questionId, input.questionId)
            )
          );

        if (existing.length > 0) {
          await db
            .update(wrongAnswers)
            .set({
              reviewCount: existing[0].reviewCount + 1,
              mastered: existing[0].reviewCount >= 2, // 复习2次后标记为掌握
            })
            .where(eq(wrongAnswers.id, existing[0].id));
        }
      }

      return {
        answerId,
        isCorrect: evaluation.isCorrect,
        score: evaluation.score,
        feedback: evaluation.feedback,
        mastery: evaluation.mastery,
        explanation: question.explanation,
      };
    }),

  // 获取错题本
  getWrongAnswers: authedQuery
    .input(
      z
        .object({
          subjectId: z.number().optional(),
          mastered: z.boolean().optional(),
          limit: z.number().default(50),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const conditions = [eq(wrongAnswers.userId, ctx.user.id)];

      if (input?.mastered !== undefined) {
        conditions.push(eq(wrongAnswers.mastered, input.mastered));
      }

      const wrongs = await db
        .select()
        .from(wrongAnswers)
        .where(and(...conditions))
        .orderBy(desc(wrongAnswers.lastWrongAt))
        .limit(input?.limit || 50);

      // 关联题目信息
      const questionIds = wrongs.map((w) => w.questionId);
      const qs = questionIds.length > 0
        ? await db
            .select()
            .from(questions)
            .where(eq(questions.userId, ctx.user.id))
            .then((rows) => rows.filter((q) => questionIds.includes(q.id)))
        : [];

      const qMap = new Map(qs.map((q) => [q.id, q]));

      return wrongs.map((w) => ({
        ...w,
        question: qMap.get(w.questionId) || null,
      }));
    }),

  // 标记错题为已掌握
  markMastered: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await getDb()
        .update(wrongAnswers)
        .set({ mastered: true, reviewCount: sql`${wrongAnswers.reviewCount} + 1` })
        .where(and(eq(wrongAnswers.id, input.id), eq(wrongAnswers.userId, ctx.user.id)));

      return { success: true };
    }),

  // 删除错题记录
  deleteWrongAnswer: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await getDb()
        .delete(wrongAnswers)
        .where(and(eq(wrongAnswers.id, input.id), eq(wrongAnswers.userId, ctx.user.id)));

      return { success: true };
    }),

  // 获取答题统计
  getStats: authedQuery.query(async ({ ctx }) => {
    const db = getDb();

    const allAnswers = await db
      .select()
      .from(userAnswers)
      .where(eq(userAnswers.userId, ctx.user.id));

    const totalQuestions = allAnswers.length;
    const correctCount = allAnswers.filter((a) => a.isCorrect).length;
    const avgScore = totalQuestions > 0
      ? Math.round(allAnswers.reduce((sum, a) => sum + a.score, 0) / totalQuestions)
      : 0;

    const wrongCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(wrongAnswers)
      .where(and(eq(wrongAnswers.userId, ctx.user.id), eq(wrongAnswers.mastered, false)))
      .then((r) => r[0]?.count || 0);

    return {
      totalQuestions,
      correctCount,
      wrongCount,
      accuracy: totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0,
      avgScore,
    };
  }),
});
