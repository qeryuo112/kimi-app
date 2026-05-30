import {
  mysqlTable,
  mysqlEnum,
  serial,
  varchar,
  text,
  timestamp,
  int,
  bigint,
  float,
  boolean,
} from "drizzle-orm/mysql-core";

// ==================== 用户表 ====================
export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  unionId: varchar("unionId", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  avatar: text("avatar"),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ==================== 学习科目/书籍表 ====================
export const subjects = mysqlTable("subjects", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }), // 分类：数学、物理、编程等
  sourceType: mysqlEnum("sourceType", ["book", "course", "article", "manual", "other"])
    .default("other")
    .notNull(),
  sourceContent: text("sourceContent"), // 导入的原始内容
  status: mysqlEnum("status", ["imported", "analyzing", "analyzed", "error"])
    .default("imported")
    .notNull(),
  progress: int("progress").default(0).notNull(), // 学习进度 0-100
  difficulty: int("difficulty").default(3).notNull(), // 难度 1-5
  priority: int("priority").default(2).notNull(), // 优先级 1-5
  color: varchar("color", { length: 50 }).default("#3b82f6"), // 主题色
  icon: varchar("icon", { length: 100 }), // lucide icon name
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type Subject = typeof subjects.$inferSelect;
export type InsertSubject = typeof subjects.$inferInsert;

