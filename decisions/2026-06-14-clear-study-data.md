# 清空学习计划与今日任务

日期：2026-06-14

## 决策
用户选择方案 B：清空全部学习计划相关数据，保留题库和错题本。

## 清空范围
- DELETE: plans, daily_todos, review_schedules, weekly_reviews, study_logs, study_stats, skill_assessments, user_answers
- UPDATE: subjects.progress = 0, knowledge_nodes.mastery = 0

## 保留数据
- questions（题库）
- wrong_answers（错题本）
- subjects（科目）
- knowledge_nodes（知识节点）
