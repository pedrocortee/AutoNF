import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockEndpoints: Record<number, any> = {};
const mockDeliveries: Record<number, any> = {};
let nextDeliveryId = 1;

vi.mock("./server/db", () => ({
  getActiveWebhookEndpointsForUser: vi.fn(async (userId: number) =>
    Object.values(mockEndpoints).filter((ep) => ep.userId === userId && ep.isActive === "true")
  ),
  createWebhookDelivery: vi.fn(async (data: any) => {
    const id = nextDeliveryId++;
    mockDeliveries[id] = { id, ...data };
    return { insertId: id };
  }),
  updateWebhookDelivery: vi.fn(async (id: number, data: any) => {
    if (mockDeliveries[id]) Object.assign(mockDeliveries[id], data);
  }),
}));

// ── Tests ────────────────────────────────────────────────────────────────────

import { dispatchWebhookEvent } from "./server/_core/webhookDispatcher";
import * as db from "./server/db";

function makeEndpoint(overrides: Partial<any> = {}): any {
  return {
    id: 1,
    userId: 42,
    url: "https://example.com/webhook",
    secret: "test-secret-32-bytes-long-abc123",
    events: JSON.stringify(["invoice.created", "invoice.processed", "invoice.error", "invoice.cancelled"]),
    isActive: "true",
    description: "Test endpoint",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  nextDeliveryId = 1;
  Object.keys(mockDeliveries).forEach((k) => delete (mockDeliveries as any)[k]);
  Object.keys(mockEndpoints).forEach((k) => delete (mockEndpoints as any)[k]);
  global.fetch = vi.fn();
});

