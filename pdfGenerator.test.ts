import { describe, it, expect } from "vitest";
import { generateNFSePDF, type PDFInvoiceData } from "./server/_core/pdfGenerator";
import type { Invoice } from "./drizzle/schema";
import type { CompanyConfig } from "./drizzle/schema";

const baseInvoice: Invoice = {
  id: 42,
  userId: 1,
  clientName: "Empresa Tomadora LTDA",
  serviceDescription: "Consultoria em tecnologia da informação",
  value: 1000000, // R$ 10.000,00
  competenceMonth: "2026-05",
  status: "Processado",
  nfseNumber: null,
  errorMessage: null,
  jobId: null,
  rpsIdempotencyKey: null,
  pdfPath: null,
  tomadorEmail: null,
  takerCPFCNPJ: null,
  takerType: null,
  retIRPJ: 0,
  retCSLL: 0,
  retCOFINS: 0,
  retPIS: 0,
  retINSS: 0,
  retISS: 0,
  createdAt: new Date("2026-05-24T12:00:00Z"),
  updatedAt: new Date("2026-05-24T12:00:00Z"),
  processedAt: new Date("2026-05-24T12:05:00Z"),
  expiresAt: null,
};

const baseCompany: CompanyConfig = {
  id: 1,
  userId: 1,
  cnpj: "12345678000195",
  municipalRegistration: "123456",
  companyName: "Prestadora de Serviços LTDA",
  address: "Rua das Flores, 100 — Porto Alegre/RS",
  municipality: "Porto Alegre",
  state: "RS",
  issRate: "5.00",
  cTribNac: "0107",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

function buildData(overrides: Partial<PDFInvoiceData> = {}): PDFInvoiceData {
  return { invoice: baseInvoice, company: baseCompany, ...overrides };
}

describe("generateNFSePDF", () => {
  describe("saída básica", () => {
    it("retorna um Buffer não-vazio", async () => {
      const buf = await generateNFSePDF(buildData());
      expect(buf).toBeInstanceOf(Buffer);
      expect(buf.length).toBeGreaterThan(0);
    });

    it("o Buffer começa com assinatura PDF (%PDF-)", async () => {
      const buf = await generateNFSePDF(buildData());
      expect(buf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    });

    it("gera PDF de tamanho razoável (> 2 KB)", async () => {
      const buf = await generateNFSePDF(buildData());
      expect(buf.length).toBeGreaterThan(2 * 1024);
    });
  });

  describe("nfseNumber", () => {
    it("gera PDF quando nfseNumber está presente", async () => {
      const buf = await generateNFSePDF(buildData({ nfseNumber: "2026000123" }));
      expect(buf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    });

    it("gera PDF quando nfseNumber é null (nota ainda não processada)", async () => {
      const buf = await generateNFSePDF(buildData({ nfseNumber: null }));
      expect(buf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    });
  });

  describe("verificationCode", () => {
    it("gera PDF com código de verificação da prefeitura", async () => {
      const buf = await generateNFSePDF(
        buildData({ nfseNumber: "2026000123", verificationCode: "ABC123XYZ" })
      );
      expect(buf).toBeInstanceOf(Buffer);
      expect(buf.length).toBeGreaterThan(2 * 1024);
    });

    it("gera PDF sem código de verificação (campo omitido)", async () => {
      const buf = await generateNFSePDF(buildData({ nfseNumber: "2026000123" }));
      expect(buf).toBeInstanceOf(Buffer);
    });

    it("gera PDF com verificationCode null", async () => {
      const buf = await generateNFSePDF(
        buildData({ nfseNumber: "2026000123", verificationCode: null })
      );
      expect(buf).toBeInstanceOf(Buffer);
    });
  });

  describe("verificationUrl (QR Code)", () => {
    it("gera PDF com URL oficial de verificação do município", async () => {
      const buf = await generateNFSePDF(
        buildData({
          nfseNumber: "2026000123",
          verificationUrl: "https://nfse.prefeitura.sp.gov.br/consulta?nfse=2026000123",
        })
      );
      expect(buf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    });

    it("gera PDF sem verificationUrl (usa fallback por município)", async () => {
      const buf = await generateNFSePDF(
        buildData({ nfseNumber: "2026000123", verificationUrl: null })
      );
      expect(buf).toBeInstanceOf(Buffer);
    });

    it("gera PDF sem nfseNumber e sem verificationUrl (fallback autonf)", async () => {
      const buf = await generateNFSePDF(
        buildData({ nfseNumber: null, verificationUrl: null })
      );
      expect(buf).toBeInstanceOf(Buffer);
    });
  });

  describe("taxRegime", () => {
    it("gera PDF com regime tributário Simples Nacional", async () => {
      const buf = await generateNFSePDF(
        buildData({ taxRegime: "Simples Nacional" })
      );
      expect(buf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    });

    it("gera PDF com regime tributário Lucro Presumido", async () => {
      const buf = await generateNFSePDF(
        buildData({ taxRegime: "Lucro Presumido" })
      );
      expect(buf).toBeInstanceOf(Buffer);
    });

    it("gera PDF sem taxRegime (campo omitido)", async () => {
      const buf = await generateNFSePDF(buildData());
      expect(buf).toBeInstanceOf(Buffer);
    });

    it("gera PDF com taxRegime null", async () => {
      const buf = await generateNFSePDF(buildData({ taxRegime: null }));
      expect(buf).toBeInstanceOf(Buffer);
    });
  });

  describe("campos fiscais (LC 116/2003 e issRate)", () => {
    it("respeita cTribNac e issRate do companyConfig", async () => {
      const company: CompanyConfig = {
        ...baseCompany,
        cTribNac: "1401",
        issRate: "2.00",
      };
      const buf = await generateNFSePDF(buildData({ company }));
      expect(buf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    });

    it("funciona com issRate como string decimal (retorno Drizzle)", async () => {
      const company: CompanyConfig = { ...baseCompany, issRate: "3.50" };
      const buf = await generateNFSePDF(buildData({ company }));
      expect(buf).toBeInstanceOf(Buffer);
    });
  });

  describe("retenções de impostos", () => {
    it("gera PDF com todas as retenções preenchidas", async () => {
      const invoice: Invoice = {
        ...baseInvoice,
        retISS: 50000,
        retIRPJ: 15000,
        retCSLL: 9000,
        retCOFINS: 30000,
        retPIS: 6500,
        retINSS: 110000,
      };
      const buf = await generateNFSePDF(buildData({ invoice }));
      expect(buf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
      expect(buf.length).toBeGreaterThan(2 * 1024);
    });

    it("gera PDF sem nenhuma retenção", async () => {
      const buf = await generateNFSePDF(buildData());
      expect(buf).toBeInstanceOf(Buffer);
    });
  });

  describe("tomador com CPF/CNPJ", () => {
    it("gera PDF com tomador pessoa jurídica (CNPJ)", async () => {
      const invoice: Invoice = {
        ...baseInvoice,
        takerCPFCNPJ: "98765432000100",
        takerType: "CNPJ",
      };
      const buf = await generateNFSePDF(buildData({ invoice }));
      expect(buf).toBeInstanceOf(Buffer);
    });

    it("gera PDF com tomador pessoa física (CPF)", async () => {
      const invoice: Invoice = {
        ...baseInvoice,
        takerCPFCNPJ: "12345678901",
        takerType: "CPF",
      };
      const buf = await generateNFSePDF(buildData({ invoice }));
      expect(buf).toBeInstanceOf(Buffer);
    });
  });

  describe("combinação completa de campos novos", () => {
    it("gera PDF com todos os campos novos preenchidos simultaneamente", async () => {
      const buf = await generateNFSePDF(
        buildData({
          nfseNumber: "2026099999",
          verificationCode: "XK9P2MZQ",
          verificationUrl: "https://nfse.portoalegre.rs.gov.br/consulta?nfse=2026099999&cnpj=12345678000195",
          taxRegime: "Simples Nacional",
        })
      );
      expect(buf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
      expect(buf.length).toBeGreaterThan(2 * 1024);
    });
  });
});
