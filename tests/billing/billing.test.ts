import { beforeEach, describe, expect, it } from "vitest";
import { BillingError, cancelPlan, checkout, handleAsaasEvent, syncPendingPayment, type BillingDeps } from "../../server/_core/billing";
import { computeAllowance } from "../../server/_core/inbound/quota";
import type { BillingInvoice, Plan } from "../../drizzle/schema";
import type { CurrentSubscription } from "../../server/billingDb";

const PLANS: Plan[] = [
  { id: 1, name: "Gratuito", pricePerMonth: 0, maxInvoicesPerMonth: 3, maxInboundDocsPerMonth: 10 },
  { id: 2, name: "Starter", pricePerMonth: 25000, maxInvoicesPerMonth: 50, maxInboundDocsPerMonth: 200 },
  { id: 3, name: "Professional", pricePerMonth: 40000, maxInvoicesPerMonth: 200, maxInboundDocsPerMonth: 800 },
].map((p) => ({ description: null, features: null, displayOrder: 0, createdAt: new Date(), updatedAt: new Date(), ...p }));

/** In-memory database + Asaas, enough to run the billing rules end to end. */
function fakeWorld(opts: { asaas?: boolean; production?: boolean } = {}) {
  let subSeq = 0;
  let invSeq = 0;
  let asaasSeq = 0;
  const subs: (CurrentSubscription & { status: "active" | "paused" | "cancelled" })[] = [];
  const invoices: BillingInvoice[] = [];
  const asaas = new Map<string, { status: "ACTIVE" | "DELETED"; payments: { id: string; status: string; invoiceUrl: string; value: number }[] }>();
  const cancelledInAsaas: string[] = [];

  const deps: BillingDeps = {
    getPlanByName: async (n) => PLANS.find((p) => p.name === n),
    getCurrent: async (userId) =>
      [...subs].reverse().find((s) => s.userId === userId && (s.status === "active" || s.status === "paused")),
    start: async (userId, planId, asaasSubscriptionId) => {
      for (const s of subs) if (s.userId === userId && s.status !== "cancelled") s.status = "cancelled";
      const renewalDate = new Date();
      renewalDate.setMonth(renewalDate.getMonth() + 1);
      subs.push({
        id: ++subSeq, userId, planId, status: "active", startDate: new Date(), renewalDate, cancellationDate: null,
        asaasSubscriptionId, createdAt: new Date(), updatedAt: new Date(), plan: PLANS.find((p) => p.id === planId)!,
      });
    },
    renew: async (sub) => {
      const s = subs.find((x) => x.id === sub.id)!;
      s.status = "active";
      s.renewalDate = new Date(s.renewalDate!.getTime() + 30 * 86400000);
    },
    setStatus: async (id, status) => {
      subs.find((s) => s.id === id)!.status = status;
    },
    invoicesFor: async (id) => invoices.filter((i) => i.asaasSubscriptionId === id).sort((a, b) => b.id - a.id),
    insertInvoice: async (d) => {
      invoices.push({
        id: ++invSeq, subscriptionId: null, asaasPaymentId: null, asaasSubscriptionId: null, paymentMethod: null, paymentUrl: null,
        status: "pending", nfseEmitted: "false", createdAt: new Date(), updatedAt: new Date(), ...d,
      } as BillingInvoice);
    },
    patchInvoice: async (id, patch) => {
      Object.assign(invoices.find((i) => i.id === id)!, patch);
    },
    cancelPendingInvoicesOf: async (id) => {
      for (const i of invoices) if (i.asaasSubscriptionId === id && (i.status === "pending" || i.status === "overdue")) i.status = "cancelled";
    },
    liveAsaasSubscriptions: async (userId, except) => {
      const seen = new Map<string, { asaasSubscriptionId: string; planName: string; status: BillingInvoice["status"] }>();
      for (const i of [...invoices].sort((a, b) => b.id - a.id)) {
        if (i.userId !== userId || !i.asaasSubscriptionId || i.status === "cancelled" || i.asaasSubscriptionId === except) continue;
        if (!seen.has(i.asaasSubscriptionId)) seen.set(i.asaasSubscriptionId, { asaasSubscriptionId: i.asaasSubscriptionId, planName: i.planName, status: i.status });
      }
      return [...seen.values()];
    },
    pendingCheckout: async (userId, planName) =>
      [...invoices].reverse().find((i) => i.userId === userId && i.planName === planName && i.status === "pending" && i.asaasSubscriptionId),
    asaasConfigured: () => opts.asaas ?? true,
    ensureCustomer: async (userId) => `cus_${userId}`,
    createAsaasSubscription: async (_c, plan) => {
      const id = `sub_${++asaasSeq}`;
      asaas.set(id, { status: "ACTIVE", payments: [{ id: `pay_${asaasSeq}_1`, status: "PENDING", invoiceUrl: `https://asaas/i/${id}`, value: plan.pricePerMonth / 100 }] });
      return { id };
    },
    asaasSubscriptionStatus: async (id) => asaas.get(id)?.status ?? null,
    firstPaymentUrl: async (id) => asaas.get(id)?.payments.find((p) => p.status !== "CONFIRMED")?.invoiceUrl ?? null,
    confirmedPayment: async (id) => {
      const p = asaas.get(id)?.payments.find((x) => x.status === "CONFIRMED");
      return p ? { id: p.id, subscription: id, value: p.value, billingType: "CREDIT_CARD" } : null;
    },
    cancelAsaas: async (id) => {
      cancelledInAsaas.push(id);
      const s = asaas.get(id);
      if (s) s.status = "DELETED";
    },
    isProduction: () => opts.production ?? true,
    today: () => "2026-09-26",
  };

  const pay = (subId: string, n = 1) => {
    const p = asaas.get(subId)!.payments[n - 1];
    p.status = "CONFIRMED";
    return { id: p.id, subscription: subId, value: p.value, billingType: "CREDIT_CARD", dueDate: "2026-09-26" };
  };
  const addRenewal = (subId: string) => {
    const s = asaas.get(subId)!;
    const p = { id: `${subId}_r${s.payments.length + 1}`, status: "PENDING", invoiceUrl: `https://asaas/i/${subId}/r`, value: s.payments[0].value };
    s.payments.push(p);
    return { id: p.id, subscription: subId, value: p.value, billingType: "CREDIT_CARD", dueDate: "2026-10-26", invoiceUrl: p.invoiceUrl };
  };
  const current = (userId = 7) => deps.getCurrent(userId);
  return { deps, subs, invoices, asaas, cancelledInAsaas, pay, addRenewal, current };
}

