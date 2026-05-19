import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import path from "path";
import crypto from "crypto";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./routers";
import { createContext } from "./_core/trpc";
import { upsertUser } from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { ENV } from "./_core/env";
import { COOKIE_NAME } from "@shared/const";
import { startNFSeWorker } from "./_core/worker";

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json());

// ─── Dev auth: auto-login as demo user ────────────────────────────────────────
// In production, replace this block with your auth provider (Clerk, Auth.js, etc.)
app.get("/api/auth/login", async (req, res) => {
  const openId = `dev-user-${ENV.nodeEnv === "development" ? "local" : crypto.randomUUID()}`;
  await upsertUser({
    openId,
    name: "Dev User",
    email: "dev@autonf.local",
    loginMethod: "dev",
    role: "user",
  });
  const session = Buffer.from(JSON.stringify({ openId })).toString("base64");
  res.cookie(COOKIE_NAME, session, getSessionCookieOptions(req));
  res.redirect("/dashboard");
});

app.get("/api/auth/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME, getSessionCookieOptions(req));
  res.redirect("/");
});

// ─── tRPC ─────────────────────────────────────────────────────────────────────
app.use(
  "/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

// ─── Static files (production) ────────────────────────────────────────────────
if (ENV.nodeEnv === "production") {
  const clientDist = path.resolve(process.cwd(), "dist/client");
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

app.listen(ENV.port, () => {
  console.log(`[server] running on port ${ENV.port} (${ENV.nodeEnv})`);
});

// Start the BullMQ worker in the same process (single-service deploy)
startNFSeWorker();

export type AppRouter = typeof appRouter;
