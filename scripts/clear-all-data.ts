// 清除所有用户数据（保留用户表本身）
import { getDb } from "../api/queries/connection";
import {
  plans,
  planSubjects,
  subjects,
  knowledgeNodes,
  knowledgeEdges,
  skillDimensions,
  skillAssessments,
  dailyTodos,
  reviewSchedules,
  studyLogs,
  studyStats,
  aiConversations,
  aiAnalysisTasks,
  userAnswers,
  wrongAnswers,
  questions,
  examPapers,
} from "../db/schema";

async function clearAllData() {
  const db = getDb();

  console.log("开始清除数据...\n");

  // 按照依赖关系顺序删除
  const tables = [
    { name: "每日任务", table: dailyTodos },
    { name: "复习调度", table: reviewSchedules },
    { name: "学习统计", table: studyStats },
    { name: "学习记录", table: studyLogs },
    { name: "AI对话", table: aiConversations },
    { name: "AI分析任务", table: aiAnalysisTasks },
    { name: "知识边", table: knowledgeEdges },
    { name: "知识节点", table: knowledgeNodes },
    { name: "技能评估", table: skillAssessments },
    { name: "技能维度", table: skillDimensions },
    { name: "错题记录", table: wrongAnswers },
    { name: "用户答题", table: userAnswers },
    { name: "题库", table: questions },
    { name: "试卷", table: examPapers },
    { name: "科目", table: subjects },
    { name: "计划科目关联", table: planSubjects },
    { name: "学习计划", table: plans },
  ];

  for (const { name, table } of tables) {
    try {
      const result = await db.delete(table);
      console.log(`✓ ${name} 已清除`);
    } catch (err) {
      console.error(`✗ ${name} 清除失败:`, err);
    }
  }

  console.log("\n✅ 所有数据清除完成");
}

clearAllData().catch(console.error);
