import { describe, it, expect } from "vitest";
import { z } from "zod";

// Test schemas for invoice creation
const invoiceCreateSchema = z.object({
  clientName: z.string().min(1, "Cliente é obrigatório"),
  serviceDescription: z.string().min(1, "Descrição do serviço é obrigatória"),
  value: z.number().min(1, "Valor deve ser maior que 0"),
  competenceMonth: z.string().regex(/^\d{4}-\d{2}$/, "Formato deve ser YYYY-MM"),
});

describe("invoices validation schemas", () => {
  describe("invoice creation schema", () => {
    it("should validate correct invoice data", () => {
      const validData = {
        clientName: "Test Client",
        serviceDescription: "Test Service",
        value: 1000,
        competenceMonth: "2026-05",
      };

      const result = invoiceCreateSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should reject empty clientName", () => {
      const invalidData = {
        clientName: "",
        serviceDescription: "Test Service",
        value: 1000,
        competenceMonth: "2026-05",
      };

      const result = invoiceCreateSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("Cliente é obrigatório");
      }
    });

    it("should reject empty serviceDescription", () => {
      const invalidData = {
        clientName: "Test Client",
        serviceDescription: "",
        value: 1000,
        competenceMonth: "2026-05",
      };

      const result = invoiceCreateSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("Descrição do serviço é obrigatória");
      }
    });

    it("should reject zero or negative value", () => {
      const invalidData = {
        clientName: "Test Client",
        serviceDescription: "Test Service",
        value: 0,
        competenceMonth: "2026-05",
      };

      const result = invoiceCreateSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("Valor deve ser maior que 0");
      }
    });

    it("should reject invalid competenceMonth format", () => {
      const invalidData = {
        clientName: "Test Client",
        serviceDescription: "Test Service",
        value: 1000,
        competenceMonth: "2026/05",
      };

      const result = invoiceCreateSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("Formato deve ser YYYY-MM");
      }
    });

    it("should accept various valid competenceMonth formats", () => {
      const validMonths = ["2026-01", "2026-12", "2025-06", "2024-03"];

      validMonths.forEach(month => {
        const data = {
          clientName: "Test Client",
          serviceDescription: "Test Service",
          value: 1000,
          competenceMonth: month,
        };

        const result = invoiceCreateSchema.safeParse(data);
        expect(result.success).toBe(true);
      });
    });

    it("should accept various positive values", () => {
      const validValues = [1, 100, 1000, 10000, 100.50, 999.99];

      validValues.forEach(value => {
        const data = {
          clientName: "Test Client",
          serviceDescription: "Test Service",
          value: Math.round(value * 100) / 100, // Ensure proper decimal precision
          competenceMonth: "2026-05",
        };

        const result = invoiceCreateSchema.safeParse(data);
        expect(result.success).toBe(true);
      });
    });
  });

  describe("invoice status enum", () => {
    const statusEnum = z.enum(["Pendente", "Processado", "Erro"]);

    it("should accept valid status values", () => {
      const validStatuses = ["Pendente", "Processado", "Erro"];

      validStatuses.forEach(status => {
        const result = statusEnum.safeParse(status);
        expect(result.success).toBe(true);
      });
    });

    it("should reject invalid status values", () => {
      const invalidStatuses = ["Criado", "Cancelado", "Pendente ", "pendente"];

      invalidStatuses.forEach(status => {
        const result = statusEnum.safeParse(status);
        expect(result.success).toBe(false);
      });
    });
  });

  describe("invoice filtering schema", () => {
    const filterSchema = z.object({
      status: z.enum(["Pendente", "Processado", "Erro"]).optional(),
      clientName: z.string().optional(),
      competenceMonth: z.string().optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    });

    it("should accept empty filter object", () => {
      const result = filterSchema.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data?.limit).toBe(50);
      expect(result.data?.offset).toBe(0);
    });

    it("should accept filter with status", () => {
      const result = filterSchema.safeParse({
        status: "Pendente",
      });
      expect(result.success).toBe(true);
    });

    it("should accept filter with clientName", () => {
      const result = filterSchema.safeParse({
        clientName: "Test Client",
      });
      expect(result.success).toBe(true);
    });

    it("should accept filter with competenceMonth", () => {
      const result = filterSchema.safeParse({
        competenceMonth: "2026-05",
      });
      expect(result.success).toBe(true);
    });

    it("should accept filter with all fields", () => {
      const result = filterSchema.safeParse({
        status: "Processado",
        clientName: "Test Client",
        competenceMonth: "2026-05",
        limit: 100,
        offset: 10,
      });
      expect(result.success).toBe(true);
    });

    it("should reject invalid status in filter", () => {
      const result = filterSchema.safeParse({
        status: "InvalidStatus",
      });
      expect(result.success).toBe(false);
    });
  });
});
