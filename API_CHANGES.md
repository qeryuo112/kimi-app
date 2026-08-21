# API 变更记录（2026-05-31）

## 变更概述

本次变更移除了登录功能和导入文档出题功能。

---

## 一、登录功能移除

### 删除的文件
- `api/kimi/auth.ts`
- `api/kimi/session.ts`
- `api/kimi/platform.ts`
- `api/kimi/types.ts`
- `api/lib/cookies.ts`
- `src/pages/Login.tsx`

### 修改的文件
- `api/boot.ts` — 移除 `/api/oauth/callback` 路由
- `api/context.ts` — 直接返回 `LOCAL_USER`，不再调用 `authenticateRequest`
- `api/auth-router.ts` — 移除 `logout` mutation，保留 `me` query
- `contracts/constants.ts` — 移除 `Session` 和 `Paths` 常量
- `src/hooks/useAuth.ts` — 直接返回硬编码本地用户，不再调用 tRPC
- `src/components/Layout.tsx` — 移除 logout 按钮和 loading/unauthenticated 状态
- `src/App.tsx` — 移除 `/login` 路由
- `src/const.ts` — 移除 `LOGIN_PATH`

### 影响
- 所有请求自动以 `LOCAL_USER`（id=1, role=admin）身份执行
- 前端各页面无需再处理未认证状态

---

## 二、导入文档出题功能移除

### 删除的文件
- `api/lib/document-parser.ts`
- `src/pages/Questions.tsx` 中的文档上传/导入 UI（约 300+ 行）

### 删除的 tRPC 端点（question router）
| 端点 | 说明 |
|------|------|
| `question.parseDocument` | 解析文档提取文本 |
| `question.aiGenerateFromFile` | AI 多模态阅读文件出题 |
| `question.aiGenerateFromDocument` | AI 根据文档文本出题 |
| `question.importFromDocument` | 从文档识别并导入已有题目 |
| `question.importFromImages` | 从图片多模态识别题目 |

### 删除的 AI 函数（`api/lib/ai.ts`）
- `generateQuestionsFromDocument`
- `generateQuestionsFromFile`
- `recognizeQuestionsFromDocument`
- `recognizeQuestionsFromImages`

### 保留的题库功能
- `question.list` — 列出题目
- `question.getById` — 获取单题详情
- `question.aiGenerate` — 基于知识点 AI 出题
- `question.submitAnswer` — 提交答案
- `question.delete` / `deleteMany` — 删除题目
- `question.getWrongAnswers` — 获取错题本
- `question.markMastered` — 标记已掌握
- `question.getStats` — 答题统计

### 移除的依赖包
- `mammoth`
- `pdf-lib`
- `pdf-parse`
- `pngjs`
- `pptx-parser`

---

## 三、前端路由变更

| 路由 | 状态 | 说明 |
|------|------|------|
| `/login` | 删除 | 登录页面已移除 |

---

## 五、新增文档识别出题功能（2026-05-31 后续）

### 新增文件
- `upload-server/server.js` — 极简文件上传服务（部署到VPS）
- `upload-server/package.json` — 上传服务依赖

### 修改的文件
- `api/lib/ai.ts` — 扩展 `KimiContent` 支持 `file_url`/`video_url`，新增 `recognizeQuestionsFromUrls`
- `api/question-router.ts` — 新增 `question.recognizeFromUrls` 端点
- `api/settings-router.ts` — `update` 输入新增 `fileServerUrl`
- `db/schema.ts` — `user_settings` 表新增 `fileServerUrl` 字段
- `src/pages/Settings.tsx` — 新增文件上传服务器地址配置
- `src/pages/Questions.tsx` — 新增"文档识别"面板，支持文件上传/URL粘贴、AI识别、结果预览

### 新增的 tRPC 端点
| 端点 | 说明 |
|------|------|
| `question.recognizeFromUrls` | 接收文件URL数组，调用AI识别文档/图片中的题目并保存 |

### 数据库迁移
- `db/migrations/0006_reflective_bloodstrike.sql` — user_settings 表新增 fileServerUrl 列

### 外部服务
- VPS 上需部署 `upload-server`（`node server.js`），提供 `/upload` 接口和静态文件服务
- 前端在 Settings 中配置 VPS 地址（如 `http://VPS_IP:3001`）后，文档识别面板可将文件上传至 VPS 获取公网URL

---

## 四、回退方式

如需回退本次变更，执行：

```bash
git revert HEAD
```

或手动恢复被删除的文件和代码。

---

## 五、新增计划文件上传解析功能（2026-08-19）

### 新增 AI 函数
- `api/lib/ai.ts` — 新增 `analyzePlanFromFile`
  - 接收上传文件 URL、已有科目列表、本地知识树节点
  - 支持 `scope` 参数：`monthly` / `weekly` / `daily`
  - 根据 scope 调用多模态 AI 解析计划文档，生成对应层级计划
  - 返回 `rounds` / `months` / `weeks` / `days` / `unmatchedContent`

