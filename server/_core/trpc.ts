import { initTRPC, TRPCError } from "@trpc/server";
import type { Request, Response } from "express";
import { getDb } from "../db";
import { users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { COOKIE_NAME } from "@shared/const";

export interface Context {
  req: Request;
  res: Response;
  user: { id: number; openId: string; name: string | null; email: string | null; role: string; privacyConsentedAt: Date | null } | null;
}

export async function createContext({ req, res }: { req: Request; res: Response }): Promise<Context> {
  const sessionRaw = req.cookies?.[COOKIE_NAME];
  let user: Context["user"] = null;

  if (sessionRaw) {
    try {
      const session = JSON.parse(Buffer.from(sessionRaw, "base64").toString("utf8")) as { openId?: string };
      if (session.openId) {
        const db = await getDb();
        if (db) {
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
            .where(eq(users.openId, session.openId))
            .limit(1);
          user = found ?? null;
        }
      }
    } catch {
      // malformed cookie — ignore
    }
  }

  return { req, res, user };
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
