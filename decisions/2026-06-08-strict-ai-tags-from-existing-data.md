# AI 出题标签严格来自已有科目和知识点

## 日期
2026-06-08

## 需求
AI 出题时，`detectedSubject` 和 `detectedKnowledgePoint` 必须严格来自用户已有的科目和知识点，不能由 AI 自行编造。

## 变更内容

### `api/lib/ai.ts`
- `generateQuestions` 和 `generateQuestionsFromFileUrls` 的 system prompt 中，在 `detectedSubject`/`detectedKnowledgePoint` 说明处追加：
  > 注意：这两个字段必须是从实际输入内容中明确识别出的真实学科和知识点名称，不要编造、泛化或自行分类。如果无法明确识别，请留空。

### `api/question-router.ts` - `aiGenerate`
- 保存题目前，对 `detectedSubject` 和 `detectedKnowledgePoint` 做**精确匹配校验**（trim + lowercase）
- 匹配成功：保留标准名称并设置 `subjectId`/`nodeId`
- 匹配失败：清空为 null，并打印调试日志
- 移除了原有的模糊匹配（`includes` 双向）

### `api/question-router.ts` - `aiGenerateFromUrls`
- 同样的精确匹配校验逻辑