### 修改的文件
- `api/plan-router.ts` — 新增 `plan.aiGenerateFromPlanFile` mutation
  - 接收 `planId`、`subjectIds`、`fileUrl`、`scope`、`requirements`
  - 验证科目属于当前用户且已关联到计划
  - 拉取本地知识树并调用 `analyzePlanFromFile`
  - 根据 `scope` 保存对应层级到 `plans.aiPlan`，同时记录 `sourceDocumentUrl`
- `db/schema.ts` — `plans` 表新增 `sourceDocumentUrl` 字段
- `src/pages/Plans.tsx` — 新增"上传计划文件"入口和对话框
  - 支持选择生成范围：到月计划 / 到周计划 / 完整计划
  - 支持选择已有科目
  - 支持上传 PDF / Word / TXT / Markdown / 图片 等格式
  - 显示上传文件列表、填写额外需求、提交 AI 解析

### 新增的 tRPC 端点
| 端点 | 说明 |
|------|------|
| `plan.aiGenerateFromPlanFile` | 上传计划文件，按指定范围（月/周/日）生成复习计划 |

### 数据库迁移
- `db/migrations/0012_lazy_nightmare.sql` — plans 表新增 sourceDocumentUrl 列

### 注意事项
- 上传的计划文件必须对应已存在的科目，AI 不会自动创建新科目
- 选择"到月计划"时只生成轮次+月计划，周/日留空，可后续用原有功能分步生成
- 选择"到周计划"时生成轮次+月+周计划，日计划留空
- 选择"完整计划"时生成全部四层计划
- AI 会优先沿用文档中已有的时间安排，不重新发明结构
- AI 生成的 `knowledgeNodes` 字段使用本地已有节点的 title
- 未能匹配到知识节点的内容会记录在返回结果的 `unmatchedContent` 中

---

## 六、计划文件导入支持参考已有上层计划（2026-08-19 后续）

### 背景
用户先通过文件导入生成月计划，后续再导入更细粒度的周计划/日计划文档时，AI 需要基于已录入的上层计划继续细化，而不是凭空重新生成。

### 修改的文件
- `api/lib/ai.ts` — `analyzePlanFromFile`
  - 新增 `AnalyzePlanFromFileExistingPlan` 类型
  - `config` 新增可选 `existingPlan` 参数（包含 `roundPlan` / `monthlyPlan` / `weeklyPlan`）
  - 根据 `scope` 把已有上层计划注入 system / user prompt，要求 AI 在已有框架内细化、禁止改动上层安排
- `api/plan-router.ts` — `plan.aiGenerateFromPlanFile`
  - 调用 AI 前读取当前 `plan.aiPlan`
  - `scope=weekly` 时传入已有 `roundPlan` + `monthlyPlan`
  - `scope=daily` 时传入已有 `roundPlan` + `monthlyPlan` + `weeklyPlan`
  - 保存时合并：保留已有上层，覆盖/新增下层；重新生成上层时清空下层和 `generatedMonths`
- `src/pages/Plans.tsx` — 上传计划文件对话框
  - 打开弹窗时根据当前计划已有层级智能推荐 scope：
    - 无月计划 → 默认 `monthly`
    - 有月计划无周计划 → 默认 `weekly`
    - 有周计划 → 默认 `daily`
  - 对话框说明文案增加“参考已有上层计划”提示

### 行为变更
- 选择 `weekly` 时，如果系统里已有月计划，AI 会沿用已有轮次/月安排，只生成周计划
- 选择 `daily` 时，如果系统里已有周计划，AI 会沿用已有轮次/月/周安排，只生成日计划
- 选择 `monthly` 时仍为全新生成，会清空已有的周/日计划

---

## 七、删除废弃的 upload-server 独立服务（2026-08-20）

### 变更原因
原 `upload-server/` 目录下的独立 Express 上传服务已弃用，上传功能实际由主服务 `api/boot.ts` 的 `/upload` 端点统一处理。保留该目录会导致文档与代码不一致。

### 删除的文件/目录
- `upload-server/server.js`
- `upload-server/package.json`
- `upload-server/DEPLOY.md`
- `upload-server/VERIFY.md`

### 修改的文档
- `README.md` — 文件存储改为 `/upload` 端点 + OSS，移除 upload-server 部署说明
- `DEPLOY.md` — 移除“文件上传服务（upload-server）”章节，更新环境表格和注意事项
- `SUMMARY.md` — 将“上传服务器”改为“上传接口”，移除独立服务启动说明
- `.gitignore` — 移除 `upload-server/package-lock.json` 条目

