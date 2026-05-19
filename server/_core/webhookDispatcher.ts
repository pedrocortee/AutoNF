import crypto from "crypto";
import {
  getActiveWebhookEndpointsForUser,
  createWebhookDelivery,
  updateWebhookDelivery,
} from "../db";
import type { WebhookEndpoint } from "../../drizzle/schema";

export type WebhookEventName =
  | "invoice.created"
  | "invoice.processed"
  | "invoice.error"
  | "invoice.cancelled";

export interface WebhookPayload {
  event: WebhookEventName;
  timestamp: string;
  data: Record<string, unknown>;
}

/**
 * Dispatch an event to all active webhook endpoints configured by this user
 * that subscribed to this event. Fire-and-forget — errors are logged, not thrown.
 */
export async function dispatchWebhookEvent(
  userId: number,
  event: WebhookEventName,
  data: Record<string, unknown>
): Promise<void> {
  let endpoints: WebhookEndpoint[];
  try {
    endpoints = await getActiveWebhookEndpointsForUser(userId);
  } catch (err) {
    console.error("[WebhookDispatcher] Failed to fetch endpoints:", err);
    return;
  }

  const subscribed = endpoints.filter((ep) => {
    try {
      const events: string[] = JSON.parse(ep.events);
      return events.includes(event);
    } catch {
      return false;
    }
  });

  await Promise.all(subscribed.map((ep) => deliverWithRetry(ep, event, data)));
}

async function deliverWithRetry(
  endpoint: WebhookEndpoint,
  event: WebhookEventName,
  data: Record<string, unknown>
): Promise<void> {
  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };
  const body = JSON.stringify(payload);
  const signature = `sha256=${crypto
    .createHmac("sha256", endpoint.secret)
    .update(body)
    .digest("hex")}`;

  let deliveryId: number;
  try {
    const result = await createWebhookDelivery({
      webhookEndpointId: endpoint.id,
      event,
      payload: body,
      attempts: 0,
      success: "false",
    });
    deliveryId = (result as any).insertId;
  } catch (err) {
    console.error("[WebhookDispatcher] Failed to create delivery record:", err);
    return;
  }

  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      // Exponential backoff: 2s, 4s
      await sleep(Math.pow(2, attempt - 1) * 1000);
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      const response = await fetch(endpoint.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-AutoNF-Signature": signature,
          "X-AutoNF-Event": event,
          "X-AutoNF-Delivery": String(deliveryId),
        },
        body,
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      const responseBody = await response.text().catch(() => "");

      await updateWebhookDelivery(deliveryId, {
        responseStatus: response.status,
        responseBody: responseBody.slice(0, 2000),
        attempts: attempt,
        success: response.ok ? "true" : "false",
      });

      if (response.ok) return;

      console.warn(
        `[WebhookDispatcher] Endpoint ${endpoint.id} returned ${response.status} (attempt ${attempt})`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await updateWebhookDelivery(deliveryId, {
        responseStatus: 0,
        responseBody: msg.slice(0, 2000),
        attempts: attempt,
        success: "false",
      }).catch(() => {});
      console.warn(
        `[WebhookDispatcher] Endpoint ${endpoint.id} request failed (attempt ${attempt}): ${msg}`
      );
    }
  }

  console.error(
    `[WebhookDispatcher] Endpoint ${endpoint.id} exhausted ${MAX_ATTEMPTS} attempts for event ${event}`
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
