import { initTRPC, TRPCError } from "@trpc/server";
import type { Request, Response } from "express";
import { getAuth } from "@clerk/express";
import { getDb } from "../db";
import { users } from "../../drizzle/schema";
import { upsertUser } from "../db";
import { eq } from "drizzle-orm";
import { ENV } from "./env";

export interface Context {
  req: Request;
  res: Response;
  user: { id: number; openId: string; name: string | null; email: string | null; role: string; privacyConsentedAt: Date | null } | null;
}

export async function createContext({ req, res }: { req: Request; res: Response }): Promise<Context> {
  const { userId } = getAuth(req);

  if (!userId) {
    return { req, res, user: null };
  }

  const db = await getDb();
  if (!db) return { req, res, user: null };

  // Lazy upsert — creates user row on first authenticated request
  await upsertUser({
    openId: userId,
    role: userId === ENV.ownerOpenId ? "admin" : "user",
    lastSignedIn: new Date(),
  });

  const [found] = await db
    .select({
      id: users.id,
      openId: users.openId,
      name: users.name,
      email: users.email,
      role: users.role,
      privacyConsentedAt: users.privacyConsentedAt,
    })
    .from(users)
    .where(eq(users.openId, userId))
    .limit(1);

  return { req, res, user: found ?? null };
}

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});
