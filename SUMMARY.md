# KimiOKC 学习管理系统 - 功能更新总结

## 更新日期
2026-06-01

## 一、复习测试系统增强

### 1.1 复习测试详情查看
- **功能**：完成复习测试后，可以查看详细的测试记录
- **包含内容**：
  - 答题详情（题目、用户答案、正确答案）
  - 掌握度变化（历史 → 本次 → 综合）
  - 薄弱知识点分析
  - AI建议和学习建议
  - 逐题解析
- **文件修改**：
  - `api/todo-router.ts`: 新增 `getReviewDetail` API
  - `src/pages/Todos.tsx`: 新增复习详情弹窗

### 1.2 复习数据回退
- **功能**：支持回退复习测试后的数据变更（掌握度、复习次数等），但保留复习记录
- **使用场景**：
  - 复习测试完成后发现掌握度评估不准确
  - 需要重新进行复习测试
- **文件修改**：
  - `api/todo-router.ts`: 新增 `rollbackReview` API

### 1.3 数据持久化
- **数据库变更**：`reviewSchedules` 表新增 `snapshot` 字段
  - 存储测试详情（题目、答案、掌握度变化等）
  - JSON格式存储完整的测试快照

---

## 二、错题本系统

### 2.1 错题自动收录
- **功能**：学习任务和复习测试中的错题自动收录到错题本
- **收录逻辑**：
  - 选择题：答案不匹配自动收录
  - 主观题：AI评估为错误自动收录
- **更新逻辑**：同一题目多次答错会增加错误次数
- **文件修改**：
  - `api/todo-router.ts`: `submitTest` 和 `submitReviewTest` 中集成错题收集

### 2.2 错题加权抽题
- **功能**：错题在抽题时获得更高权重，优先出现在复习和测试中
- **权重计算**：
  - 节点匹配：+100分
  - 学科匹配：+50分
  - 知识点匹配：+30-40分
  - **错题权重：+200分**（最高优先级）
- **文件修改**：
  - `api/todo-router.ts`: `generateTest` 和 `generateReviewTest` 中的评分逻辑

---

## 三、题目匹配系统优化

### 3.1 学科匹配修复
- **问题**：题目无法正确匹配学科
- **原因**：`knowledgeNodes` 存储为字符串数组，但代码按对象处理
- **修复**：
  - 正确解析知识点标题
  - 使用宽松字符串匹配（trim + toLowerCase）
  - 评分改为累加制，支持同时匹配多个条件

### 3.2 评分逻辑改进
- **新评分规则**：
  | 匹配条件 | 分数 |
  |---------|------|
  | subjectId 精确匹配 | +50 |
  | 知识点匹配 | +40 |
  | 学科名称匹配 | +10 |
  | 错题 | +200 |

---

## 四、文件上传功能

### 4.1 科目导入文件上传
- **功能**：支持上传PDF、Word、图片等文件作为科目内容
- **流程**：
  1. 选择"上传文件"模式
  2. 上传文件到服务器获取URL
  3. AI直接读取文件内容分析
  4. 自动生成知识树和技能维度
- **文件修改**：
  - `src/pages/Subjects.tsx`: 新增文件上传UI
  - `api/boot.ts`: 新增 `/upload` 端点
  - `api/lib/ai.ts`: 新增 `analyzeFilesForKnowledgeTree` 和 `analyzeFilesForSkills`

### 4.2 上传服务器
- **部署位置**：云端VPS (`/root/upload-server`)
- **端口**：3001
- **支持的文件类型**：PDF、Word、TXT、PNG、JPG、JPEG、GIF、WebP
- **文件大小限制**：20MB

---

## 五、计划删除级联清理

### 5.1 功能增强
- **功能**：删除学习计划时，级联清除所有相关数据
- **清除的数据**：
  1. 每日任务（dailyTodos）
  2. 复习调度（reviewSchedules）
  3. 学习记录（studyLogs）
  4. 知识节点和知识边（knowledgeNodes/knowledgeEdges）
  5. 技能维度和技能评估（skillDimensions/skillAssessments）
  6. 科目（subjects）
  7. 计划科目关联（planSubjects）
