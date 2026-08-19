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
