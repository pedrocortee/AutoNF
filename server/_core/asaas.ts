import crypto from "crypto";
const ASAAS_SANDBOX_URL = "https://api-sandbox.asaas.com/v3";
const ASAAS_PROD_URL = "https://api.asaas.com/v3";

function getBaseUrl(): string {
  return process.env.ASAAS_ENV === "production" ? ASAAS_PROD_URL : ASAAS_SANDBOX_URL;
}

function getApiKey(): string {
  const key = process.env.ASAAS_API_KEY;
  if (!key) throw new Error("ASAAS_API_KEY não configurada");
  return key;
}

async function asaasRequest<T>(
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const res = await fetch(`${getBaseUrl()}${path}`, {
    method,
    headers: {
      "access_token": getApiKey(),
      "Content-Type": "application/json",
      "User-Agent": "AutoNF/1.0",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Asaas API error ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

export interface AsaasCustomerData {
  id: string;
  name: string;
  email: string;
  cpfCnpj?: string;
}

export interface AsaasSubscriptionData {
  id: string;
  customer: string;
  status: string;
  value: number;
  billingType: string;
  nextDueDate: string;
  paymentLink?: string;
}

export interface AsaasPaymentData {
  id: string;
  customer: string;
  subscription?: string;
  value: number;
  netValue: number;
  billingType: string;
  status: string;
  dueDate: string;
  paymentDate?: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  pixQrCodeId?: string;
}

export interface AsaasWebhookEvent {
  event: string;
  payment?: AsaasPaymentData;
  subscription?: { id: string; status: string };
}

/**
 * Create or find a customer in Asaas
 */
export async function createAsaasCustomer(params: {
  name: string;
  email: string;
  cpfCnpj?: string;
}): Promise<AsaasCustomerData> {
  return asaasRequest<AsaasCustomerData>("POST", "/customers", {
    name: params.name,
    email: params.email,
    cpfCnpj: params.cpfCnpj,
    notificationDisabled: false,
  });
}

/**
 * Create a recurring subscription in Asaas (monthly)
 */
export async function createAsaasSubscription(params: {
  customerId: string;
  value: number;
  planName: string;
  nextDueDate?: string;
}): Promise<AsaasSubscriptionData> {
  const dueDate =
    params.nextDueDate ?? new Date().toISOString().split("T")[0];

  return asaasRequest<AsaasSubscriptionData>("POST", "/subscriptions", {
    customer: params.customerId,
    billingType: "CREDIT_CARD",
    value: params.value,
    nextDueDate: dueDate,
    cycle: "MONTHLY",
    description: `AutoNF - Plano ${params.planName}`,
  });
}

/**
 * Cancel an Asaas subscription
 */
export async function cancelAsaasSubscription(subscriptionId: string): Promise<void> {
  await asaasRequest("DELETE", `/subscriptions/${subscriptionId}`);
}

/**
 * Get subscription details
 */
export async function getAsaasSubscription(subscriptionId: string): Promise<AsaasSubscriptionData> {
  return asaasRequest<AsaasSubscriptionData>("GET", `/subscriptions/${subscriptionId}`);
}

/**
 * List payments for a subscription
 */
export async function listAsaasPayments(params: {
  subscription?: string;
  customer?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: AsaasPaymentData[]; totalCount: number }> {
  const qs = new URLSearchParams();
  if (params.subscription) qs.set("subscription", params.subscription);
  if (params.customer) qs.set("customer", params.customer);
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.offset) qs.set("offset", String(params.offset));

  return asaasRequest<{ data: AsaasPaymentData[]; totalCount: number }>(
    "GET",
    `/payments?${qs.toString()}`
  );
}

/**
 * Checkout page of a subscription: Asaas does not return a link on the subscription itself,
 * only on its charges (the first one is created right away, sometimes a moment later).
 */
export async function firstPaymentUrl(subscriptionId: string, attempts = 4): Promise<string | null> {
  for (let i = 0; i < attempts; i++) {
    const { data } = await listAsaasPayments({ subscription: subscriptionId, limit: 10 });
    const open = data.find((p) => p.status === "PENDING" || p.status === "OVERDUE") ?? data[0];
    if (open?.invoiceUrl) return open.invoiceUrl;
    await new Promise((r) => setTimeout(r, 750));
  }
  return null;
}

/**
 * Get payment URL for a specific payment
 */
export async function getAsaasPaymentLink(paymentId: string): Promise<string | undefined> {
  const payment = await asaasRequest<AsaasPaymentData>("GET", `/payments/${paymentId}`);
  return payment.invoiceUrl ?? payment.bankSlipUrl;
}

/**
 * Check if Asaas integration is configured
 */
export function isAsaasConfigured(): boolean {
  return !!process.env.ASAAS_API_KEY;
}

/**
 * Shared secret Asaas sends in the "asaas-access-token" header of every notification
 * (set as authToken when the webhook is registered). Without it the webhook could be forged.
 */
export function webhookToken(): string | null {
  const t = process.env.ASAAS_WEBHOOK_TOKEN ?? "";
  return t.length >= 32 ? t : null;
}

export function isValidWebhookToken(received: string | undefined): boolean {
  const expected = webhookToken();
  if (!expected || !received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

interface AsaasWebhookConfig {
  id: string;
  url: string;
  enabled: boolean;
  interrupted: boolean;
}

/**
 * Ensure Asaas webhook is registered pointing to this server's public URL.
 * Skipped in dev when PUBLIC_URL is localhost (no-op, syncSubscription is the fallback).
 */
export async function ensureAsaasWebhook(publicUrl: string): Promise<void> {
  if (!isAsaasConfigured()) return;
  if (publicUrl.includes("localhost") || publicUrl.includes("127.0.0.1")) return;

  const authToken = webhookToken();
  if (!authToken) {
    console.error("[asaas-webhook] ASAAS_WEBHOOK_TOKEN missing or shorter than 32 chars — webhook not registered");
    return;
  }
  const webhookUrl = `${publicUrl}/api/webhooks/asaas`;
  const events = [
    "PAYMENT_CONFIRMED",
    "PAYMENT_RECEIVED",
    "PAYMENT_OVERDUE",
    "PAYMENT_DELETED",
    "SUBSCRIPTION_DELETED",
  ];

  try {
    const existing = await asaasRequest<{ data: AsaasWebhookConfig[] }>("GET", "/webhooks");

    // Remove stale webhooks pointing to other URLs (old tunnel URLs)
    for (const w of existing.data) {
      if (w.url !== webhookUrl) {
        await asaasRequest("DELETE", `/webhooks/${w.id}`).catch(() => null);
        console.log(`[asaas-webhook] removed stale webhook → ${w.url}`);
      }
    }

    const ours = existing.data.find((w) => w.url === webhookUrl);
    if (ours) {
      // Always re-send the token (it may have been rotated) and the event list
      await asaasRequest("PUT", `/webhooks/${ours.id}`, { enabled: true, interrupted: false, authToken, events });
      console.log(`[asaas-webhook] webhook synced → ${webhookUrl}`);
      return;
    }

    await asaasRequest("POST", "/webhooks", {
      name: "AutoNF",
      url: webhookUrl,
      email: process.env.EMAIL_FROM ?? "noreply@autonf.com.br",
      apiVersion: "3",
      sendType: "NON_SEQUENTIALLY",
      enabled: true,
      interrupted: false,
      authToken,
      events,
    });
    console.log(`[asaas-webhook] registered webhook → ${webhookUrl}`);
  } catch (err) {
    console.error("[asaas-webhook] failed to register webhook:", err);
  }
}
