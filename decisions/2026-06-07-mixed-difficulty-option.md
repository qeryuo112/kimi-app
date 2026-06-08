# AI 出题添加"混合难度"选项

## 日期
2026-06-07

## 需求
出题难度部分新增"混合难度"选项，让 AI 生成覆盖简单到困难不同难度的题目。

## 变更内容

### 前端 `src/pages/Questions.tsx`
- `difficultyMap` 添加 `0: { label: "混合难度", color: "bg-purple-500/20 text-purple-400" }`
- AI 出题面板和题目编辑弹窗的 Select 都添加 `<SelectItem value="0">混合难度</SelectItem>`

### 后端 `api/question-router.ts`
- `aiGenerate` 和 `aiGenerateFromUrls` 的 Zod schema：`difficulty` 范围从 `min(1).max(5)` 改为 `min(0).max(5)`

### AI `api/lib/ai.ts`
- `generateQuestionsFromFileUrls` 和 `generateQuestions` 的 userPrompt 中：
  - `difficulty === 0` 时提示"混合难度，请生成覆盖简单到困难不同难度的题目"
  - 其他值保持原样"难度要求 ${difficulty}/5"
