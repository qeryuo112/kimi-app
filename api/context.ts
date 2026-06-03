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
  console.log("[Context] createContext called, url=", req.url);

  // 从 cookie 解析 session token
  const cookieHeader = req.headers.get("cookie") || "";
  console.log("[Context] cookie header length=", cookieHeader.length);
  const tokenMatch = cookieHeader.match(/kimiokc_session=([^;]+)/);
  console.log("[Context] token match=", !!tokenMatch);

  if (tokenMatch) {
    const session = verifySession(decodeURIComponent(tokenMatch[1]));
    console.log("[Context] session valid=", !!session);
    if (session) {
      try {
        const [user] = await getDb()
          .select()
          .from(users)
          .where(eq(users.id, session.userId));
        console.log("[Context] user found=", !!user, "id=", user?.id);
        if (user) {
          return { req, resHeaders: opts.resHeaders, user };
        }
      } catch (err) {
        console.error("[Context] db query error:", err);
      }
    }
  }

  console.log("[Context] returning anonymous context");
  return { req, resHeaders: opts.resHeaders };
}
