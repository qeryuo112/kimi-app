import { z } from "zod";
import bcrypt from "bcryptjs";
import { createRouter, publicQuery, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { users } from "@db/schema";
import { eq, sql } from "drizzle-orm";
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
  console.log("[Auth] verifySession called, token length=", token.length);
  try {
    const parts = token.split(".");
    console.log("[Auth] token parts count=", parts.length);
    if (parts.length !== 3) {
      console.log("[Auth] verifySession: invalid part count");
      return null;
    }
    const [userIdStr, timestamp, signature] = parts;
    const payload = `${userIdStr}.${timestamp}`;
    const expected = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
    const sigMatch = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    console.log("[Auth] signature match=", sigMatch);
    if (!sigMatch) return null;

    const age = Date.now() - parseInt(timestamp, 10);
    console.log("[Auth] token age ms=", age, "max=", SESSION_MAX_AGE);
    if (age > SESSION_MAX_AGE) return null;

    const userId = parseInt(userIdStr, 10);
    console.log("[Auth] verifySession success, userId=", userId);
    return { userId };
  } catch (err) {
    console.error("[Auth] verifySession error:", err);
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
      console.log("[Auth] register mutation called, username=", input.username);
      const db = getDb();

      // 检查用户名是否已存在
      const existing = await db.select().from(users).where(eq(users.unionId, input.username));
      console.log("[Auth] register: existing user count=", existing.length);
      if (existing.length > 0) {
        console.log("[Auth] register: username already exists");
        throw new Error("用户名已存在");
      }

      console.log("[Auth] register: hashing password");
      const passwordHash = await bcrypt.hash(input.password, 10);

      // 检查是否已有用户，第一个用户设为管理员
      const allUsers = await db.select({ count: sql`count(*)` }).from(users);
      const isFirstUser = Number(allUsers[0]?.count) === 0;
      console.log("[Auth] register: isFirstUser=", isFirstUser);

      console.log("[Auth] register: inserting user");
      const [{ id }] = await db
        .insert(users)
        .values({
          unionId: input.username,
          name: input.username,
          passwordHash,
          role: isFirstUser ? "admin" : "user",
        })
        .$returningId();

      console.log("[Auth] register: user created, id=", id);
      const token = signSession(id);
      console.log("[Auth] register: returning token");
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
      console.log("[Auth] login mutation called, username=", input.username);
      const db = getDb();
      console.log("[Auth] login: querying users table");
      const [user] = await db.select().from(users).where(eq(users.unionId, input.username));
      console.log("[Auth] login: user found=", !!user, "hasPassword=", !!user?.passwordHash);

      if (!user || !user.passwordHash) {
        console.log("[Auth] login: user not found or no password");
        throw new Error("用户名或密码错误");
      }

      console.log("[Auth] login: comparing password");
      const valid = await bcrypt.compare(input.password, user.passwordHash);
      console.log("[Auth] login: password valid=", valid);
      if (!valid) {
        throw new Error("用户名或密码错误");
      }

      // 更新最后登录时间
      await db.update(users).set({ lastSignInAt: new Date() }).where(eq(users.id, user.id));

      const token = signSession(user.id);
      console.log("[Auth] login: returning token for userId=", user.id);
      return { token, userId: user.id };
    }),

  // 登出（前端清除 cookie 即可，这里返回成功）
  logout: authedQuery.mutation(() => {
    return { success: true };
  }),

  // 获取当前用户
  me: publicQuery.query(async ({ ctx }) => {
    console.log("[Auth] me query called");
    // 尝试从 cookie 解析 session
    const cookieHeader = ctx.req.headers.get("cookie") || "";
    console.log("[Auth] me: cookie header length=", cookieHeader.length);
    const tokenMatch = cookieHeader.match(/kimiokc_session=([^;]+)/);
    console.log("[Auth] me: token match=", !!tokenMatch);
    if (!tokenMatch) return null;

    const session = verifySession(decodeURIComponent(tokenMatch[1]));
    console.log("[Auth] me: session valid=", !!session);
    if (!session) return null;

    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.id, session.userId));
    console.log("[Auth] me: user found=", !!user);
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
