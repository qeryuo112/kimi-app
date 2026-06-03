import { z } from "zod";
import bcrypt from "bcryptjs";
import { createRouter, publicQuery, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { users } from "@db/schema";
import { eq } from "drizzle-orm";
import { env } from "./lib/env";
import crypto from "crypto";

const SESSION_SECRET = env.appSecret || "kimiokc-local-secret";
const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7天

function signSession(userId: number): string {
  const timestamp = Date.now().toString();
  const payload = `${userId}.${timestamp}`;
  const signature = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

export function verifySession(token: string): { userId: number } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [userIdStr, timestamp, signature] = parts;
    const payload = `${userIdStr}.${timestamp}`;
    const expected = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

    const age = Date.now() - parseInt(timestamp, 10);
    if (age > SESSION_MAX_AGE) return null;

    return { userId: parseInt(userIdStr, 10) };
  } catch {
    return null;
  }
}

export const authRouter = createRouter({
  // 注册
  register: publicQuery
    .input(
      z.object({
        username: z.string().min(2).max(50),
        password: z.string().min(6).max(100),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();

      // 检查用户名是否已存在
      const existing = await db.select().from(users).where(eq(users.unionId, input.username));
      if (existing.length > 0) {
        throw new Error("用户名已存在");
      }

      const passwordHash = await bcrypt.hash(input.password, 10);
      const [{ id }] = await db
        .insert(users)
        .values({
          unionId: input.username,
          name: input.username,
          passwordHash,
        })
        .$returningId();

      const token = signSession(id);
      return { token, userId: id };
    }),

  // 登录
  login: publicQuery
    .input(
      z.object({
        username: z.string(),
        password: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const [user] = await db.select().from(users).where(eq(users.unionId, input.username));

      if (!user || !user.passwordHash) {
        throw new Error("用户名或密码错误");
      }

      const valid = await bcrypt.compare(input.password, user.passwordHash);
      if (!valid) {
        throw new Error("用户名或密码错误");
      }

      // 更新最后登录时间
      await db.update(users).set({ lastSignInAt: new Date() }).where(eq(users.id, user.id));

      const token = signSession(user.id);
      return { token, userId: user.id };
    }),

  // 登出（前端清除 cookie 即可，这里返回成功）
  logout: authedQuery.mutation(() => {
    return { success: true };
  }),

  // 获取当前用户
  me: publicQuery.query(async ({ ctx }) => {
    // 尝试从 cookie 解析 session
    const cookieHeader = ctx.req.headers.get("cookie") || "";
    const tokenMatch = cookieHeader.match(/kimiokc_session=([^;]+)/);
    if (!tokenMatch) return null;

    const session = verifySession(decodeURIComponent(tokenMatch[1]));
    if (!session) return null;

    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.id, session.userId));
    return user || null;
  }),

  // 修改密码
  changePassword: authedQuery
    .input(
      z.object({
        oldPassword: z.string(),
        newPassword: z.string().min(6).max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [user] = await db.select().from(users).where(eq(users.id, ctx.user.id));

      if (!user || !user.passwordHash) {
        throw new Error("用户不存在");
      }

      const valid = await bcrypt.compare(input.oldPassword, user.passwordHash);
      if (!valid) {
        throw new Error("原密码错误");
      }

      const newHash = await bcrypt.hash(input.newPassword, 10);
      await db.update(users).set({ passwordHash: newHash }).where(eq(users.id, ctx.user.id));

      return { success: true };
    }),
});
