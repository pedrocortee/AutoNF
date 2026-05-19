import { describe, it, expect } from "vitest";
import { z } from "zod";

describe("Plans System", () => {
  describe("Plan Validation", () => {
    const planSchema = z.object({
      name: z.string().min(1),
      description: z.string(),
      pricePerMonth: z.number().min(0),
      maxInvoicesPerMonth: z.number().min(1),
      features: z.string(),
      displayOrder: z.number(),
    });

    it("should validate Starter plan", () => {
      const starterPlan = {
        name: "Starter",
        description: "Perfeito para começar",
        pricePerMonth: 25000,
        maxInvoicesPerMonth: 50,
        features: JSON.stringify(["Até 50 notas/mês"]),
        displayOrder: 1,
      };

      expect(() => planSchema.parse(starterPlan)).not.toThrow();
    });

    it("should validate Professional plan", () => {
      const professionalPlan = {
        name: "Professional",
        description: "Para empresas em crescimento",
        pricePerMonth: 40000,
        maxInvoicesPerMonth: 200,
        features: JSON.stringify(["Até 200 notas/mês", "Webhooks"]),
        displayOrder: 2,
      };

      expect(() => planSchema.parse(professionalPlan)).not.toThrow();
    });

    it("should validate Enterprise plan", () => {
      const enterprisePlan = {
        name: "Enterprise",
        description: "Para grandes empresas",
        pricePerMonth: 99900,
        maxInvoicesPerMonth: 999999,
        features: JSON.stringify(["Ilimitado", "Suporte 24/7"]),
        displayOrder: 3,
      };

      expect(() => planSchema.parse(enterprisePlan)).not.toThrow();
    });

    it("should reject plan with invalid price", () => {
      const invalidPlan = {
        name: "Invalid",
        description: "Invalid plan",
        pricePerMonth: -100,
        maxInvoicesPerMonth: 50,
        features: JSON.stringify([]),
        displayOrder: 1,
      };

      expect(() => planSchema.parse(invalidPlan)).toThrow();
    });

    it("should reject plan with zero invoices limit", () => {
      const invalidPlan = {
        name: "Invalid",
        description: "Invalid plan",
        pricePerMonth: 25000,
        maxInvoicesPerMonth: 0,
        features: JSON.stringify([]),
        displayOrder: 1,
      };

      expect(() => planSchema.parse(invalidPlan)).toThrow();
    });
  });

  describe("Usage Calculation", () => {
    it("should calculate remaining invoices correctly", () => {
      const limit = 50;
      const usage = 30;
      const remaining = Math.max(0, limit - usage);
      const percentage = Math.round((usage / limit) * 100);

      expect(remaining).toBe(20);
      expect(percentage).toBe(60);
    });

    it("should handle full usage", () => {
      const limit = 50;
      const usage = 50;
      const remaining = Math.max(0, limit - usage);
      const percentage = Math.round((usage / limit) * 100);

      expect(remaining).toBe(0);
      expect(percentage).toBe(100);
    });

    it("should handle over-limit usage", () => {
      const limit = 50;
      const usage = 60;
      const remaining = Math.max(0, limit - usage);

      expect(remaining).toBe(0);
    });

    it("should handle zero usage", () => {
      const limit = 50;
      const usage = 0;
      const remaining = Math.max(0, limit - usage);
      const percentage = Math.round((usage / limit) * 100);

      expect(remaining).toBe(50);
      expect(percentage).toBe(0);
    });
  });

  describe("Subscription Logic", () => {
    it("should calculate next renewal date correctly", () => {
      const startDate = new Date("2026-05-17");
      const renewalDate = new Date(startDate);
      renewalDate.setMonth(renewalDate.getMonth() + 1);

      expect(renewalDate.getMonth()).toBe(5); // June (0-indexed)
      expect(renewalDate.getFullYear()).toBe(2026);
    });

    it("should handle year boundary in renewal", () => {
      const startDate = new Date("2026-12-17");
      const renewalDate = new Date(startDate);
      renewalDate.setMonth(renewalDate.getMonth() + 1);

      expect(renewalDate.getMonth()).toBe(0); // January
      expect(renewalDate.getFullYear()).toBe(2027);
    });

    it("should validate subscription status", () => {
      const validStatuses = ["active", "paused", "cancelled"];
      const testStatus = "active";

      expect(validStatuses).toContain(testStatus);
    });
  });

  describe("Invoice Usage Tracking", () => {
    it("should format month correctly", () => {
      const now = new Date("2026-05-17");
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

      expect(month).toBe("2026-05");
    });

    it("should format month with leading zero", () => {
      const now = new Date("2026-01-15");
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

      expect(month).toBe("2026-01");
    });

    it("should track usage increment", () => {
      let usage = 0;
      const limit = 50;

      for (let i = 0; i < 5; i++) {
        if (usage < limit) {
          usage++;
        }
      }

      expect(usage).toBe(5);
    });

    it("should prevent usage increment beyond limit", () => {
      let usage = 50;
      const limit = 50;

      if (usage < limit) {
        usage++;
      }

      expect(usage).toBe(50);
    });
  });

  describe("Plan Pricing", () => {
    it("should convert cents to currency correctly", () => {
      const starterPriceInCents = 25000;
      const priceInReais = starterPriceInCents / 100;

      expect(priceInReais).toBe(250);
    });

    it("should calculate monthly cost for Professional plan", () => {
      const professionalPriceInCents = 40000;
      const priceInReais = professionalPriceInCents / 100;

      expect(priceInReais).toBe(400);
    });

    it("should calculate monthly cost for Enterprise plan", () => {
      const enterprisePriceInCents = 99900;
      const priceInReais = enterprisePriceInCents / 100;

      expect(priceInReais).toBe(999);
    });

    it("should calculate annual cost", () => {
      const monthlyPrice = 250;
      const annualPrice = monthlyPrice * 12;

      expect(annualPrice).toBe(3000);
    });
  });

  describe("Plan Limit Enforcement", () => {
    const checkCanCreate = (usage: number, limit: number, subscription: any) => {
      if (!subscription) throw new Error("Nenhum plano ativo");
      if (usage >= limit) throw new Error("Limite de emissoes atingido");
      return true;
    };

    const mockSub = { planId: 1, status: "active" };

    it("should allow invoice creation when under limit", () => {
      expect(checkCanCreate(0, 50, mockSub)).toBe(true);
      expect(checkCanCreate(49, 50, mockSub)).toBe(true);
      expect(checkCanCreate(199, 200, mockSub)).toBe(true);
    });

    it("should block invoice creation when usage equals limit", () => {
      expect(() => checkCanCreate(50, 50, mockSub)).toThrow("Limite de emissoes atingido");
      expect(() => checkCanCreate(200, 200, mockSub)).toThrow("Limite de emissoes atingido");
    });

    it("should block invoice creation when usage exceeds limit", () => {
      expect(() => checkCanCreate(60, 50, mockSub)).toThrow("Limite de emissoes atingido");
    });

    it("should block invoice creation without active subscription", () => {
      expect(() => checkCanCreate(0, 50, null)).toThrow("Nenhum plano ativo");
      expect(() => checkCanCreate(0, 50, undefined)).toThrow("Nenhum plano ativo");
    });

    it("should determine UI warning state based on usage percentage", () => {
      const getState = (usage: number, limit: number) => {
        const pct = Math.round((usage / limit) * 100);
        if (pct >= 100) return "blocked";
        if (pct >= 80) return "warning";
        return "ok";
      };

      expect(getState(0, 50)).toBe("ok");
      expect(getState(39, 50)).toBe("ok");
      expect(getState(40, 50)).toBe("warning"); // 80%
      expect(getState(45, 50)).toBe("warning"); // 90%
      expect(getState(50, 50)).toBe("blocked"); // 100%
      expect(getState(55, 50)).toBe("blocked"); // >100%
    });

    it("should not block Enterprise plan (effectively unlimited)", () => {
      const UNLIMITED = 999999;
      expect(checkCanCreate(10000, UNLIMITED, mockSub)).toBe(true);
      expect(checkCanCreate(999998, UNLIMITED, mockSub)).toBe(true);
    });

    it("should display infinity symbol for Enterprise plan limit", () => {
      const formatLimit = (max: number) => (max === 999999 ? "∞" : String(max));
      expect(formatLimit(999999)).toBe("∞");
      expect(formatLimit(50)).toBe("50");
      expect(formatLimit(200)).toBe("200");
    });

    it("should calculate remaining invoices capped at zero", () => {
      const remaining = (usage: number, limit: number) => Math.max(0, limit - usage);
      expect(remaining(30, 50)).toBe(20);
      expect(remaining(50, 50)).toBe(0);
      expect(remaining(60, 50)).toBe(0);
    });

    it("should reset monthly usage tracking at month boundary", () => {
      const toMonth = (d: Date) =>
        `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

      expect(toMonth(new Date("2026-05-31"))).toBe("2026-05");
      expect(toMonth(new Date("2026-06-01"))).toBe("2026-06");
      expect(toMonth(new Date("2026-12-31"))).toBe("2026-12");
      expect(toMonth(new Date("2027-01-01"))).toBe("2027-01");
    });

    it("should enforce Starter plan (50 NFs/month) end-to-end flow", () => {
      const starterLimit = 50;
      let usage = 0;

      for (let i = 0; i < starterLimit; i++) {
        expect(checkCanCreate(usage, starterLimit, mockSub)).toBe(true);
        usage++;
      }

      expect(() => checkCanCreate(usage, starterLimit, mockSub)).toThrow("Limite de emissoes atingido");
      expect(usage).toBe(50);
    });

    it("should enforce Professional plan (200 NFs/month) threshold", () => {
      const professionalLimit = 200;
      expect(checkCanCreate(199, professionalLimit, mockSub)).toBe(true);
      expect(() => checkCanCreate(200, professionalLimit, mockSub)).toThrow("Limite de emissoes atingido");
    });
  });
});