- **保留的数据**：
  - 题库（questions）
  - 试卷（examPapers）
  - 错题本（wrongAnswers）
  - 用户设置（userSettings）
- **文件修改**：
  - `api/plan-router.ts`: 重写 `delete` 端点

---

## 六、知识树进度条

### 6.1 功能验证
- **状态**：已有功能，已验证正常运行
- **显示逻辑**：
  - 掌握度 ≥80%：绿色
  - 掌握度 ≥50%：黄色
  - 掌握度 ≥20%：橙色
  - 掌握度 <20%：红色

---

## 七、数据库迁移

### 7.1 新增字段
```sql
-- reviewSchedules 表
ALTER TABLE review_schedules ADD COLUMN snapshot TEXT;
```

### 7.2 迁移文件
- `db/migrations/0010_sleepy_mandrill.sql`
- `db/migrations/meta/0010_snapshot.json`

---

## 八、API变更汇总

### 8.1 新增API
| API | 路径 | 功能 |
|-----|------|------|
| `getReviewDetail` | `todo.getReviewDetail` | 获取复习测试详情 |
| `rollbackReview` | `todo.rollbackReview` | 回退复习数据 |
| `file` | `/upload` (POST) | 文件上传 |
| `analyzeFilesForKnowledgeTree` | AI函数 | 从文件分析知识树 |
| `analyzeFilesForSkills` | AI函数 | 从文件分析技能维度 |

### 8.2 修改API
| API | 变更内容 |
|-----|----------|
| `submitTest` | 新增错题收集逻辑 |
| `submitReviewTest` | 新增错题收集逻辑，新增snapshot保存 |
| `generateTest` | 修复题目匹配逻辑，改进评分算法 |
| `generateReviewTest` | 修复题目匹配逻辑，改进评分算法 |
| `plan.delete` | 级联删除所有相关数据 |

---

## 九、前端页面变更

### 9.1 修改的页面
| 页面 | 修改内容 |
|------|----------|
| `Todos.tsx` | 新增复习详情弹窗、复习回退按钮、修复抽题匹配 |
| `Subjects.tsx` | 新增文件上传功能、修复UI高度问题 |
| `KnowledgeTree.tsx` | 验证进度条功能正常 |

---

## 十、待办事项（已完成）

- [x] 复习测试详情查看和回退功能
- [x] 错题收录到错题本并提高复习出现概率
- [x] 修复抽题时学科和知识点匹配逻辑
- [x] 科目导入添加文件上传功能
- [x] 删除计划时级联清理相关数据
- [x] 验证知识树进度条显示

---

## 十一、技术栈

- **前端**：React 19 + TypeScript + Tailwind CSS + Radix UI
- **后端**：Hono + tRPC + Node.js 20
- **数据库**：MySQL 8 + Drizzle ORM
- **AI**：支持 OpenAI / Claude / Kimi / GLM-4 等兼容接口
- **文件存储**：VPS本地存储 + 可选云端存储

---

## 十二、部署说明

### 开发环境启动
```bash
npm run dev
```

### 数据库迁移
```bash
npm run db:generate
npm run db:migrate
```

### 文件上传服务器启动
```bash
cd /root/upload-server
PUBLIC_URL=http://你的VPSIP:3001 node server.js
```

---

## 总结

本次更新主要围绕三个核心方向：

1. **数据完整性**：通过复习快照、错题本、级联删除等功能，确保学习数据的完整性和可追溯性

2. **用户体验**：优化题目匹配算法、添加文件上传、改进UI交互，提升使用便捷性

3. **系统健壮性**：修复匹配逻辑bug、改进评分算法、添加数据回退机制，确保系统稳定可靠

所有功能已开发完成并经过测试，系统已准备好投入生产使用。
