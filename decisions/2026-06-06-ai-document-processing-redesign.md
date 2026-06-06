# 用户决策记录（2026-06-06）

## 需求
重新设计后端文档处理流程，解决大量模型不兼容 `file_url` 导致的 API 调用错误。

## 用户选择

| 问题 | 选择 |
|------|------|
| 总体方案 | **A. 通用文档处理** —— 统一 `processUrlsToContentBlocks()` 函数，所有 14 个 AI 入口全部走它 |
| PDF 处理 | PyMuPDF 逐页转 PNG（150 DPI）→ 上传远程服务器 → `image_url`（带页码标注） |
| PPT 处理 | **支持** —— 提取文本内容直接作为 `text` block 塞入请求体（带页码标注） |
| 文本类（txt/md/json） | 下载内容直接作为 `text` block，不再中转 |
| Kimi 特化代码 | **彻底移除** `preprocessMessagesForKimi`、`extractFileContentWithKimi`、`isKimiPlatform` |
| plan-router JSON 数据 | 按方案 A 原则，文本类直接塞入 |

## 技术约束确认
- PyMuPDF 1.27.2.3 ✅ 已安装，支持内存直接输出 PNG（`pix.tobytes('png')`）
- python-pptx 需安装
- 远程 upload-server 已有 `/upload` 接口

## 确认时间
2026-06-06
