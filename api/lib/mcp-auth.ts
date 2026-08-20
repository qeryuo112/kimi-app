import type { MiddlewareHandler } from "hono";
import { env } from "./env";

export interface McpContext {
  userId: number;
}

/**
 * MCP Bridge 鉴权中间件
 * 通过请求头 X-MCP-API-Key 与 env.MCP_API_KEY 校验
 * 成功后把 MCP_USER_ID 注入上下文
 */
export const mcpAuthMiddleware: MiddlewareHandler<{
  Variables: McpContext;
}> = async (c, next) => {
  if (!env.mcpApiKey) {
    return c.json({ error: "MCP API key not configured" }, 503);
  }

  const key = c.req.header("X-MCP-API-Key");
  if (!key || key !== env.mcpApiKey) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  c.set("userId", env.mcpUserId);
  return next();
};
