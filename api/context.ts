import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { User } from "@db/schema";
import { getDb } from "./queries/connection";
import { users } from "@db/schema";
import { eq } from "drizzle-orm";
import { verifySession } from "./auth-router";

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  user?: User;
};

export async function createContext(
  opts: FetchCreateContextFnOptions,
): Promise<TrpcContext> {
  const req = opts.req;

  // 从 cookie 解析 session token
  const cookieHeader = req.headers.get("cookie") || "";
  const tokenMatch = cookieHeader.match(/kimiokc_session=([^;]+)/);

  if (tokenMatch) {
    const session = verifySession(decodeURIComponent(tokenMatch[1]));
    if (session) {
      try {
        const [user] = await getDb()
          .select()
          .from(users)
          .where(eq(users.id, session.userId));
        if (user) {
          return { req, resHeaders: opts.resHeaders, user };
        }
      } catch {
        // 数据库查询失败，继续匿名
      }
    }
  }

  return { req, resHeaders: opts.resHeaders };
}
