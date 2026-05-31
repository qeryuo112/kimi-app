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

## 四、回退方式

如需回退本次变更，执行：

```bash
git revert HEAD
```

或手动恢复被删除的文件和代码。