### 实际行为
- 文件上传仍通过 `POST /upload` 进行
- 后端白名单校验在 `api/boot.ts` 中维护
- 上传后的文件继续写入阿里云 OSS 并返回 URL

---

## 八、新增 MCP Bridge API（2026-08-20）

### 背景
让 kaoyan349 MCP 服务器（zcode 本地 stdio MCP）把数据层切换到远程 kimiokc，实现题库/知识树/复习数据的双向流动。

### 新增文件
- `api/lib/mcp-auth.ts` — API Key 鉴权中间件
- `api/mcp-router.ts` — MCP Bridge 路由

### 修改的文件
- `api/lib/env.ts` — 新增 `MCP_API_KEY`、`MCP_USER_ID`
- `api/boot.ts` — 挂载 `/api/mcp` 路由
- `.env.example` — 新增 MCP Bridge 环境变量

### 新增端点

所有端点均需 header `X-MCP-API-Key`。

| Method | Path | 说明 |
|---|---|---|
| GET | `/api/mcp/subjects` | 列出学科 |
| GET | `/api/mcp/subjects/:id/chapters` | 学科下 level≤2 的节点 |
| GET | `/api/mcp/knowledge-nodes` | 搜索知识点 |
| GET | `/api/mcp/questions` | 筛选题目 |
| GET | `/api/mcp/questions/:id` | 单题详情 |
| POST | `/api/mcp/questions` | 批量新增/更新题目 |
| DELETE | `/api/mcp/questions/:id` | 删除题目 |
| POST | `/api/mcp/quiz` | 组卷 |
| POST | `/api/mcp/answers` | 提交答案并判分 |
| GET | `/api/mcp/wrong-answers` | 错题本 |
| POST | `/api/mcp/wrong-answers/:id/resolve` | 标记错题已掌握 |
| GET | `/api/mcp/review-queue` | 今日复习队列 |
| POST | `/api/mcp/review-queue/:id/record` | 记录复习结果 |
| GET | `/api/mcp/progress` | 学科进度报告 |
| POST | `/api/mcp/import/document` | 解析文档返回文本 |

### 鉴权方式
- 请求头 `X-MCP-API-Key` 必须等于环境变量 `MCP_API_KEY`
- 操作固定使用 `MCP_USER_ID` 指定的用户

### 部署注意事项
- 服务器 `.env` 必须配置 `MCP_API_KEY` 和 `MCP_USER_ID`
- MCP 客户端（kaoyan349）需要配置 `KIMIOKC_BASE_URL` 和 `MCP_API_KEY`

---

## 九、扩展 MCP Bridge 端点（2026-08-20 Phase 1.5）

### 背景
kaoyan349 侧需要把科目、章节、知识点、题目更新等操作也写入 kimiokc，因此扩展 Bridge。

### 新增端点

| Method | Path | 说明 |
|---|---|---|
| POST | `/api/mcp/subjects` | 新增科目 |
| GET | `/api/mcp/subjects/:id` | 取单科详情 |
| POST | `/api/mcp/knowledge-nodes` | 新增知识树节点（章节/知识点统一） |
| PATCH | `/api/mcp/knowledge-nodes/:id` | 更新节点 |
| GET | `/api/mcp/knowledge-nodes/:id` | 取单节点详情 |
| GET | `/api/mcp/knowledge-nodes` | 增加 `title` 查询参数，用于按标题幂等 |
| PUT | `/api/mcp/questions/:id` | 更新题目 |
| GET | `/api/mcp/questions/count` | 题目计数 |

### 行为说明
- 新增题目仍走 `POST /api/mcp/questions`。
- 349 特有题型（`matching/prescription/name_def/case`）在 kaoyan349 客户端映射为 kimiokc 支持的枚举，并在 `explanation` 中保留原类型。
- 写操作仍以 `X-MCP-API-Key` 鉴权，并固定使用 `MCP_USER_ID`。

---

## 十、MCP Bridge 端点参数扩展（2026-08-21）

### 背景
kaoyan349 客户端补齐桥接模式时，三个端点需要支持可选参数（均向后兼容，缺省行为不变）。

### 变更明细

| 端点 | 新增参数 | 说明 |
|---|---|---|
| `POST /api/mcp/answers` | `score?`(0-1)、`isCorrect?` | AI 深度批改覆盖：传入后跳过远端评估，直接按覆盖值判分并执行错题收录/掌握度更新 |
| `GET /api/mcp/wrong-answers` | `mastered?`（0/1，默认 0） | `mastered=1` 返回已掌握错题，支持客户端 `resolved=1/2` 语义 |
| `GET /api/mcp/review-queue` | `includeFuture?`（1/0） | `includeFuture=1` 返回全部 active 调度（含未到期），供客户端学习计划按到期日聚合 |

### 回退方式
删除对应参数分支即可，不影响既有调用。