describe("checkout", () => {
  it("activates the free plan directly", async () => {
    const w = fakeWorld();
    expect(await checkout(w.deps, 7, "Gratuito")).toEqual({ directActivation: true, paymentUrl: null });
    expect((await w.current())?.plan.name).toBe("Gratuito");
  });

  it("does not activate a paid plan before payment and returns the Asaas checkout link", async () => {
    const w = fakeWorld();
    await checkout(w.deps, 7, "Gratuito");
    const r = await checkout(w.deps, 7, "Starter");
    expect(r).toEqual({ directActivation: false, paymentUrl: "https://asaas/i/sub_1" });
    expect((await w.current())?.plan.name).toBe("Gratuito");
    expect(w.invoices[0]).toMatchObject({ planName: "Starter", status: "pending", paymentUrl: "https://asaas/i/sub_1" });
  });

  it("reuses the open checkout of the same plan instead of creating another Asaas subscription", async () => {
    const w = fakeWorld();
    await checkout(w.deps, 7, "Starter");
    const again = await checkout(w.deps, 7, "Starter");
    expect(again.paymentUrl).toBe("https://asaas/i/sub_1");
    expect(w.asaas.size).toBe(1);
  });

  it("cancels an abandoned checkout of another plan when starting a new one", async () => {
    const w = fakeWorld();
    await checkout(w.deps, 7, "Starter");
    await checkout(w.deps, 7, "Professional");
    expect(w.cancelledInAsaas).toEqual(["sub_1"]);
    expect(w.invoices.find((i) => i.asaasSubscriptionId === "sub_1")?.status).toBe("cancelled");
  });

  it("refuses the plan the user already has", async () => {
    const w = fakeWorld();
    await checkout(w.deps, 7, "Gratuito");
    await expect(checkout(w.deps, 7, "Gratuito")).rejects.toThrow(BillingError);
  });

  it("never activates a paid plan without Asaas in production", async () => {
    const w = fakeWorld({ asaas: false, production: true });
    await expect(checkout(w.deps, 7, "Professional")).rejects.toThrow(/indisponíveis/);
    expect(await w.current()).toBeUndefined();
    const dev = fakeWorld({ asaas: false, production: false });
    expect((await checkout(dev.deps, 7, "Professional")).directActivation).toBe(true);
  });

  it("switching to the free plan cancels the paid Asaas subscription", async () => {
    const w = fakeWorld();
    await checkout(w.deps, 7, "Starter");
    await handleAsaasEvent(w.deps, "PAYMENT_CONFIRMED", w.pay("sub_1"));
    await checkout(w.deps, 7, "Gratuito");
    expect(w.cancelledInAsaas).toContain("sub_1");
    expect((await w.current())?.plan.name).toBe("Gratuito");
  });
});

