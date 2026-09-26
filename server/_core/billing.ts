/**
 * Plans billing: checkout, Asaas notifications and cancellation.
 *
 * Rules
 * - A paid plan is only activated by a confirmed Asaas payment (webhook or manual sync).
 * - One live Asaas subscription per user: activating a plan cancels the previous one, and a
 *   new checkout cancels abandoned checkouts of other plans (no double charging).
 * - Overdue payment pauses access; the next confirmed payment brings it back.
 * - Deleting an old Asaas subscription never touches the plan paid by a newer one.
 *
 * All I/O goes through BillingDeps so the rules can be tested without a database or Asaas.
 */

import type { BillingInvoice, InsertBillingInvoice, Plan } from "../../drizzle/schema";
import type { CurrentSubscription } from "../billingDb";

export interface AsaasPaymentLike {
  id: string;
  subscription?: string;
  value?: number;
  billingType?: string;
  dueDate?: string;
  invoiceUrl?: string;
}

export interface BillingDeps {
  getPlanByName(name: string): Promise<Plan | undefined>;
  getCurrent(userId: number): Promise<CurrentSubscription | undefined>;
  start(userId: number, planId: number, asaasSubscriptionId: string | null): Promise<void>;
  renew(sub: CurrentSubscription): Promise<void>;
  setStatus(subscriptionId: number, status: "active" | "paused" | "cancelled"): Promise<void>;
  invoicesFor(asaasSubscriptionId: string): Promise<BillingInvoice[]>;
  insertInvoice(data: InsertBillingInvoice): Promise<void>;
  patchInvoice(id: number, patch: Partial<Pick<BillingInvoice, "status" | "paymentMethod" | "paymentUrl" | "asaasPaymentId">>): Promise<void>;
  cancelPendingInvoicesOf(asaasSubscriptionId: string): Promise<void>;
  liveAsaasSubscriptions(userId: number, except?: string): Promise<{ asaasSubscriptionId: string; planName: string; status: BillingInvoice["status"] }[]>;
  pendingCheckout(userId: number, planName: string): Promise<BillingInvoice | undefined>;
  asaasConfigured(): boolean;
  /** Asaas customer id for the user, creating it when missing */
  ensureCustomer(userId: number): Promise<string>;
  createAsaasSubscription(customerId: string, plan: Plan): Promise<{ id: string }>;
  asaasSubscriptionStatus(asaasSubscriptionId: string): Promise<string | null>;
  firstPaymentUrl(asaasSubscriptionId: string): Promise<string | null>;
  /** Payments Asaas confirmed for the subscription (newest first) */
  confirmedPayments(asaasSubscriptionId: string): Promise<AsaasPaymentLike[]>;
  cancelAsaas(asaasSubscriptionId: string): Promise<void>;
  /** Paid plans without Asaas are activated directly only outside production */
  isProduction(): boolean;
  today(): string;
}

export class BillingError extends Error {
  constructor(public code: "NOT_FOUND" | "BAD_REQUEST" | "PRECONDITION_FAILED", message: string) {
    super(message);
  }
}

/** Cancels Asaas subscriptions the user no longer needs (errors are logged, never block the flow). */
async function dropAsaasSubscriptions(deps: BillingDeps, userId: number, keep?: string, onlyUnpaid = false): Promise<string[]> {
  const dropped: string[] = [];
  for (const s of await deps.liveAsaasSubscriptions(userId, keep)) {
    if (onlyUnpaid && s.status !== "pending") continue;
    try {
      await deps.cancelAsaas(s.asaasSubscriptionId);
    } catch (err) {
      console.warn(`[billing] could not cancel Asaas subscription ${s.asaasSubscriptionId}:`, (err as Error).message);
    }
    await deps.cancelPendingInvoicesOf(s.asaasSubscriptionId);
    dropped.push(s.asaasSubscriptionId);
  }
  return dropped;
}

// ─── Checkout ────────────────────────────────────────────────────────────────

export type CheckoutResult = { directActivation: true; paymentUrl: null } | { directActivation: false; paymentUrl: string | null };

