# 决策记录：kaoyan349 MCP 与 kimiokc 的桥接方案

## 日期
2026-08-20

## 背景
用户希望 kaoyan349 MCP 服务器的功能与 kimiokc 项目适配：
- kimiokc 的题库能给 zcode 上的 MCP 服务器提供题目
- MCP 服务器能从文档提取题目、分析知识点后存回 kimiokc

## 可选方案

### 方案 A：MCP 作为 kimiokc 的 HTTP 客户端（推荐）
- kimiokc 新增 `/api/mcp/*` REST Bridge，API Key 鉴权
- kaoyan349 用 `requests`/`httpx` 调用 bridge
- 数据全部存在 kimiokc MySQL，kaoyan349 只保留工具层

### 方案 B：直接让 MCP 连接 kimiokc MySQL
- kaoyan349 的 `db.py` 改成 pymysql 直连
- 优点：无 API 开发；缺点：暴露数据库、绕过业务逻辑、安全隐患

### 方案 C：批量导入导出
- 定期脚本同步 JSON/CSV
- 优点：简单；缺点：非实时、冲突难处理

## 决策结果
用户选择：**方案 A**

## 实施结果
- 已新增 `api/lib/mcp-auth.ts` 和 `api/mcp-router.ts`
- 已实现核心端点：学科、知识点、题库、组卷、答题、错题、复习队列、进度、文档解析
- 已通过 curl 在生产环境验证：
  - `GET /api/mcp/subjects` ✅
  - `GET /api/mcp/knowledge-nodes` ✅
  - `POST /api/mcp/questions` ✅
  - `POST /api/mcp/quiz` ✅
  - `POST /api/mcp/answers` ✅
  - `GET /api/mcp/progress` ✅
  - `POST /api/mcp/import/document` ✅
- 服务器已配置 `MCP_API_KEY` / `MCP_USER_ID`

## 下一步
在 kaoyan349 项目新增 `kimiokc_client.py`，把所有工具的数据层从 SQLite 切换到 bridge 调用。
