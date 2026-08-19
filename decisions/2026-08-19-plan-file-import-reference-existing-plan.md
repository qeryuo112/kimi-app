# 决策记录：计划文件导入参考已有上层计划

## 日期
2026-08-19

## 决策场景
用户提出：
1. 先通过上传计划文件生成月计划。
2. 后续再上传基于前一份文档的周计划文档时，AI 能否参考已录入的月计划数据，不重新编排。
3. 能否添加选项，选择月计划就只根据文档生成到月计划；选择周计划就只生成到周计划；选择日计划就只生成日计划。

## 可选方案

### 方案 A：前端选择 scope，后端每次都让 AI 全量生成
- 前端提供 monthly / weekly / daily 选项。
- 后端仍让 AI 生成全部四层，最后根据 scope 截取。
- **缺点**：上层计划会被 AI 重新生成，无法沿用已录入的月/周计划。

### 方案 B：后端读取已有 plan.aiPlan，把上层计划作为上下文传给 AI，并合并结果（推荐）
- `analyzePlanFromFile` 增加 `existingPlan` 参数。
- 根据 scope 传入已有的 roundPlan / monthlyPlan / weeklyPlan。
- AI prompt 要求其在已有框架内细化、禁止改动上层计划。
- 后端保存时保留已有上层、覆盖/新增下层。
- **优点**：分阶段导入文档时，上层计划保持稳定；支持月→周→日逐层细化。

## 决策结果
用户选择：**方案 B**

## 实现要点
- `api/lib/ai.ts`：`analyzePlanFromFile` 支持 `existingPlan`。
- `api/plan-router.ts`：`aiGenerateFromPlanFile` 读取 `plan.aiPlan`，按 scope 组装上下文并合并保存。
- `src/pages/Plans.tsx`：打开上传对话框时智能推荐 scope（无月计划→monthly，有月无周→weekly，有周→daily）。

## 后续影响
- 已有月计划后导入周计划文档，AI 会基于已有月计划生成周计划。
- 已有周计划后导入日计划文档，AI 会基于已有月/周计划生成日计划。
- 选择 monthly 仍会全新生成轮次+月计划，并清空已有周/日计划。
