---
name: plan-add-existing-subjects
metadata:
  type: project
description: 学习计划添加科目功能：从科目管理直接选择已分析的科目
---

## 决策记录

**日期**: 2026-06-01
**决策**: 采用方案A - 新增独立API端点 `addExistingSubjectsToPlan`

### 背景

原有流程：
- 学习计划添加科目 → 只能AI联网搜索 → AI自动分析 → 生成知识树 → 关联到计划

新需求：
- 允许从科目管理选择已存在的、已分析的科目
- 直接关联到学习计划
- 用于生成复习计划

### 决策方案

选择方案A：新增独立API端点

- 端点名: `plan.addExistingSubjectsToPlan`
- 输入: `{ planId: number, subjectIds: number[] }`
- 功能: 验证科目存在且已分析，关联到计划

### 技术实现

1. **后端** (`api/plan-router.ts`)
   - 新增 `addExistingSubjectsToPlan` mutation
   - 验证科目存在性和所有权
   - 验证科目已分析（有知识节点）
   - 插入 `planSubjects` 关联表

2. **前端** (待实现)
   - 科目选择弹窗
   - 调用新API

### Why

- 独立端点逻辑清晰，不混淆AI生成和现有科目两种模式
- 易于测试和维护
- 避免改动现有 `addSubjectsToPlan` 的复杂度

### How to apply

- 实现后端API
- 实现前端选择UI
- 确保生成复习计划时能正确读取这些科目的知识树
