import express from "express";
import cors from "cors";
import path from "path";
import { clerkMiddleware } from "@clerk/express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./routers";
import { createContext } from "./_core/trpc";
import { ENV } from "./_core/env";
import { startNFSeWorker } from "./_core/worker";

const app = express();

app.use(cors({
  origin: ENV.nodeEnv === "production" ? ENV.publicUrl : true,
  credentials: true,
}));
app.use(express.json());
app.use(clerkMiddleware());

// ─── Health check (UptimeRobot keep-alive no Render free tier) ───────────────
app.get("/health", (_req, res) => res.json({ ok: true }));

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
