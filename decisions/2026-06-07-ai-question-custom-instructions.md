# AI 出题添加用户需求输入框

## 日期
2026-06-07

## 需求
在题库 AI 出题面板添加一个文本输入框，让用户输入自定义出题需求：
- 未输入时，AI 按当前默认要求出题
- 输入后，AI 以用户需求为主来出题

## 方案分析

| 方案 | 做法 | 优点 | 缺点 |
|------|------|------|------|
| A | 用户要求注入 userPrompt | 安全，不破坏 JSON 格式等系统核心规则 | 权重相对较低 |
| B | 用户要求注入 systemPrompt | 权重更高，更容易覆盖默认行为 | 可能与系统规则冲突（如破坏 JSON 模式） |

## 用户选择
**方案 A**：用户要求注入 userPrompt。

## 变更内容

### `api/lib/ai.ts`
- `generateQuestions()` 和 `generateQuestionsFromFileUrls()` 添加 `customInstructions?: string` 参数
- userPrompt 末尾追加：`\n\n【用户特殊要求】${customInstructions}`

### `api/question-router.ts`
- `aiGenerate` 和 `aiGenerateFromUrls` Zod schema 添加 `customInstructions: z.string().max(500).optional()`
- 调用 AI 函数时传递 `customInstructions`

### `src/pages/Questions.tsx`
- `genForm` 添加 `customInstructions: ""`
- AI 出题面板添加 Textarea 输入框（label: "出题要求（可选）"）
- 文件出题模式也传递 `customInstructions`