describe("dispatchWebhookEvent", () => {
  it("skips endpoints that do not subscribe to the event", async () => {
    const ep = makeEndpoint({ events: JSON.stringify(["invoice.error"]) });
    (db.getActiveWebhookEndpointsForUser as any).mockResolvedValueOnce([ep]);

    await dispatchWebhookEvent(42, "invoice.created", { invoiceId: 1 });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("skips inactive endpoints", async () => {
    (db.getActiveWebhookEndpointsForUser as any).mockResolvedValueOnce([]);

    await dispatchWebhookEvent(42, "invoice.created", { invoiceId: 1 });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("dispatches matching event and records a successful delivery", async () => {
    const ep = makeEndpoint();
    (db.getActiveWebhookEndpointsForUser as any).mockResolvedValueOnce([ep]);
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => "OK",
    });

    await dispatchWebhookEvent(42, "invoice.created", { invoiceId: 7 });

    expect(global.fetch).toHaveBeenCalledOnce();
    const [url, opts] = (global.fetch as any).mock.calls[0];
    expect(url).toBe(ep.url);
    expect(opts.method).toBe("POST");

    const body = JSON.parse(opts.body);
    expect(body.event).toBe("invoice.created");
    expect(body.data.invoiceId).toBe(7);
    expect(body.timestamp).toBeDefined();

    const updateCalls = (db.updateWebhookDelivery as any).mock.calls;
    const lastUpdate = updateCalls[updateCalls.length - 1][1];
    expect(lastUpdate.success).toBe("true");
    expect(lastUpdate.responseStatus).toBe(200);
  });

  it("includes valid HMAC-SHA256 signature header", async () => {
    const ep = makeEndpoint();
    (db.getActiveWebhookEndpointsForUser as any).mockResolvedValueOnce([ep]);
    (global.fetch as any).mockResolvedValueOnce({ ok: true, status: 200, text: async () => "" });

    await dispatchWebhookEvent(42, "invoice.processed", { invoiceId: 3, nfseNumber: "NF-001" });

    const [, opts] = (global.fetch as any).mock.calls[0];
    const sentBody = opts.body as string;
    const sentSig = opts.headers["X-AutoNF-Signature"] as string;

    const expectedHmac = crypto
      .createHmac("sha256", ep.secret)
      .update(sentBody)
      .digest("hex");

    expect(sentSig).toBe(`sha256=${expectedHmac}`);
  });

  it("retries up to 3 times on failure then marks delivery as failed", async () => {
    vi.useFakeTimers();
    const ep = makeEndpoint();
    (db.getActiveWebhookEndpointsForUser as any).mockResolvedValueOnce([ep]);

    (global.fetch as any)
      .mockRejectedValueOnce(new Error("connection refused"))
      .mockRejectedValueOnce(new Error("connection refused"))
      .mockRejectedValueOnce(new Error("connection refused"));

    const dispatchPromise = dispatchWebhookEvent(42, "invoice.error", { invoiceId: 5 });

    // Advance timers for the exponential backoffs (2s + 4s)
    await vi.runAllTimersAsync();
    await dispatchPromise;

    vi.useRealTimers();

    expect(global.fetch).toHaveBeenCalledTimes(3);

    const updateCalls = (db.updateWebhookDelivery as any).mock.calls;
    const lastUpdate = updateCalls[updateCalls.length - 1][1];
    expect(lastUpdate.success).toBe("false");
    expect(lastUpdate.attempts).toBe(3);
  }, 15_000);

  it("succeeds on second attempt after first failure", async () => {
    vi.useFakeTimers();
    const ep = makeEndpoint();
    (db.getActiveWebhookEndpointsForUser as any).mockResolvedValueOnce([ep]);

    (global.fetch as any)
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => "" });

    const dispatchPromise = dispatchWebhookEvent(42, "invoice.cancelled", { invoiceId: 9 });
    await vi.runAllTimersAsync();
    await dispatchPromise;

    vi.useRealTimers();

    expect(global.fetch).toHaveBeenCalledTimes(2);
    const updateCalls = (db.updateWebhookDelivery as any).mock.calls;
    const lastUpdate = updateCalls[updateCalls.length - 1][1];
    expect(lastUpdate.success).toBe("true");
  }, 15_000);

  it("records non-2xx responses as failed but still retries", async () => {
    vi.useFakeTimers();
    const ep = makeEndpoint();
    (db.getActiveWebhookEndpointsForUser as any).mockResolvedValueOnce([ep]);

    (global.fetch as any)
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => "Internal Server Error" })
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => "Internal Server Error" })
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => "Internal Server Error" });

    const dispatchPromise = dispatchWebhookEvent(42, "invoice.created", { invoiceId: 11 });
    await vi.runAllTimersAsync();
    await dispatchPromise;

    vi.useRealTimers();

    expect(global.fetch).toHaveBeenCalledTimes(3);
    const updateCalls = (db.updateWebhookDelivery as any).mock.calls;
    const lastUpdate = updateCalls[updateCalls.length - 1][1];
    expect(lastUpdate.success).toBe("false");
    expect(lastUpdate.responseStatus).toBe(500);
  }, 15_000);

  it("dispatches to multiple endpoints independently", async () => {
    const ep1 = makeEndpoint({ id: 1, url: "https://ep1.com/hook" });
    const ep2 = makeEndpoint({ id: 2, url: "https://ep2.com/hook", events: JSON.stringify(["invoice.processed"]) });
    (db.getActiveWebhookEndpointsForUser as any).mockResolvedValueOnce([ep1, ep2]);
    (global.fetch as any).mockResolvedValue({ ok: true, status: 200, text: async () => "" });

    await dispatchWebhookEvent(42, "invoice.created", { invoiceId: 20 });

    // ep2 doesn't subscribe to invoice.created — only ep1 should be called
    expect(global.fetch).toHaveBeenCalledOnce();
    expect((global.fetch as any).mock.calls[0][0]).toBe(ep1.url);
  });

  it("does not throw if db.getActiveWebhookEndpointsForUser fails", async () => {
    (db.getActiveWebhookEndpointsForUser as any).mockRejectedValueOnce(new Error("DB down"));

    await expect(
      dispatchWebhookEvent(42, "invoice.created", { invoiceId: 1 })
    ).resolves.toBeUndefined();
  });
});
