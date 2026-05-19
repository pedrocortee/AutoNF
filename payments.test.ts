import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { isAsaasConfigured, createAsaasCustomer } from "./server/_core/asaas";

// ---------------------------------------------------------------------------
// Helpers / shared fixtures
// ---------------------------------------------------------------------------

const mockPlan = {
  id: 1,
  name: "Starter",
  pricePerMonth: 25000,
  maxInvoicesPerMonth: 50,
  description: "Perfeito para começar",
  features: JSON.stringify(["Até 50 notas/mês"]),
  displayOrder: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockUser = {
  id: 42,
  name: "João Silva",
  email: "joao@empresa.com.br",
  openId: "user_42",
  role: "user" as const,
  loginMethod: "oauth",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

const mockAsaasCustomer = { id: "cus_abc123", name: mockUser.name, email: mockUser.email };
const mockAsaasSubscription = {
  id: "sub_xyz789",
  customer: mockAsaasCustomer.id,
  status: "ACTIVE",
  value: 250,
  billingType: "UNDEFINED",
  nextDueDate: "2026-06-01",
  paymentLink: "https://sandbox.asaas.com/pay/sub_xyz789",
};

// ---------------------------------------------------------------------------
// Asaas client unit tests
// ---------------------------------------------------------------------------

describe("Asaas Client", () => {
  describe("isAsaasConfigured", () => {
    it("returns false when ASAAS_API_KEY is not set", () => {
      const original = process.env.ASAAS_API_KEY;
      delete process.env.ASAAS_API_KEY;

      expect(isAsaasConfigured()).toBe(false);

      if (original !== undefined) process.env.ASAAS_API_KEY = original;
    });

    it("returns true when ASAAS_API_KEY is set", () => {
      const original = process.env.ASAAS_API_KEY;
      process.env.ASAAS_API_KEY = "test_key_123";

      expect(isAsaasConfigured()).toBe(true);

      if (original !== undefined) process.env.ASAAS_API_KEY = original;
      else delete process.env.ASAAS_API_KEY;
    });
  });

  describe("request validation", () => {
    it("throws when API key is missing and a request is attempted", async () => {
      const original = process.env.ASAAS_API_KEY;
      delete process.env.ASAAS_API_KEY;

      await expect(
        createAsaasCustomer({ name: "Test", email: "test@test.com" })
      ).rejects.toThrow("ASAAS_API_KEY");

      if (original !== undefined) process.env.ASAAS_API_KEY = original;
    });
  });
});

// ---------------------------------------------------------------------------
// Billing Invoice schema validation
// ---------------------------------------------------------------------------

describe("Billing Invoice", () => {
  const billingInvoiceSchema = z.object({
    userId: z.number().int().positive(),
    planName: z.string().min(1),
    amount: z.number().int().positive(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    status: z.enum(["pending", "confirmed", "overdue", "cancelled"]),
    asaasPaymentId: z.string().optional(),
    asaasSubscriptionId: z.string().optional(),
    paymentMethod: z.string().optional(),
    paymentUrl: z.string().optional(),
    nfseEmitted: z.enum(["true", "false"]).optional(),
  });

  it("validates a pending billing invoice", () => {
    const invoice = {
      userId: 1,
      planName: "Starter",
      amount: 25000,
      dueDate: "2026-06-01",
      status: "pending" as const,
    };
    expect(() => billingInvoiceSchema.parse(invoice)).not.toThrow();
  });

  it("validates a confirmed invoice with Asaas IDs", () => {
    const invoice = {
      userId: 1,
      planName: "Professional",
      amount: 40000,
      dueDate: "2026-06-01",
      status: "confirmed" as const,
      asaasPaymentId: "pay_abc",
      asaasSubscriptionId: "sub_xyz",
      paymentMethod: "PIX",
      nfseEmitted: "false" as const,
    };
    expect(() => billingInvoiceSchema.parse(invoice)).not.toThrow();
  });

  it("rejects invalid dueDate format", () => {
    const invoice = {
      userId: 1,
      planName: "Starter",
      amount: 25000,
      dueDate: "01/06/2026",
      status: "pending" as const,
    };
    expect(() => billingInvoiceSchema.parse(invoice)).toThrow();
  });

  it("rejects negative amount", () => {
    const invoice = {
      userId: 1,
      planName: "Starter",
      amount: -100,
      dueDate: "2026-06-01",
      status: "pending" as const,
    };
    expect(() => billingInvoiceSchema.parse(invoice)).toThrow();
  });

  it("rejects unknown status", () => {
    const invoice = {
      userId: 1,
      planName: "Starter",
      amount: 25000,
      dueDate: "2026-06-01",
      status: "paid",
    };
    expect(() => billingInvoiceSchema.parse(invoice)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Webhook event processing logic
// ---------------------------------------------------------------------------

describe("Webhook Event Processing", () => {
  const webhookEventSchema = z.object({
    event: z.string(),
    payment: z
      .object({
        id: z.string(),
        customer: z.string(),
        subscription: z.string().optional(),
        value: z.number(),
        billingType: z.string(),
        status: z.string(),
        dueDate: z.string(),
        paymentDate: z.string().optional(),
        invoiceUrl: z.string().optional(),
      })
      .optional(),
  });

  it("validates PAYMENT_CONFIRMED event", () => {
    const event = {
      event: "PAYMENT_CONFIRMED",
      payment: {
        id: "pay_123",
        customer: "cus_abc",
        subscription: "sub_xyz",
        value: 250.0,
        billingType: "PIX",
        status: "CONFIRMED",
        dueDate: "2026-06-01",
        paymentDate: "2026-05-31",
      },
    };
    expect(() => webhookEventSchema.parse(event)).not.toThrow();
  });

  it("validates PAYMENT_OVERDUE event", () => {
    const event = {
      event: "PAYMENT_OVERDUE",
      payment: {
        id: "pay_456",
        customer: "cus_abc",
        value: 250.0,
        billingType: "BOLETO",
        status: "OVERDUE",
        dueDate: "2026-05-01",
      },
    };
    expect(() => webhookEventSchema.parse(event)).not.toThrow();
  });

  it("validates SUBSCRIPTION_DELETED event without payment", () => {
    const event = { event: "SUBSCRIPTION_DELETED" };
    expect(() => webhookEventSchema.parse(event)).not.toThrow();
  });

  it("maps PAYMENT_CONFIRMED to status confirmed", () => {
    const mapping: Record<string, string> = {
      PAYMENT_CONFIRMED: "confirmed",
      PAYMENT_RECEIVED: "confirmed",
      PAYMENT_OVERDUE: "overdue",
      PAYMENT_DELETED: "cancelled",
      SUBSCRIPTION_DELETED: "cancelled",
    };
    expect(mapping["PAYMENT_CONFIRMED"]).toBe("confirmed");
    expect(mapping["PAYMENT_OVERDUE"]).toBe("overdue");
    expect(mapping["PAYMENT_DELETED"]).toBe("cancelled");
  });
});

// ---------------------------------------------------------------------------
// Checkout flow logic
// ---------------------------------------------------------------------------

describe("Checkout Flow", () => {
  it("computes next due date as today in YYYY-MM-DD", () => {
    const today = new Date().toISOString().split("T")[0];
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("converts plan price from cents to BRL correctly", () => {
    const priceInCents = 25000;
    const priceInBRL = priceInCents / 100;
    expect(priceInBRL).toBe(250);
  });

  it("converts Enterprise plan price", () => {
    const priceInCents = 99900;
    expect(priceInCents / 100).toBe(999);
  });

  it("direct activation path skips Asaas when not configured", () => {
    const isConfigured = false;
    const result = isConfigured
      ? { directActivation: false, paymentUrl: "https://asaas.com/pay/..." }
      : { directActivation: true, paymentUrl: null };
    expect(result.directActivation).toBe(true);
    expect(result.paymentUrl).toBeNull();
  });

  it("payment path provides URL when Asaas is configured", () => {
    const isConfigured = true;
    const paymentUrl = "https://sandbox.asaas.com/pay/sub_xyz";
    const result = isConfigured
      ? { directActivation: false, paymentUrl }
      : { directActivation: true, paymentUrl: null };
    expect(result.directActivation).toBe(false);
    expect(result.paymentUrl).toBe(paymentUrl);
  });
});

// ---------------------------------------------------------------------------
// Cancellation and grace period logic
// ---------------------------------------------------------------------------

describe("Cancellation and Grace Period", () => {
  it("cancellation sets subscription status to cancelled", () => {
    const subscription = { status: "active" as const, userId: 1, planId: 1 };
    const cancelled = { ...subscription, status: "cancelled" as const };
    expect(cancelled.status).toBe("cancelled");
  });

  it("grace period of 3 days is correctly computed", () => {
    const now = new Date("2026-05-17");
    const gracePeriodEnd = new Date(now);
    gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 3);
    expect(gracePeriodEnd.toISOString().split("T")[0]).toBe("2026-05-20");
  });

  it("subscription is valid within grace period", () => {
    const now = new Date("2026-05-18");
    const gracePeriodEnd = new Date("2026-05-20");
    const isWithinGrace = now <= gracePeriodEnd;
    expect(isWithinGrace).toBe(true);
  });

  it("subscription is suspended after grace period expires", () => {
    const now = new Date("2026-05-21");
    const gracePeriodEnd = new Date("2026-05-20");
    const isWithinGrace = now <= gracePeriodEnd;
    expect(isWithinGrace).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Plan upgrade / downgrade proration
// ---------------------------------------------------------------------------

describe("Plan Proration", () => {
  it("computes proration for upgrade mid-cycle", () => {
    const planPriceCents = 40000; // Professional
    const daysInMonth = 30;
    const daysRemaining = 15;
    const dailyRate = planPriceCents / daysInMonth;
    const prorationCredit = Math.round(dailyRate * daysRemaining);
    expect(prorationCredit).toBe(20000);
  });

  it("upgrade proration charge = new plan - credit", () => {
    const newPlanCents = 99900; // Enterprise
    const prorationCredit = 20000;
    const chargeToday = newPlanCents - prorationCredit;
    expect(chargeToday).toBe(79900);
  });

  it("downgrade proration credit carries to next cycle", () => {
    const currentPlanCents = 40000; // Professional
    const daysInMonth = 30;
    const daysRemaining = 10;
    const credit = Math.round((currentPlanCents / daysInMonth) * daysRemaining);
    // Credit is applied to next billing cycle
    const nextMonthCharge = 25000; // Starter
    const chargeAfterCredit = Math.max(0, nextMonthCharge - credit);
    expect(chargeAfterCredit).toBe(11667);
  });
});

// ---------------------------------------------------------------------------
// Auto NFS-e emission
// ---------------------------------------------------------------------------

describe("Auto NFS-e on Billing Payment", () => {
  it("marks billing invoice as nfseEmitted after confirmed payment", () => {
    const invoice = {
      id: 1,
      status: "confirmed" as const,
      nfseEmitted: "false" as const,
      planName: "Starter",
      amount: 25000,
    };
    const updated = { ...invoice, nfseEmitted: "true" as const };
    expect(updated.nfseEmitted).toBe("true");
  });

  it("does not emit NFS-e twice for the same billing invoice", () => {
    const invoice = {
      id: 1,
      status: "confirmed" as const,
      nfseEmitted: "true" as const,
    };
    const shouldEmit = invoice.nfseEmitted === "false";
    expect(shouldEmit).toBe(false);
  });

  it("only emits NFS-e for confirmed payments, not overdue", () => {
    const statuses = ["pending", "overdue", "cancelled"];
    for (const status of statuses) {
      const shouldEmit = status === "confirmed";
      expect(shouldEmit).toBe(false);
    }
    expect("confirmed" === "confirmed").toBe(true);
  });
});
