/**
 * Persistence for plans billing (Asaas subscriptions ↔ local subscriptions and billing invoices).
 * Kept apart from db.ts, which is already past the project's size limit.
 */

import { and, desc, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { getDb } from "./db";
import { billingInvoices, plans, subscriptions, type BillingInvoice, type InsertBillingInvoice, type Plan, type Subscription } from "../drizzle/schema";

async function db() {
  const d = await getDb();
  if (!d) throw new Error("Database not available");
  return d;
}

export type CurrentSubscription = Subscription & { plan: Plan };

/** Latest subscription that still matters for access: active or paused (payment overdue). */
export async function getCurrentSubscription(userId: number): Promise<CurrentSubscription | undefined> {
  const rows = await (await db())
    .select({ subscription: subscriptions, plan: plans })
    .from(subscriptions)
    .innerJoin(plans, eq(subscriptions.planId, plans.id))
    .where(and(eq(subscriptions.userId, userId), inArray(subscriptions.status, ["active", "paused"])))
    .orderBy(desc(subscriptions.id))
    .limit(1);
  return rows[0] ? { ...rows[0].subscription, plan: rows[0].plan } : undefined;
}

/** Ends any current subscription and starts a new one (one month ahead). */
export async function startSubscription(userId: number, planId: number, asaasSubscriptionId: string | null): Promise<void> {
  const d = await db();
  await d
    .update(subscriptions)
    .set({ status: "cancelled", cancellationDate: new Date() })
    .where(and(eq(subscriptions.userId, userId), inArray(subscriptions.status, ["active", "paused"])));
  const renewalDate = new Date();
  renewalDate.setMonth(renewalDate.getMonth() + 1);
  await d.insert(subscriptions).values({ userId, planId, status: "active", startDate: new Date(), renewalDate, asaasSubscriptionId });
}

/** Renewal paid: back to active, next renewal one month after the current one (or from today). */
export async function renewSubscription(sub: Subscription): Promise<void> {
  const base = sub.renewalDate && sub.renewalDate > new Date() ? new Date(sub.renewalDate) : new Date();
  base.setMonth(base.getMonth() + 1);
  await (await db()).update(subscriptions).set({ status: "active", renewalDate: base }).where(eq(subscriptions.id, sub.id));
}

export async function setSubscriptionStatus(id: number, status: "active" | "paused" | "cancelled"): Promise<void> {
  await (await db())
    .update(subscriptions)
    .set({ status, ...(status === "cancelled" ? { cancellationDate: new Date() } : {}) })
    .where(eq(subscriptions.id, id));
}

export async function invoicesForAsaasSubscription(asaasSubscriptionId: string): Promise<BillingInvoice[]> {
  return (await db())
    .select()
    .from(billingInvoices)
    .where(eq(billingInvoices.asaasSubscriptionId, asaasSubscriptionId))
    .orderBy(desc(billingInvoices.id));
}

export async function insertBillingInvoice(data: InsertBillingInvoice): Promise<void> {
  await (await db()).insert(billingInvoices).values(data);
}

export async function patchBillingInvoice(
  id: number,
  patch: Partial<Pick<BillingInvoice, "status" | "paymentMethod" | "paymentUrl" | "asaasPaymentId">>
): Promise<void> {
  await (await db()).update(billingInvoices).set(patch).where(eq(billingInvoices.id, id));
}

/** Cancels the local records of an Asaas subscription that is being dropped (unpaid checkout, old plan). */
export async function cancelPendingInvoicesOf(asaasSubscriptionId: string): Promise<void> {
  await (await db())
    .update(billingInvoices)
    .set({ status: "cancelled" })
    .where(and(eq(billingInvoices.asaasSubscriptionId, asaasSubscriptionId), inArray(billingInvoices.status, ["pending", "overdue"])));
}

/** Asaas subscriptions this user created that were not cancelled, optionally excluding one. */
export async function liveAsaasSubscriptions(userId: number, except?: string): Promise<{ asaasSubscriptionId: string; planName: string; status: BillingInvoice["status"] }[]> {
  const rows = await (await db())
    .select({ asaasSubscriptionId: billingInvoices.asaasSubscriptionId, planName: billingInvoices.planName, status: billingInvoices.status })
    .from(billingInvoices)
    .where(
      and(
        eq(billingInvoices.userId, userId),
        isNotNull(billingInvoices.asaasSubscriptionId),
        ne(billingInvoices.status, "cancelled"),
        ...(except ? [ne(billingInvoices.asaasSubscriptionId, except)] : [])
      )
    )
    .orderBy(desc(billingInvoices.id));
  const seen = new Map<string, { asaasSubscriptionId: string; planName: string; status: BillingInvoice["status"] }>();
  for (const r of rows) if (r.asaasSubscriptionId && !seen.has(r.asaasSubscriptionId)) seen.set(r.asaasSubscriptionId, { ...r, asaasSubscriptionId: r.asaasSubscriptionId });
  return [...seen.values()];
}

/** Open checkout (unpaid first charge) for a plan, to reuse instead of creating another subscription. */
export async function pendingCheckout(userId: number, planName: string): Promise<BillingInvoice | undefined> {
  const rows = await (await db())
    .select()
    .from(billingInvoices)
    .where(
      and(
        eq(billingInvoices.userId, userId),
        eq(billingInvoices.planName, planName),
        eq(billingInvoices.status, "pending"),
        isNotNull(billingInvoices.asaasSubscriptionId)
      )
    )
    .orderBy(desc(billingInvoices.id))
    .limit(1);
  return rows[0];
}