describe("Asaas notifications", () => {
  it("confirmed payment activates the plan and records the payment", async () => {
    const w = fakeWorld();
    await checkout(w.deps, 7, "Starter");
    expect(await handleAsaasEvent(w.deps, "PAYMENT_CONFIRMED", w.pay("sub_1"))).toBe("activated");
    const cur = await w.current();
    expect(cur).toMatchObject({ status: "active", asaasSubscriptionId: "sub_1" });
    expect(cur?.plan.name).toBe("Starter");
    expect(w.invoices[0]).toMatchObject({ status: "confirmed", asaasPaymentId: "pay_1_1", paymentMethod: "CREDIT_CARD" });
  });

  it("is idempotent when Asaas repeats the notification (CONFIRMED then RECEIVED)", async () => {
    const w = fakeWorld();
    await checkout(w.deps, 7, "Starter");
    const p = w.pay("sub_1");
    await handleAsaasEvent(w.deps, "PAYMENT_CONFIRMED", p);
    expect(await handleAsaasEvent(w.deps, "PAYMENT_RECEIVED", p)).toBe("duplicate");
    expect(w.subs.filter((s) => s.status === "active")).toHaveLength(1);
    expect(w.invoices).toHaveLength(1);
  });

  it("upgrade: paying the new plan cancels the old Asaas subscription, and its deletion keeps the new plan", async () => {
    const w = fakeWorld();
    await checkout(w.deps, 7, "Starter");
    await handleAsaasEvent(w.deps, "PAYMENT_CONFIRMED", w.pay("sub_1"));
    await checkout(w.deps, 7, "Professional");
    expect(w.cancelledInAsaas).toEqual([]); // paid plan keeps running until the new one is paid
    await handleAsaasEvent(w.deps, "PAYMENT_CONFIRMED", w.pay("sub_2"));
    expect(w.cancelledInAsaas).toEqual(["sub_1"]);
    // Asaas then notifies the deletion of the old subscription
    expect(await handleAsaasEvent(w.deps, "SUBSCRIPTION_DELETED", undefined, { id: "sub_1" })).toBe("invoice-cancelled");
    expect((await w.current())?.plan.name).toBe("Professional");
  });

  it("overdue renewal pauses access; paying it brings the plan back with a history entry", async () => {
    const w = fakeWorld();
    await checkout(w.deps, 7, "Starter");
    await handleAsaasEvent(w.deps, "PAYMENT_CONFIRMED", w.pay("sub_1"));
    const renewal = w.addRenewal("sub_1");
    expect(await handleAsaasEvent(w.deps, "PAYMENT_OVERDUE", renewal)).toBe("paused");
    expect((await w.current())?.status).toBe("paused");
    expect(w.invoices.find((i) => i.asaasPaymentId === renewal.id)).toMatchObject({ status: "overdue", paymentUrl: renewal.invoiceUrl });

    // Checkout on the same plan while paused returns the open charge, no new subscription
    const r = await checkout(w.deps, 7, "Starter");
    expect(r.paymentUrl).toBe(renewal.invoiceUrl);
    expect(w.asaas.size).toBe(1);

    expect(await handleAsaasEvent(w.deps, "PAYMENT_CONFIRMED", w.pay("sub_1", 2))).toBe("renewed");
    expect((await w.current())?.status).toBe("active");
    expect(w.invoices.filter((i) => i.status === "confirmed")).toHaveLength(2);
  });

  it("deleting the paid subscription in Asaas cancels the plan", async () => {
    const w = fakeWorld();
    await checkout(w.deps, 7, "Starter");
    await handleAsaasEvent(w.deps, "PAYMENT_CONFIRMED", w.pay("sub_1"));
    expect(await handleAsaasEvent(w.deps, "SUBSCRIPTION_DELETED", undefined, { id: "sub_1" })).toBe("subscription-cancelled");
    expect(await w.current()).toBeUndefined();
  });

  it("ignores notifications for subscriptions this app did not create", async () => {
    const w = fakeWorld();
    expect(await handleAsaasEvent(w.deps, "PAYMENT_CONFIRMED", { id: "pay_x", subscription: "sub_other" })).toBe("ignored");
    expect(await handleAsaasEvent(w.deps, "PAYMENT_CONFIRMED", { id: "pay_y" })).toBe("ignored");
  });

  it("a late retry of an old payment does not bring back a plan the user left", async () => {
    const w = fakeWorld();
    await checkout(w.deps, 7, "Starter");
    const p = w.pay("sub_1");
    await handleAsaasEvent(w.deps, "PAYMENT_CONFIRMED", p);
    await checkout(w.deps, 7, "Gratuito");
    expect(await handleAsaasEvent(w.deps, "PAYMENT_CONFIRMED", p)).toBe("duplicate");
    expect((await w.current())?.plan.name).toBe("Gratuito");
  });
});

