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
