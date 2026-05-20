import express from "express";
import cors from "cors";
import path from "path";
import { clerkMiddleware } from "@clerk/express";
import { Webhook } from "svix";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./routers";
import { createContext } from "./_core/trpc";
import { ENV } from "./_core/env";
import { startNFSeWorker } from "./_core/worker";
import { upsertUser } from "./db";

const app = express();

app.use(cors({
  origin: ENV.nodeEnv === "production" ? ENV.publicUrl : true,
  credentials: true,
}));

// ─── Health check (UptimeRobot keep-alive no Render free tier) ───────────────
app.get("/health", (_req, res) => res.json({ ok: true }));

// ─── Clerk webhook — must be before express.json() to preserve raw body ───────
app.post(
  "/api/webhooks/clerk",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const secret = ENV.clerkWebhookSecret;
    if (!secret) {
      console.error("[clerk-webhook] CLERK_WEBHOOK_SECRET not set");
      res.status(500).json({ error: "webhook secret not configured" });
      return;
    }

    const wh = new Webhook(secret);
    let evt: { type: string; data: Record<string, unknown> };
    try {
      evt = wh.verify(req.body, {
        "svix-id": req.headers["svix-id"] as string,
        "svix-timestamp": req.headers["svix-timestamp"] as string,
        "svix-signature": req.headers["svix-signature"] as string,
      }) as typeof evt;
    } catch (err) {
      console.error("[clerk-webhook] signature verification failed:", err);
      res.status(400).json({ error: "invalid signature" });
      return;
    }

    if (evt.type === "user.created" || evt.type === "user.updated") {
      const d = evt.data;
      const clerkId = d.id as string;
      const emails = (d.email_addresses ?? []) as Array<{ email_address: string; id: string }>;
      const primaryEmailId = d.primary_email_address_id as string | undefined;
      const primaryEmail = emails.find((e) => e.id === primaryEmailId)?.email_address
        ?? emails[0]?.email_address
        ?? null;
      const firstName = (d.first_name as string | null) ?? null;
      const lastName = (d.last_name as string | null) ?? null;
      const name = [firstName, lastName].filter(Boolean).join(" ") || null;

      await upsertUser({
        openId: clerkId,
        email: primaryEmail,
        name,
        role: clerkId === ENV.ownerOpenId ? "admin" : "user",
        lastSignedIn: new Date(),
      });
      console.log(`[clerk-webhook] upserted user ${clerkId} (${primaryEmail})`);
    }

    res.json({ ok: true });
  }
);

app.use(express.json());

app.use(clerkMiddleware());

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
