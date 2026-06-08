# 题目编辑支持科目/知识点修改 + AI 考官匹配逻辑优化

## 日期
2026-06-08

## 需求1：题库题目编辑支持修改科目和知识点

### 变更内容

#### 前端 `src/pages/Questions.tsx`
- `editForm` state 添加 `subjectId`, `nodeId`, `skillId`
- `startEdit` 初始化时从题目数据填充三个字段
- 编辑弹窗添加三列 Select 下拉框（科目、知识点、技能维度）
- `handleUpdate` 调用时传递三个字段
- 添加 `trpc.skill.list.useQuery()` 获取技能维度列表

#### 后端 `api/question-router.ts`
- `update` Zod schema 添加 `subjectId`, `nodeId`, `skillId`（均为 optional）
- `updateData` 构建时包含这三个字段（仅当传入时更新）

---

## 需求2：优化 AI 考官从题库匹配题目的逻辑

### 原有问题
1. `generateTest` 不使用 `nodeId` 精确匹配，只依赖 `detectedKnowledgePoint` 文本模糊匹配
2. `generateReviewTest` 评分使用 `else if` 链，不能累加，且 `detectedKnowledgePoint`/`detectedSubject` 不检查是否真正匹配就给分
3. 两个函数评分权重不一致

### 变更内容

#### `api/todo-router.ts` - `generateTest`
- 添加 `nodeIds` 集合（从 `knowledgeNodes` 查询结果中提取 ID）
- 过滤条件添加 `nodeId` 精确匹配
- 评分改为累加制，统一权重：
  - `nodeId` 精确匹配：+100
  - `subjectId` 精确匹配：+50
  - `detectedKnowledgePoint` 文本匹配：+40
  - `detectedSubject` 文本匹配：+10
  - 错题：+200

#### `api/todo-router.ts` - `generateReviewTest`
- 评分同样改为累加制，与 `generateTest` 保持一致的权重
- 保留掌握度奖励（<50% +50，<70% +30）
