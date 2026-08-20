# 学霸黑科技系统

基于 AI 的智能学习管理系统。支持学习计划制定、知识树构建、题库管理、AI 出题评测、间隔重复复习等完整学习闭环。

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19 + TypeScript + Vite + Tailwind CSS + shadcn/ui |
| 后端 | Hono + tRPC + Drizzle ORM |
| 数据库 | MySQL 8.0 |
| AI | OpenAI 兼容 API（默认 GLM-4.6V，支持所有 OpenAI 兼容模型） |
| 文件存储 | `/upload` 端点（Hono）+ 阿里云 OSS |

---

## 构建

```bash
npm install
npm run build
```

构建产物：
- `dist/public/` - 前端静态文件
- `dist/boot.js` - Node 后端服务

---

## 开发

```bash
npm run dev          # 启动开发服务器（Vite + Hono dev server）
```

环境变量 `.env`：
```
DATABASE_URL=mysql://root:password@localhost:3306/kimiokc
APP_SECRET=your-secret-key
AI_API_BASE_URL=https://api.openai.com
```

---

## 部署

### 1. 前端（nginx 静态文件）

```bash
scp -r dist/public/* root@server:/var/www/kimiokc/dist/public/
```

### 2. 后端（PM2）

```bash
scp dist/boot.js root@server:/var/www/kimiokc/dist/boot.js
pm2 restart kimiokc
```

### 3. 数据库同步

```bash
npx drizzle-kit push
```

---

## 功能模块

### 学习计划
- 输入学习目标，AI 自动生成多轮次复习计划
- 轮次/月/周/日四级计划，支持分批生成避免超时
- 支持从文件导入科目内容生成计划

### 知识树
- AI 自动分析科目内容，生成完整知识树
- 支持编辑、添加、删除知识点
- 知识点之间建立关联（前置/相关/扩展/组成）

### 题库
- 手动录入题目（单选/多选/填空/简答/论述）
- AI 根据知识点自动出题
- 从文件（PDF/Word/图片）识别题目并导入
- 编辑题目时若添加图片，AI 自动重新生成答案和解析
- 组卷功能

### AI 测试（AI 考官）
- **每日任务**：完成任务后 AI 出题测试，评估掌握度
- **记一笔**：自定义学习记录，选择科目/知识点后 AI 出题测试
  - 支持自定义题型和题目数量
  - 支持上传文件，AI 基于文件内容出题
  - 质量由 AI 测试自动计算（mastery / 20）
- 智能选题：优先从题库匹配，不足时 AI 生成
- 错题自动收录到错题本

### 复习调度（间隔重复）
- 基于艾宾浩斯遗忘曲线
- 掌握度 >= 90%：间隔 x3，>= 70%：x2，>= 50%：x1.5，否则 1 天
- 完成复习测试后自动更新下次复习日期

### 错题本
- 自动收录答错的题目
- 支持标记已掌握
- 支持删除错题记录

### 技能维度
- AI 自动分析科目技能要求
- 经验值升级系统
- 答题正确率和时长加权计算经验

### AI 助手
- 支持文件上传（PDF/Word/图片）
- AI 基于文件内容回答问题
- 支持上下文对话

### 数据回退
- 删除学习记录/任务时自动回退所有关联数据
  - 知识节点掌握度
  - 科目进度
  - 技能维度经验
  - 学习统计
  - 复习调度状态

---

## API 路由

| 路由 | 说明 |
|------|------|
| `/api/auth` | 登录/注册/认证 |
| `/api/subject` | 科目管理 |
| `/api/knowledge` | 知识树节点管理 |
| `/api/skill` | 技能维度管理 |
| `/api/study` | 学习记录、AI 测试 |
| `/api/todo` | 每日任务、复习调度 |
| `/api/question` | 题库管理 |
| `/api/exam` | 试卷管理 |
| `/api/plan` | 学习计划 |
| `/api/ai` | AI 对话助手 |
| `/api/settings` | 用户设置 |

---

## 数据库 Schema

核心表：users, subjects, knowledge_nodes, knowledge_edges, questions, study_logs, study_stats, daily_todos, review_schedules, skill_dimensions, wrong_answers, exam_papers, plans, ai_conversations

详见 `db/schema.ts`

---

## 调试日志

所有 AI 调用均记录详细日志到 `ai-debug.log`，包含：
- 请求参数（模型、消息数、prompt 长度）
- 响应状态、耗时、返回内容前 500 字符
- JSON 解析错误时记录原始响应

后端关键流程（如 AI 出题、答案评估、数据回退）均打印 `[xxx]` 前缀的 console.log。