export async function checkout(deps: BillingDeps, userId: number, planName: string): Promise<CheckoutResult> {
  const plan = await deps.getPlanByName(planName);
  if (!plan) throw new BillingError("NOT_FOUND", "Plano não encontrado");
  const current = await deps.getCurrent(userId);
  if (current?.plan.id === plan.id && current.status === "active") {
    throw new BillingError("BAD_REQUEST", `Você já está no plano ${plan.name}`);
  }

  if (plan.pricePerMonth === 0) {
    await dropAsaasSubscriptions(deps, userId);
    await deps.start(userId, plan.id, null);
    return { directActivation: true, paymentUrl: null };
  }

  if (!deps.asaasConfigured()) {
    if (deps.isProduction()) throw new BillingError("PRECONDITION_FAILED", "Pagamentos indisponíveis no momento");
    await deps.start(userId, plan.id, null); // local development only
    return { directActivation: true, paymentUrl: null };
  }

  // Overdue on this same plan: pay the open charge instead of subscribing again
  if (current?.plan.id === plan.id && current.status === "paused" && current.asaasSubscriptionId) {
    return { directActivation: false, paymentUrl: await deps.firstPaymentUrl(current.asaasSubscriptionId) };
  }

  // Reuse an open checkout for this plan while Asaas still has it
  const open = await deps.pendingCheckout(userId, plan.name);
  if (open?.asaasSubscriptionId && (await deps.asaasSubscriptionStatus(open.asaasSubscriptionId)) === "ACTIVE") {
    const url = open.paymentUrl ?? (await deps.firstPaymentUrl(open.asaasSubscriptionId));
    if (url && !open.paymentUrl) await deps.patchInvoice(open.id, { paymentUrl: url });
    await dropAsaasSubscriptions(deps, userId, open.asaasSubscriptionId, true);
    return { directActivation: false, paymentUrl: url };
  }
  if (open) await deps.patchInvoice(open.id, { status: "cancelled" });

  // Abandoned checkouts of other plans stop charging; the paid plan keeps running until the new one is paid
  await dropAsaasSubscriptions(deps, userId, undefined, true);

  const customerId = await deps.ensureCustomer(userId);
  const sub = await deps.createAsaasSubscription(customerId, plan);
  const paymentUrl = await deps.firstPaymentUrl(sub.id);
  await deps.insertInvoice({
    userId,
    planName: plan.name,
    amount: plan.pricePerMonth,
    dueDate: deps.today(),
    asaasSubscriptionId: sub.id,
    paymentUrl,
    status: "pending",
  });
  return { directActivation: false, paymentUrl };
}

// ─── Activation (webhook and manual sync share it) ───────────────────────────

async function activateFromPayment(
  deps: BillingDeps,
  asaasSubscriptionId: string,
  payment: AsaasPaymentLike,
  invoices: BillingInvoice[]
): Promise<"activated" | "renewed" | "duplicate" | "unknown-plan"> {
  const first = invoices[invoices.length - 1];
  const userId = first.userId;
  const byPayment = invoices.find((i) => i.asaasPaymentId === payment.id);
  // Asaas retries notifications: a payment already confirmed was handled (and must not
  // re-activate a plan the user has since left)
  if (byPayment?.status === "confirmed") return "duplicate";

  const confirmedPatch = { status: "confirmed" as const, asaasPaymentId: payment.id, paymentMethod: payment.billingType ?? null };
  const open = invoices.find((i) => !i.asaasPaymentId && (i.status === "pending" || i.status === "overdue"));
  if (byPayment) {
    await deps.patchInvoice(byPayment.id, confirmedPatch);
  } else if (open) {
    await deps.patchInvoice(open.id, confirmedPatch);
  } else {
    await deps.insertInvoice({
      userId,
      planName: first.planName,
      amount: Math.round((payment.value ?? 0) * 100),
      dueDate: payment.dueDate ?? deps.today(),
      asaasSubscriptionId,
      asaasPaymentId: payment.id,
      paymentMethod: payment.billingType ?? null,
      status: "confirmed",
    });
  }

  const plan = await deps.getPlanByName(first.planName);
  if (!plan) return "unknown-plan";
  const cur = await deps.getCurrent(userId);
  if (cur?.asaasSubscriptionId === asaasSubscriptionId) {
    await deps.renew(cur);
    return "renewed";
  }
  await deps.start(userId, plan.id, asaasSubscriptionId);
  await dropAsaasSubscriptions(deps, userId, asaasSubscriptionId);
  return "activated";
}