// ==================== 知识树节点表 ====================
export const knowledgeNodes = mysqlTable("knowledge_nodes", {
  id: serial("id").primaryKey(),
  subjectId: bigint("subjectId", { mode: "number", unsigned: true }).notNull(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  parentId: bigint("parentId", { mode: "number", unsigned: true }), // 父节点ID，null为根节点
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  level: int("level").default(1).notNull(), // 层级 1=章, 2=节, 3=知识点
  orderIndex: int("orderIndex").default(0).notNull(), // 排序
  mastery: int("mastery").default(0).notNull(), // 掌握度 0-100
  importance: int("importance").default(3).notNull(), // 重要性 1-5
  difficulty: int("difficulty").default(3).notNull(), // 难度 1-5
  estimatedMinutes: int("estimatedMinutes").default(30), // 预计学习时间(分钟)
  tags: text("tags"), // JSON 标签数组
  aiAnalysis: text("aiAnalysis"), // AI对该知识点的分析
  resources: text("resources"), // 学习资源 JSON
  isLeaf: boolean("isLeaf").default(false).notNull(), // 是否为叶子节点
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type KnowledgeNode = typeof knowledgeNodes.$inferSelect;
export type InsertKnowledgeNode = typeof knowledgeNodes.$inferInsert;

// ==================== 知识关联边表（知识点之间的关系） ====================
export const knowledgeEdges = mysqlTable("knowledge_edges", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  sourceNodeId: bigint("sourceNodeId", { mode: "number", unsigned: true }).notNull(),
  targetNodeId: bigint("targetNodeId", { mode: "number", unsigned: true }).notNull(),
  relationType: mysqlEnum("relationType", ["prerequisite", "related", "extends", "partOf"])
    .default("related")
    .notNull(),
  strength: int("strength").default(1).notNull(), // 关联强度 1-5
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type KnowledgeEdge = typeof knowledgeEdges.$inferSelect;
export type InsertKnowledgeEdge = typeof knowledgeEdges.$inferInsert;

// ==================== 技能维度表 ====================
export const skillDimensions = mysqlTable("skill_dimensions", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  subjectId: bigint("subjectId", { mode: "number", unsigned: true }), // 关联科目，null为通用技能
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }), // 分类
  icon: varchar("icon", { length: 100 }), // lucide icon
  color: varchar("color", { length: 50 }).default("#10b981"),
  currentLevel: int("currentLevel").default(1).notNull(), // 当前等级 1-100
  maxLevel: int("maxLevel").default(100).notNull(),
  experience: int("experience").default(0).notNull(), // 经验值
  experienceToNext: int("experienceToNext").default(100).notNull(), // 升级所需经验
  aiGenerated: boolean("aiGenerated").default(false).notNull(), // 是否AI生成
  weight: float("weight").default(1.0).notNull(), // 权重
  parentId: bigint("parentId", { mode: "number", unsigned: true }), // 父技能，支持技能树
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type SkillDimension = typeof skillDimensions.$inferSelect;
export type InsertSkillDimension = typeof skillDimensions.$inferInsert;

// ==================== 技能评估历史表 ====================
export const skillAssessments = mysqlTable("skill_assessments", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  skillId: bigint("skillId", { mode: "number", unsigned: true }).notNull(),
  score: int("score").notNull(), // 评分 0-100
  notes: text("notes"),
  assessedBy: mysqlEnum("assessedBy", ["self", "ai", "system"]).default("self").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SkillAssessment = typeof skillAssessments.$inferSelect;
export type InsertSkillAssessment = typeof skillAssessments.$inferInsert;

// ==================== 学习记录表 ====================
export const studyLogs = mysqlTable("study_logs", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  subjectId: bigint("subjectId", { mode: "number", unsigned: true }),
  nodeId: bigint("nodeId", { mode: "number", unsigned: true }), // 关联知识点
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content"), // 学习内容/笔记
  duration: int("duration").notNull(), // 学习时长(分钟)
  date: timestamp("date").defaultNow().notNull(),
  quality: int("quality").default(3).notNull(), // 学习质量 1-5
  mood: mysqlEnum("mood", ["great", "good", "normal", "tired", "bad"])
    .default("normal")
    .notNull(),
  tags: text("tags"), // JSON 标签
  attachments: text("attachments"), // 附件 JSON
  aiFeedback: text("aiFeedback"), // AI反馈
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type StudyLog = typeof studyLogs.$inferSelect;
export type InsertStudyLog = typeof studyLogs.$inferInsert;

// ==================== AI对话历史表 ====================
export const aiConversations = mysqlTable("ai_conversations", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  sessionId: varchar("sessionId", { length: 255 }).notNull(),
  role: mysqlEnum("role", ["user", "assistant", "system"]).notNull(),
  content: text("content").notNull(),
  metadata: text("metadata"), // JSON：关联的subjectId, nodeId等
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AiConversation = typeof aiConversations.$inferSelect;
export type InsertAiConversation = typeof aiConversations.$inferInsert;

// ==================== AI分析任务表 ====================
export const aiAnalysisTasks = mysqlTable("ai_analysis_tasks", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  subjectId: bigint("subjectId", { mode: "number", unsigned: true }).notNull(),
  taskType: mysqlEnum("taskType", ["knowledge_tree", "skill_analysis", "study_plan", "content_summary"])
    .notNull(),
  status: mysqlEnum("status", ["pending", "processing", "completed", "failed"])
    .default("pending")
    .notNull(),
  input: text("input"), // 输入内容摘要
  result: text("result"), // AI分析结果 JSON
  error: text("error"), // 错误信息
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export type AiAnalysisTask = typeof aiAnalysisTasks.$inferSelect;
export type InsertAiAnalysisTask = typeof aiAnalysisTasks.$inferInsert;

// ==================== 用户设置表 ====================
export const userSettings = mysqlTable("user_settings", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull().unique(),
  theme: mysqlEnum("theme", ["light", "dark", "system"]).default("dark").notNull(),
  language: varchar("language", { length: 20 }).default("zh-CN"),
  aiModel: varchar("aiModel", { length: 100 }).default("kimi"),
  aiApiKey: text("aiApiKey"), // 用户自定义API Key
  aiApiEndpoint: text("aiApiEndpoint"), // 自定义API端点
  defaultDifficulty: int("defaultDifficulty").default(3).notNull(),
  dailyGoal: int("dailyGoal").default(120).notNull(), // 每日目标(分钟)
  weekGoal: int("weekGoal").default(600).notNull(), // 每周目标(分钟)
  notifications: boolean("notifications").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type UserSetting = typeof userSettings.$inferSelect;
export type InsertUserSetting = typeof userSettings.$inferInsert;

// ==================== 学习统计表（缓存） ====================
export const studyStats = mysqlTable("study_stats", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  subjectId: bigint("subjectId", { mode: "number", unsigned: true }),
  statDate: varchar("statDate", { length: 20 }).notNull(), // YYYY-MM-DD
  totalMinutes: int("totalMinutes").default(0).notNull(),
  sessionsCount: int("sessionsCount").default(0).notNull(),
  nodesStudied: int("nodesStudied").default(0).notNull(),
  avgQuality: float("avgQuality").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type StudyStat = typeof studyStats.$inferSelect;
export type InsertStudyStat = typeof studyStats.$inferInsert;
