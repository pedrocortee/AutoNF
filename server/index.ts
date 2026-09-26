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
import { startInboundWorker } from "./_core/inbound/queue";
import { startDfeSync } from "./_core/sefaz/dfeRunner";
import { inboundRoutes } from "./inboundRoutes";
import { idsPendingProcessing } from "./inboundDb";
import { enqueueInbound } from "./_core/inbound/queue";
import {
  upsertUser,
  getBillingInvoicesByAsaasSubscriptionId,
  updateBillingInvoice,
  getPlanByName,
  createSubscription,
  updateSubscriptionByUserId,
  deleteExpiredInvoices,
} from "./db";
import type { AsaasWebhookEvent } from "./_core/asaas";
import { ensureAsaasWebhook } from "./_core/asaas";

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

// ─── Asaas webhook — raw Express route (tRPC can't receive Asaas's plain JSON) ─
app.post("/api/webhooks/asaas", async (req, res) => {
  try {
    const { event, payment } = req.body as AsaasWebhookEvent;
    const subscriptionId = payment?.subscription;

    if (!payment || !subscriptionId) {
      res.json({ ok: true });
      return;
    }

    const invoices = await getBillingInvoicesByAsaasSubscriptionId(subscriptionId);
    const invoice = invoices[0];

    if (event === "PAYMENT_CONFIRMED" || event === "PAYMENT_RECEIVED") {
      if (invoice) {
        await updateBillingInvoice(invoice.id, {
          status: "confirmed",
          paymentMethod: payment.billingType,
          asaasPaymentId: payment.id,
        });
        const plan = await getPlanByName(invoice.planName);
        if (plan) {
          await createSubscription(invoice.userId, plan.id);
          console.log(`[asaas-webhook] subscription activated for userId=${invoice.userId} plan=${plan.name}`);
        }
      }
    } else if (event === "PAYMENT_OVERDUE") {
      if (invoice) {
        await updateBillingInvoice(invoice.id, { status: "overdue" });
      }
    } else if (event === "PAYMENT_DELETED" || event === "SUBSCRIPTION_DELETED") {
      if (invoice) {
        await updateBillingInvoice(invoice.id, { status: "cancelled" });
        await updateSubscriptionByUserId(invoice.userId, { status: "cancelled" });
      }
    }
  } catch (err) {
    console.error("[asaas-webhook] error:", err);
  }
  res.json({ ok: true });
});

app.use(clerkMiddleware());

// ─── Módulo Entrada: upload binário, arquivo original e exportação CSV ───────
app.use(inboundRoutes);

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
startInboundWorker();
startDfeSync().catch((err) => console.error("[DfeSync] could not start:", err));

// A restart can drop queued jobs (e.g. a free/in-memory Redis) while the document keeps its
// status in MySQL — put those back on the queue so nothing sits forever as "recebido"/"processando".
idsPendingProcessing()
  .then((ids) => {
    if (ids.length === 0) return;
    console.log(`[Inbound] requeuing ${ids.length} document(s) pending from before the restart`);
    return Promise.all(ids.map((id) => enqueueInbound(id)));
  })
  .catch((err) => console.error("[Inbound] could not requeue pending documents:", err));

// Auto-register Asaas webhook on startup (skipped when PUBLIC_URL is localhost)
ensureAsaasWebhook(ENV.publicUrl);

// Clean up expired free-plan invoices on startup and every 6 hours
deleteExpiredInvoices().then((n) => n > 0 && console.log(`[cleanup] deleted ${n} expired invoices`)).catch(console.error);
setInterval(() => {
  deleteExpiredInvoices().then((n) => n > 0 && console.log(`[cleanup] deleted ${n} expired invoices`)).catch(console.error);
}, 24 * 60 * 60 * 1000);

export type AppRouter = typeof appRouter;