export type EventOutcome =
  | "ignored"
  | "activated"
  | "renewed"
  | "duplicate"
  | "unknown-plan"
  | "paused"
  | "invoice-cancelled"
  | "subscription-cancelled";

export async function handleAsaasEvent(
  deps: BillingDeps,
  event: string,
  payment: AsaasPaymentLike | undefined,
  subscription?: { id: string }
): Promise<EventOutcome> {
  const asaasSubscriptionId = payment?.subscription ?? subscription?.id;
  if (!asaasSubscriptionId) return "ignored";
  const invoices = await deps.invoicesFor(asaasSubscriptionId);
  if (invoices.length === 0) return "ignored"; // not created by this app

  const userId = invoices[0].userId;
  const target = payment ? (invoices.find((i) => i.asaasPaymentId === payment.id) ?? invoices.find((i) => !i.asaasPaymentId && i.status === "pending")) : undefined;

  switch (event) {
    case "PAYMENT_CONFIRMED":
    case "PAYMENT_RECEIVED":
      return payment ? activateFromPayment(deps, asaasSubscriptionId, payment, invoices) : "ignored";

    case "PAYMENT_OVERDUE": {
      if (!payment) return "ignored";
      if (target) await deps.patchInvoice(target.id, { status: "overdue", paymentUrl: payment.invoiceUrl ?? target.paymentUrl });
      else {
        await deps.insertInvoice({
          userId,
          planName: invoices[0].planName,
          amount: Math.round((payment.value ?? 0) * 100),
          dueDate: payment.dueDate ?? deps.today(),
          asaasSubscriptionId,
          asaasPaymentId: payment.id,
          paymentUrl: payment.invoiceUrl ?? null,
          status: "overdue",
        });
      }
      const cur = await deps.getCurrent(userId);
      if (cur?.asaasSubscriptionId === asaasSubscriptionId && cur.status === "active") await deps.setStatus(cur.id, "paused");
      return "paused";
    }

    case "PAYMENT_DELETED":
      if (target && target.status !== "confirmed") await deps.patchInvoice(target.id, { status: "cancelled" });
      return "invoice-cancelled";

    case "SUBSCRIPTION_DELETED":
    case "SUBSCRIPTION_INACTIVATED": {
      await deps.cancelPendingInvoicesOf(asaasSubscriptionId);
      const cur = await deps.getCurrent(userId);
      if (cur?.asaasSubscriptionId === asaasSubscriptionId) {
        await deps.setStatus(cur.id, "cancelled");
        return "subscription-cancelled";
      }
      return "invoice-cancelled";
    }

    default:
      return "ignored";
  }
}

/** Manual check ("já paguei"): same activation path as the webhook, for when a notification is late. */
export async function syncPendingPayment(deps: BillingDeps, userId: number): Promise<{ activated: boolean; planName: string | null }> {
  const live = await deps.liveAsaasSubscriptions(userId);
  for (const s of live.filter((x) => x.status === "pending" || x.status === "overdue")) {
    const invoices = await deps.invoicesFor(s.asaasSubscriptionId);
    const recorded = new Set(invoices.filter((i) => i.status === "confirmed").map((i) => i.asaasPaymentId));
    // Only a payment this app has not accounted for yet (an older paid charge is not news)
    const payment = (await deps.confirmedPayments(s.asaasSubscriptionId)).find((p) => !recorded.has(p.id));
    if (!payment) continue;
    const outcome = await activateFromPayment(deps, s.asaasSubscriptionId, payment, invoices);
    if (outcome === "activated" || outcome === "renewed") return { activated: true, planName: s.planName };
  }
  return { activated: false, planName: null };
}

export async function cancelPlan(deps: BillingDeps, userId: number): Promise<void> {
  const current = await deps.getCurrent(userId);
  if (!current) throw new BillingError("NOT_FOUND", "Nenhuma assinatura ativa");
  await dropAsaasSubscriptions(deps, userId);
  await deps.setStatus(current.id, "cancelled");
}
