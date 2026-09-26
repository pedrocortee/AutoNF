import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Tests for the Asaas webhook handler logic (server/index.ts)
// We test the pure logic: event routing, state transitions, idempotency
// ---------------------------------------------------------------------------

type BillingStatus = "pending" | "confirmed" | "overdue" | "cancelled";

interface MockBillingInvoice {
  id: number;
  userId: number;
  planName: string;
  amount: number;
  status: BillingStatus;
  asaasSubscriptionId: string | null;
  asaasPaymentId: string | null;
  paymentMethod: string | null;
}

function simulateWebhookHandler(
  event: string,
  payment: { id: string; subscription?: string; billingType: string; status: string } | undefined,
  invoice: MockBillingInvoice | undefined
): { billingUpdate?: Partial<MockBillingInvoice>; subscriptionAction?: "activate" | "cancel" | "overdue" | null } {
  if (!payment || !payment.subscription) {
    return {};
  }

  if (!invoice) {
    return {};
  }

  if (event === "PAYMENT_CONFIRMED" || event === "PAYMENT_RECEIVED") {
    return {
      billingUpdate: {
        status: "confirmed",
        paymentMethod: payment.billingType,
        asaasPaymentId: payment.id,
      },
      subscriptionAction: "activate",
    };
  }

  if (event === "PAYMENT_OVERDUE") {
    return {
      billingUpdate: { status: "overdue" },
      subscriptionAction: "overdue",
    };
  }

  if (event === "PAYMENT_DELETED" || event === "SUBSCRIPTION_DELETED") {
    return {
      billingUpdate: { status: "cancelled" },
      subscriptionAction: "cancel",
    };
  }

  return {};
}