describe("manual sync and cancellation", () => {
  it("'Já paguei' activates when Asaas already confirmed the payment", async () => {
    const w = fakeWorld();
    await checkout(w.deps, 7, "Starter");
    expect(await syncPendingPayment(w.deps, 7)).toEqual({ activated: false, planName: null });
    w.pay("sub_1");
    expect(await syncPendingPayment(w.deps, 7)).toEqual({ activated: true, planName: "Starter" });
    expect((await w.current())?.plan.name).toBe("Starter");
  });

  it("cancelling the plan stops the Asaas subscription", async () => {
    const w = fakeWorld();
    await checkout(w.deps, 7, "Starter");
    await handleAsaasEvent(w.deps, "PAYMENT_CONFIRMED", w.pay("sub_1"));
    await cancelPlan(w.deps, 7);
    expect(w.cancelledInAsaas).toEqual(["sub_1"]);
    expect(await w.current()).toBeUndefined();
    await expect(cancelPlan(w.deps, 7)).rejects.toThrow(/Nenhuma assinatura/);
  });
});

describe("Entrada quota", () => {
  const starter = { name: "Starter", maxInboundDocsPerMonth: 200 };
  it("requires a plan that includes the module", () => {
    expect(computeAllowance({ role: "user" }, null, 0)).toMatchObject({ allowed: false });
    expect(computeAllowance({ role: "user" }, { name: "Básico", maxInboundDocsPerMonth: 0 }, 0).reason).toMatch(/não inclui/);
  });
  it("counts the month's uploads against the plan", () => {
    expect(computeAllowance({ role: "user" }, starter, 150)).toMatchObject({ allowed: true, remaining: 50 });
    expect(computeAllowance({ role: "user" }, starter, 200)).toMatchObject({ allowed: false, remaining: 0 });
  });
  it("gives the account owner unlimited access", () => {
    expect(computeAllowance({ role: "admin" }, null, 5000)).toMatchObject({ allowed: true, limit: null });
  });
});
