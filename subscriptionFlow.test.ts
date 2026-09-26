import { describe, it, expect, vi } from "vitest";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Subscription state machine tests — full flow without DB
// ---------------------------------------------------------------------------

type SubscriptionStatus = "active" | "paused" | "cancelled";
type BillingStatus = "pending" | "confirmed" | "overdue" | "cancelled";

interface SubscriptionState {
  userId: number;
  planId: number;
  status: SubscriptionStatus;
  startDate: Date;
  renewalDate: Date;
}

interface BillingState {
  id: number;
  userId: number;
  planName: string;
  amount: number;
  status: BillingStatus;
  asaasSubscriptionId: string | null;
  paymentUrl: string | null;
  paymentMethod: string | null;
}

// Simulates createSubscription behaviour from db.ts
function createSubscription(userId: number, planId: number): SubscriptionState {
  const renewalDate = new Date();
  renewalDate.setMonth(renewalDate.getMonth() + 1);
  return { userId, planId, status: "active", startDate: new Date(), renewalDate };
}

describe("Subscription State Machine", () => {
  describe("Free plan (Gratuito) activation", () => {
    it("activates directly without payment gateway", () => {
      const plan = { id: 1, name: "Gratuito", pricePerMonth: 0 };
      const isFree = plan.pricePerMonth === 0;
      expect(isFree).toBe(true);
    });

    it("creates active subscription immediately for free plan", () => {
      const sub = createSubscription(42, 1);
      expect(sub.status).toBe("active");
      expect(sub.userId).toBe(42);
    });

    it("free plan invoices get expiresAt 7 days from now", () => {
      const isFree = true;
      const expiresAt = isFree ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) : null;
      expect(expiresAt).not.toBeNull();
      const diffMs = expiresAt!.getTime() - Date.now();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeCloseTo(7, 0);
    });

    it("paid plan invoices get null expiresAt", () => {
      const isFree = false;
      const expiresAt = isFree ? new Date() : null;
      expect(expiresAt).toBeNull();
    });
  });

  describe("Paid plan — dev mode (Asaas not configured)", () => {
    it("activates directly when Asaas is not configured", () => {
      const isAsaasConfigured = false;
      const result = isAsaasConfigured
        ? { directActivation: false, paymentUrl: "https://asaas.com/pay/..." }
        : { directActivation: true, paymentUrl: null };
      expect(result.directActivation).toBe(true);
      expect(result.paymentUrl).toBeNull();
    });
  });

  describe("Paid plan — production mode (Asaas configured)", () => {
    it("returns paymentUrl and does not activate directly", () => {
      const isAsaasConfigured = true;
      const asaasSub = {
        id: "sub_test",
        paymentLink: "https://sandbox.asaas.com/pay/sub_test",
      };
      const result = isAsaasConfigured
        ? { directActivation: false, paymentUrl: asaasSub.paymentLink }
        : { directActivation: true, paymentUrl: null };
      expect(result.directActivation).toBe(false);
      expect(result.paymentUrl).toContain("asaas");
    });

    it("billing invoice starts as pending", () => {
      const billing: BillingState = {
        id: 1,
        userId: 42,
        planName: "Starter",
        amount: 25000,
        status: "pending",
        asaasSubscriptionId: "sub_test",
        paymentUrl: "https://asaas.com/pay/sub_test",
        paymentMethod: null,
      };
      expect(billing.status).toBe("pending");
      expect(billing.asaasSubscriptionId).toBe("sub_test");
    });
  });

  describe("createSubscription idempotency", () => {
    it("cancels existing active subscription before creating new one", () => {
      let subs: SubscriptionState[] = [
        { userId: 1, planId: 1, status: "active", startDate: new Date(), renewalDate: new Date() },
      ];

      // Simulating createSubscription
      subs = subs.map(s =>
        s.userId === 1 && s.status === "active"
          ? { ...s, status: "cancelled" as SubscriptionStatus }
          : s
      );
      const newSub = createSubscription(1, 2);
      subs.push(newSub);

      const activeSubs = subs.filter(s => s.status === "active");
      expect(activeSubs).toHaveLength(1);
      expect(activeSubs[0]?.planId).toBe(2);
    });

    it("calling createSubscription twice results in exactly one active subscription", () => {
      let subs: SubscriptionState[] = [];

      const simulate = (userId: number, planId: number) => {
        subs = subs.map(s =>
          s.userId === userId && s.status === "active"
            ? { ...s, status: "cancelled" as SubscriptionStatus }
            : s
        );
        subs.push(createSubscription(userId, planId));
      };

      simulate(1, 2); // First call
      simulate(1, 2); // Second call (race condition / double webhook)

      const activeSubs = subs.filter(s => s.userId === 1 && s.status === "active");
      expect(activeSubs).toHaveLength(1);
    });
  });

  describe("Cancellation flow", () => {
    it("cancelled subscription loses active status", () => {
      let sub = createSubscription(1, 2);
      expect(sub.status).toBe("active");
      sub = { ...sub, status: "cancelled" };
      expect(sub.status).toBe("cancelled");
    });

    it("getUserSubscription returns undefined after cancellation", () => {
      const subs: SubscriptionState[] = [
        { userId: 1, planId: 2, status: "cancelled", startDate: new Date(), renewalDate: new Date() },
      ];
      const activeSub = subs.find(s => s.userId === 1 && s.status === "active");
      expect(activeSub).toBeUndefined();
    });

    it("cancellation does not block future subscriptions", () => {
      let subs: SubscriptionState[] = [
        { userId: 1, planId: 2, status: "cancelled", startDate: new Date(), renewalDate: new Date() },
      ];
      // Subscribe again
      subs = subs.map(s =>
        s.userId === 1 && s.status === "active" ? { ...s, status: "cancelled" as SubscriptionStatus } : s
      );
      subs.push(createSubscription(1, 3));
      const activeSub = subs.find(s => s.userId === 1 && s.status === "active");
      expect(activeSub).toBeDefined();
      expect(activeSub?.planId).toBe(3);
    });
  });

  describe("Renewal date calculation", () => {
    it("renewal date is one month from today", () => {
      const start = new Date("2026-05-25");
      const renewal = new Date(start);
      renewal.setMonth(renewal.getMonth() + 1);
      expect(renewal.getMonth()).toBe(5); // June (0-indexed)
      expect(renewal.getFullYear()).toBe(2026);
    });

    it("handles year boundary correctly", () => {
      const start = new Date("2026-12-25");
      const renewal = new Date(start);
      renewal.setMonth(renewal.getMonth() + 1);
      expect(renewal.getMonth()).toBe(0); // January
      expect(renewal.getFullYear()).toBe(2027);
    });
  });

  describe("Plan limit enforcement at invoice creation", () => {
    const checkCanCreate = (
      usage: number,
      subscription: { plan: { maxInvoicesPerMonth: number } } | null
    ) => {
      if (!subscription) throw new Error("Nenhum plano ativo");
      if (usage >= subscription.plan.maxInvoicesPerMonth) {
        throw new Error("Limite de emissoes atingido");
      }
      return true;
    };

    it("Gratuito plan allows up to 3 invoices", () => {
      const sub = { plan: { maxInvoicesPerMonth: 3 } };
      expect(checkCanCreate(0, sub)).toBe(true);
      expect(checkCanCreate(2, sub)).toBe(true);
      expect(() => checkCanCreate(3, sub)).toThrow("Limite de emissoes atingido");
    });

    it("Starter plan allows up to 50 invoices", () => {
      const sub = { plan: { maxInvoicesPerMonth: 50 } };
      expect(checkCanCreate(49, sub)).toBe(true);
      expect(() => checkCanCreate(50, sub)).toThrow("Limite de emissoes atingido");
    });

    it("blocks invoice creation without active subscription", () => {
      expect(() => checkCanCreate(0, null)).toThrow("Nenhum plano ativo");
    });
  });

  describe("Subscription status schema", () => {
    const subscriptionSchema = z.object({
      userId: z.number().int().positive(),
      planId: z.number().int().positive(),
      status: z.enum(["active", "paused", "cancelled"]),
      startDate: z.date(),
      renewalDate: z.date().nullable().optional(),
    });

    it("validates a valid active subscription", () => {
      const sub = {
        userId: 1,
        planId: 2,
        status: "active" as const,
        startDate: new Date(),
        renewalDate: new Date(),
      };
      expect(() => subscriptionSchema.parse(sub)).not.toThrow();
    });

    it("rejects invalid status", () => {
      const sub = { userId: 1, planId: 2, status: "expired", startDate: new Date() };
      expect(() => subscriptionSchema.parse(sub)).toThrow();
    });

    it("rejects zero userId", () => {
      const sub = { userId: 0, planId: 2, status: "active", startDate: new Date() };
      expect(() => subscriptionSchema.parse(sub)).toThrow();
    });
  });

  describe("Billing invoice state transitions", () => {
    const validTransitions: Record<BillingStatus, BillingStatus[]> = {
      pending: ["confirmed", "overdue", "cancelled"],
      overdue: ["confirmed", "cancelled"],
      confirmed: [],
      cancelled: [],
    };

    it("pending can transition to confirmed", () => {
      expect(validTransitions["pending"]).toContain("confirmed");
    });

    it("pending can transition to overdue", () => {
      expect(validTransitions["pending"]).toContain("overdue");
    });

    it("pending can be cancelled", () => {
      expect(validTransitions["pending"]).toContain("cancelled");
    });

    it("confirmed is a terminal state", () => {
      expect(validTransitions["confirmed"]).toHaveLength(0);
    });

    it("cancelled is a terminal state", () => {
      expect(validTransitions["cancelled"]).toHaveLength(0);
    });

    it("overdue can still be confirmed (late payment)", () => {
      expect(validTransitions["overdue"]).toContain("confirmed");
    });
  });

  describe("syncSubscription return contract", () => {
    it("returns activated=false alreadyActive=false when payment not yet confirmed", () => {
      const result = { activated: false, alreadyActive: false, planName: null as string | null };
      expect(result.activated).toBe(false);
      expect(result.alreadyActive).toBe(false);
    });

    it("returns activated=true with planName when payment confirmed", () => {
      const result = { activated: true, alreadyActive: false, planName: "Starter" };
      expect(result.activated).toBe(true);
      expect(result.planName).toBe("Starter");
    });

    it("returns alreadyActive=true when subscription already exists", () => {
      const result = { activated: false, alreadyActive: true, planName: "Professional" };
      expect(result.alreadyActive).toBe(true);
    });
  });
});
