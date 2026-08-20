import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import path from "path";
import { nanoid } from "nanoid";
import { uploadBufferToOSS, isOSSConfigured } from "./lib/oss";
import mcpRouter from "./mcp-router";

const app = new Hono<{ Bindings: HttpBindings }>();

// Body 大小限制（对所有后续路由生效）
app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));

// 文件上传端点（仅支持 OSS）
app.post("/upload", async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body.file as File;

    if (!file) {
      return c.json({ error: "No file provided" }, 400);
    }

    if (!isOSSConfigured()) {
      return c.json({ error: "OSS not configured" }, 503);
    }

    // 检查文件类型
    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "text/html",
      "application/xhtml+xml",
      "text/markdown",
      "text/x-markdown",
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/gif",
      "image/webp",
    ];

    if (!allowedTypes.includes(file.type)) {
      return c.json({ error: "File type not allowed" }, 400);
    }

    // 限制文件大小 (20MB)
    const maxSize = 20 * 1024 * 1024;
    if (file.size > maxSize) {
      return c.json({ error: "File too large (max 20MB)" }, 400);
    }

    // 生成文件名并上传到 OSS
    const ext = path.extname(file.name);
    const fileName = `${Date.now()}_${nanoid(6)}${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const key = `uploads/${fileName}`;
    const url = await uploadBufferToOSS(buffer, key, file.type);

    return c.json({ url, name: file.name, size: file.size });
  } catch (error) {
    console.error("Upload error:", error);
    return c.json({ error: "Upload failed" }, 500);
  }
});

// MCP Bridge（供 kaoyan349 MCP 服务器调用）
app.route("/api/mcp", mcpRouter);

app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});
app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

export default app;

if (env.isProduction) {
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);

  const port = parseInt(process.env.PORT || "3000");
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
