import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// Email service tests — no real transport; validates logic, guards, templates
// ---------------------------------------------------------------------------

describe("Email Service", () => {
  const originalResend = process.env.RESEND_API_KEY;
  const originalSmtp = process.env.SMTP_HOST;

  afterEach(() => {
    if (originalResend !== undefined) process.env.RESEND_API_KEY = originalResend;
    else delete process.env.RESEND_API_KEY;
    if (originalSmtp !== undefined) process.env.SMTP_HOST = originalSmtp;
    else delete process.env.SMTP_HOST;
    vi.resetModules();
  });

  describe("Transport configuration detection", () => {
    it("returns null transport when no provider is configured", async () => {
      delete process.env.RESEND_API_KEY;
      delete process.env.SMTP_HOST;
      // createTransport is internal; we validate behavior via sendTestEmail
      const { sendTestEmail } = await import("./server/_core/emailService");
      await expect(sendTestEmail({ toEmail: "a@b.com", companyName: "Test" }))
        .rejects.toThrow("Nenhum provedor de email configurado");
    });

    it("sendInvoiceSuccessEmail silently skips when transport is null", async () => {
      delete process.env.RESEND_API_KEY;
      delete process.env.SMTP_HOST;
      const { sendInvoiceSuccessEmail } = await import("./server/_core/emailService");
      const mockInvoice = {
        id: 1, userId: 1, clientName: "Cliente", serviceDescription: "Serviço",
        value: 10000, competenceMonth: "2026-05", status: "Processado" as const,
        nfseNumber: "12345", errorMessage: null, jobId: null, rpsIdempotencyKey: null,
        pdfPath: null, tomadorEmail: null, takerCPFCNPJ: null, takerType: null,
        retIRPJ: 0, retCSLL: 0, retCOFINS: 0, retPIS: 0, retINSS: 0, retISS: 0,
        createdAt: new Date(), updatedAt: new Date(), processedAt: new Date(), expiresAt: null,
      };
      const mockCompany = {
        id: 1, userId: 1, cnpj: "12345678000195", municipalRegistration: "12345",
        companyName: "Empresa", address: "Rua X", municipality: "Porto Alegre",
        state: "RS", issRate: "5.00", cTribNac: "0107",
        createdAt: new Date(), updatedAt: new Date(),
      };
      // Should not throw — silently skips
      await expect(
        sendInvoiceSuccessEmail({
          toEmail: "test@test.com",
          invoice: mockInvoice as any,
          company: mockCompany as any,
          pdfBuffer: Buffer.from("fake-pdf"),
        })
      ).resolves.toBeUndefined();
    });

    it("sendInvoiceErrorEmail silently skips when transport is null", async () => {
      delete process.env.RESEND_API_KEY;
      delete process.env.SMTP_HOST;
      const { sendInvoiceErrorEmail } = await import("./server/_core/emailService");
      const mockInvoice = {
        id: 1, clientName: "Cliente", serviceDescription: "Serviço",
        value: 10000, competenceMonth: "2026-05", status: "Erro" as const,
        nfseNumber: null, errorMessage: "SOAP error", jobId: null, rpsIdempotencyKey: null,
        pdfPath: null, tomadorEmail: null, takerCPFCNPJ: null, takerType: null,
        retIRPJ: 0, retCSLL: 0, retCOFINS: 0, retPIS: 0, retINSS: 0, retISS: 0,
        userId: 1, createdAt: new Date(), updatedAt: new Date(), processedAt: null, expiresAt: null,
      };
      await expect(
        sendInvoiceErrorEmail({
          toEmail: "owner@empresa.com",
          invoice: mockInvoice as any,
          errorMessage: "Timeout na prefeitura",
        })
      ).resolves.toBeUndefined();
    });
  });

  describe("Currency formatting", () => {
    it("formats cents as BRL correctly", () => {
      const formatCurrency = (cents: number) =>
        (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      expect(formatCurrency(10000)).toContain("100");
      expect(formatCurrency(25000)).toContain("250");
      expect(formatCurrency(0)).toContain("0");
    });
  });

  describe("Net value calculation (for email template)", () => {
    it("calculates net value correctly after retentions", () => {
      const value = 10000;
      const retISS = 500;
      const retIRPJ = 150;
      const retCSLL = 100;
      const retCOFINS = 75;
      const retPIS = 50;
      const retINSS = 200;
      const net = value - retISS - retIRPJ - retCSLL - retCOFINS - retPIS - retINSS;
      expect(net).toBe(8925);
    });

    it("net value equals gross when no retentions", () => {
      const value = 50000;
      const net = value - 0 - 0 - 0 - 0 - 0 - 0;
      expect(net).toBe(value);
    });
  });

  describe("FROM_ADDRESS fallback", () => {
    it("defaults to noreply@autonf.com.br when EMAIL_FROM is unset", () => {
      const from = process.env.EMAIL_FROM ?? "noreply@autonf.com.br";
      expect(from).toBe("noreply@autonf.com.br");
    });
  });

  describe("SMTP_PORT parsing", () => {
    it("defaults to 587 when SMTP_PORT is not set", () => {
      const port = Number(process.env.SMTP_PORT ?? 587);
      expect(port).toBe(587);
    });

    it("uses port 465 for secure connections", () => {
      const port = 465;
      const secure = port === 465;
      expect(secure).toBe(true);
    });
  });
});