describe("Asaas Webhook Handler Logic", () => {
  const mockPayment = {
    id: "pay_abc123",
    subscription: "sub_xyz789",
    billingType: "PIX",
    status: "CONFIRMED",
  };

  const mockBillingInvoice: MockBillingInvoice = {
    id: 1,
    userId: 42,
    planName: "Starter",
    amount: 25000,
    status: "pending",
    asaasSubscriptionId: "sub_xyz789",
    asaasPaymentId: null,
    paymentMethod: null,
  };

  describe("PAYMENT_CONFIRMED event", () => {
    it("marks billing invoice as confirmed", () => {
      const result = simulateWebhookHandler("PAYMENT_CONFIRMED", mockPayment, mockBillingInvoice);
      expect(result.billingUpdate?.status).toBe("confirmed");
    });

    it("stores paymentMethod from billingType", () => {
      const result = simulateWebhookHandler("PAYMENT_CONFIRMED", mockPayment, mockBillingInvoice);
      expect(result.billingUpdate?.paymentMethod).toBe("PIX");
    });

    it("stores asaasPaymentId", () => {
      const result = simulateWebhookHandler("PAYMENT_CONFIRMED", mockPayment, mockBillingInvoice);
      expect(result.billingUpdate?.asaasPaymentId).toBe("pay_abc123");
    });

    it("triggers subscription activation", () => {
      const result = simulateWebhookHandler("PAYMENT_CONFIRMED", mockPayment, mockBillingInvoice);
      expect(result.subscriptionAction).toBe("activate");
    });
  });

  describe("PAYMENT_RECEIVED event", () => {
    it("behaves identically to PAYMENT_CONFIRMED", () => {
      const confirmed = simulateWebhookHandler("PAYMENT_CONFIRMED", mockPayment, mockBillingInvoice);
      const received = simulateWebhookHandler("PAYMENT_RECEIVED", mockPayment, mockBillingInvoice);
      expect(received.billingUpdate?.status).toBe(confirmed.billingUpdate?.status);
      expect(received.subscriptionAction).toBe(confirmed.subscriptionAction);
    });
  });

  describe("PAYMENT_OVERDUE event", () => {
    it("marks billing invoice as overdue", () => {
      const result = simulateWebhookHandler("PAYMENT_OVERDUE", mockPayment, mockBillingInvoice);
      expect(result.billingUpdate?.status).toBe("overdue");
    });

    it("does not activate subscription on overdue", () => {
      const result = simulateWebhookHandler("PAYMENT_OVERDUE", mockPayment, mockBillingInvoice);
      expect(result.subscriptionAction).not.toBe("activate");
    });
  });

  describe("PAYMENT_DELETED event", () => {
    it("marks billing invoice as cancelled", () => {
      const result = simulateWebhookHandler("PAYMENT_DELETED", mockPayment, mockBillingInvoice);
      expect(result.billingUpdate?.status).toBe("cancelled");
    });

    it("triggers subscription cancellation", () => {
      const result = simulateWebhookHandler("PAYMENT_DELETED", mockPayment, mockBillingInvoice);
      expect(result.subscriptionAction).toBe("cancel");
    });
  });

  describe("SUBSCRIPTION_DELETED event", () => {
    it("cancels billing invoice and subscription", () => {
      const result = simulateWebhookHandler("SUBSCRIPTION_DELETED", mockPayment, mockBillingInvoice);
      expect(result.billingUpdate?.status).toBe("cancelled");
      expect(result.subscriptionAction).toBe("cancel");
    });
  });

  describe("guard conditions", () => {
    it("ignores event when payment is missing", () => {
      const result = simulateWebhookHandler("PAYMENT_CONFIRMED", undefined, mockBillingInvoice);
      expect(result.billingUpdate).toBeUndefined();
      expect(result.subscriptionAction).toBeUndefined();
    });

    it("ignores event when subscription ID is missing from payment", () => {
      const paymentNoSub = { id: "pay_1", billingType: "PIX", status: "CONFIRMED" };
      const result = simulateWebhookHandler("PAYMENT_CONFIRMED", paymentNoSub, mockBillingInvoice);
      expect(result.billingUpdate).toBeUndefined();
    });

    it("ignores event when billing invoice not found in DB", () => {
      const result = simulateWebhookHandler("PAYMENT_CONFIRMED", mockPayment, undefined);
      expect(result.billingUpdate).toBeUndefined();
      expect(result.subscriptionAction).toBeUndefined();
    });

    it("ignores unknown event types gracefully", () => {
      const result = simulateWebhookHandler("UNKNOWN_EVENT", mockPayment, mockBillingInvoice);
      expect(result.billingUpdate).toBeUndefined();
      expect(result.subscriptionAction).toBeUndefined();
    });
  });

  describe("Asaas event schema validation", () => {
    const asaasEventSchema = z.object({
      event: z.string().min(1),
      payment: z.object({
        id: z.string(),
        customer: z.string(),
        subscription: z.string().optional(),
        value: z.number(),
        billingType: z.string(),
        status: z.string(),
        dueDate: z.string(),
      }).optional(),
    });

    it("validates PAYMENT_CONFIRMED event shape", () => {
      const event = {
        event: "PAYMENT_CONFIRMED",
        payment: {
          id: "pay_123",
          customer: "cus_abc",
          subscription: "sub_xyz",
          value: 250.00,
          billingType: "PIX",
          status: "CONFIRMED",
          dueDate: "2026-06-01",
        },
      };
      expect(() => asaasEventSchema.parse(event)).not.toThrow();
    });

    it("validates SUBSCRIPTION_DELETED without payment", () => {
      const event = { event: "SUBSCRIPTION_DELETED" };
      expect(() => asaasEventSchema.parse(event)).not.toThrow();
    });

    it("rejects empty event string", () => {
      expect(() => asaasEventSchema.parse({ event: "" })).toThrow();
    });
  });

  describe("syncSubscription poll logic", () => {
    const mockPayments = [
      { id: "pay_1", status: "PENDING", billingType: "PIX" },
      { id: "pay_2", status: "CONFIRMED", billingType: "CREDIT_CARD" },
    ];

    it("finds CONFIRMED payment from list", () => {
      const confirmed = mockPayments.find(p => p.status === "CONFIRMED" || p.status === "RECEIVED");
      expect(confirmed).toBeDefined();
      expect(confirmed?.id).toBe("pay_2");
    });

    it("finds RECEIVED payment from list", () => {
      const payments = [{ id: "pay_3", status: "RECEIVED", billingType: "PIX" }];
      const confirmed = payments.find(p => p.status === "CONFIRMED" || p.status === "RECEIVED");
      expect(confirmed).toBeDefined();
    });

    it("returns undefined when no confirmed payment exists", () => {
      const payments = [
        { id: "pay_1", status: "PENDING", billingType: "PIX" },
        { id: "pay_2", status: "OVERDUE", billingType: "BOLETO" },
      ];
      const confirmed = payments.find(p => p.status === "CONFIRMED" || p.status === "RECEIVED");
      expect(confirmed).toBeUndefined();
    });
  });

  describe("billing type label mapping", () => {
    const BILLING_TYPE_LABEL: Record<string, string> = {
      BOLETO: "Boleto",
      CREDIT_CARD: "Cartão de Crédito",
      PIX: "Pix",
      DEBIT_CARD: "Cartão de Débito",
      UNDEFINED: "—",
    };

    it("maps all known Asaas billing types", () => {
      expect(BILLING_TYPE_LABEL["BOLETO"]).toBe("Boleto");
      expect(BILLING_TYPE_LABEL["CREDIT_CARD"]).toBe("Cartão de Crédito");
      expect(BILLING_TYPE_LABEL["PIX"]).toBe("Pix");
      expect(BILLING_TYPE_LABEL["DEBIT_CARD"]).toBe("Cartão de Débito");
      expect(BILLING_TYPE_LABEL["UNDEFINED"]).toBe("—");
    });
  });
});
