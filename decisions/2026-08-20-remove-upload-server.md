# 决策记录：删除废弃的 upload-server 独立服务

## 日期
2026-08-20

## 背景
生产环境实际使用的上传接口是主服务 `api/boot.ts` 中的 `/upload` 端点，文件上传到阿里云 OSS 后返回 URL。仓库中 `upload-server/` 目录下的独立 Express 上传服务已不再使用，但文档里仍留有部署说明，导致新增 HTML 支持时修改到了错误的文件。

## 决策
删除 `upload-server/` 目录及其相关文档引用，统一由主服务 `/upload` 端点处理文件上传。

## 变更范围
- 删除目录：`upload-server/`
- 更新文档：`README.md`、`DEPLOY.md`、`SUMMARY.md`、`.gitignore`、`API_CHANGES.md`

## 影响
- 后续上传功能相关改动只需维护 `api/boot.ts` 的 allowedTypes 白名单。
- 部署时无需再单独启动或同步 upload-server。
