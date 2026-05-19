import { describe, expect, it } from "vitest";
import { generateRPSXML, validateRPSData, type RPSData } from "./server/_core/rpsGenerator";

const validRPSData: RPSData = {
  rpsNumber: "1",
  seriesNumber: "1",
  rpsType: "RPS",
  providerCNPJ: "12345678901234",
  providerInscriptionMunicipal: "123456",
  takerName: "Empresa Teste LTDA",
  takerCPFCNPJ: "98765432109876",
  serviceDescription: "Serviço de consultoria",
  serviceValue: 10000, // R$ 100.00
  competenceMonth: "2026-05",
  rpsDate: "2026-05-16",
};

describe("RPS Generator", () => {
  describe("validateRPSData", () => {
    it("should validate correct RPS data", () => {
      const result = validateRPSData(validRPSData);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject invalid CNPJ", () => {
      const data = { ...validRPSData, providerCNPJ: "123" };
      const result = validateRPSData(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Provider CNPJ must have 14 digits");
    });

    it("should reject invalid RPS number", () => {
      const data = { ...validRPSData, rpsNumber: "9999999999999" };
      const result = validateRPSData(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("RPS number must be between 1 and 999999999999");
    });

    it("should reject zero service value", () => {
      const data = { ...validRPSData, serviceValue: 0 };
      const result = validateRPSData(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Service value must be greater than 0");
    });

    it("should reject invalid competence month format", () => {
      const data = { ...validRPSData, competenceMonth: "2026/05" };
      const result = validateRPSData(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Competence month must be in YYYY-MM format");
    });

    it("should reject invalid RPS date format", () => {
      const data = { ...validRPSData, rpsDate: "16/05/2026" };
      const result = validateRPSData(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("RPS date must be in YYYY-MM-DD format");
    });

    it("should reject invalid taker CPF/CNPJ", () => {
      const data = { ...validRPSData, takerCPFCNPJ: "123" };
      const result = validateRPSData(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Taker CPF/CNPJ must have 11 or 14 digits");
    });

    it("should reject empty service description", () => {
      const data = { ...validRPSData, serviceDescription: "" };
      const result = validateRPSData(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Service description cannot be empty");
    });
  });

  describe("generateRPSXML", () => {
    it("should generate valid XML structure", () => {
      const xml = generateRPSXML(validRPSData);
      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain("<Rps");
      expect(xml).toContain("</Rps>");
    });

    it("should include RPS identification", () => {
      const xml = generateRPSXML(validRPSData);
      expect(xml).toContain("<Numero>1</Numero>");
      expect(xml).toContain("<Serie>1</Serie>");
      expect(xml).toContain("<Tipo>1</Tipo>"); // RPS type 1
    });

    it("should include service values", () => {
      const xml = generateRPSXML(validRPSData);
      expect(xml).toContain("<ValorServicos>100.00</ValorServicos>");
    });

    it("should include provider CNPJ", () => {
      const xml = generateRPSXML(validRPSData);
      expect(xml).toContain("<Cnpj>12345678901234</Cnpj>");
    });

    it("should include taker information", () => {
      const xml = generateRPSXML(validRPSData);
      expect(xml).toContain("<RazaoSocial>Empresa Teste LTDA</RazaoSocial>");
      expect(xml).toContain("<Cnpj>98765432109876</Cnpj>");
    });

    it("should include service description", () => {
      const xml = generateRPSXML(validRPSData);
      expect(xml).toContain("<Descricao>Serviço de consultoria</Descricao>");
    });

    it("should escape XML special characters in description", () => {
      const data = {
        ...validRPSData,
        serviceDescription: 'Serviço com "aspas" & caracteres <especiais>',
      };
      const xml = generateRPSXML(data);
      expect(xml).toContain("&quot;");
      expect(xml).toContain("&amp;");
      expect(xml).toContain("&lt;");
      expect(xml).toContain("&gt;");
    });

    it("should handle CPF for taker", () => {
      const data = { ...validRPSData, takerCPFCNPJ: "12345678901" };
      const xml = generateRPSXML(data);
      expect(xml).toContain("<Cpf>12345678901</Cpf>");
      expect(xml).not.toContain("<Cnpj>12345678901</Cnpj>");
    });

    it("should include deduction value when provided", () => {
      const data = { ...validRPSData, deductionValue: 1000 };
      const xml = generateRPSXML(data);
      expect(xml).toContain("<ValorDeducoes>10.00</ValorDeducoes>");
    });

    it("should include discount value when provided", () => {
      const data = { ...validRPSData, discountValue: 500 };
      const xml = generateRPSXML(data);
      expect(xml).toContain("<ValorDesconto>5.00</ValorDesconto>");
    });

    it("should calculate net value correctly", () => {
      const data = {
        ...validRPSData,
        serviceValue: 10000, // R$ 100.00
        deductionValue: 1000, // R$ 10.00
        discountValue: 500, // R$ 5.00
      };
      const xml = generateRPSXML(data);
      // Net = 100 - 10 - 5 = 85
      expect(xml).toContain("<ValorLiquidoNfse>85.00</ValorLiquidoNfse>");
    });

    it("should include RPS date", () => {
      const xml = generateRPSXML(validRPSData);
      expect(xml).toContain("<DataEmissao>2026-05-16T00:00:00</DataEmissao>");
    });

    it("should handle RPS-M type", () => {
      const data = { ...validRPSData, rpsType: "RPS-M" as const };
      const xml = generateRPSXML(data);
      expect(xml).toContain("<Tipo>2</Tipo>");
    });

    it("should handle RPS-C type", () => {
      const data = { ...validRPSData, rpsType: "RPS-C" as const };
      const xml = generateRPSXML(data);
      expect(xml).toContain("<Tipo>3</Tipo>");
    });
  });
});
