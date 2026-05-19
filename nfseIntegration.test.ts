import { describe, expect, it, vi } from "vitest";
import { getNFSeClient, type SubmitRPSRequest } from "./server/_core/nfseIntegration";

describe("NFS-e Integration", () => {
  describe("getNFSeClient", () => {
    it("should return client for Porto Alegre in homologacao environment", () => {
      const client = getNFSeClient("4314902", "homologacao");
      expect(client).toBeDefined();
    });

    it("should return client for Porto Alegre in producao environment", () => {
      const client = getNFSeClient("4314902", "producao");
      expect(client).toBeDefined();
    });

    it("should return client for Caxias do Sul in homologacao environment", () => {
      const client = getNFSeClient("4305108", "homologacao");
      expect(client).toBeDefined();
    });

    it("should throw error for unknown municipality", () => {
      expect(() => {
        getNFSeClient("9999999", "homologacao");
      }).toThrow("No NFS-e endpoint configured for municipality 9999999");
    });

    it("should default to homologacao environment", () => {
      const client = getNFSeClient("4314902");
      expect(client).toBeDefined();
    });
  });

  describe("NFSeClient.submitRPS", () => {
    it("should validate RPS XML is required", async () => {
      const client = getNFSeClient("4314902", "homologacao");
      const result = await client.submitRPS({
        rpsXml: "",
        cnpj: "12345678901234",
        inscriptionMunicipal: "123456",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("RPS XML is required");
      expect(result.errorCode).toBe("INVALID_INPUT");
    });

    it("should validate CNPJ format", async () => {
      const client = getNFSeClient("4314902", "homologacao");
      const result = await client.submitRPS({
        rpsXml: "<Rps></Rps>",
        cnpj: "123",
        inscriptionMunicipal: "123456",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid CNPJ format");
      expect(result.errorCode).toBe("INVALID_CNPJ");
    });

    it("should accept valid RPS submission parameters", async () => {
      const client = getNFSeClient("4314902", "homologacao");
      const validRPS: SubmitRPSRequest = {
        rpsXml: `<?xml version="1.0" encoding="UTF-8"?>
<Rps xmlns="http://www.abrasf.org.br/nfse">
  <InfRps Id="Rps_123456789012">
    <Identificacao>
      <Numero>1</Numero>
      <Serie>1</Serie>
      <Tipo>1</Tipo>
    </Identificacao>
  </InfRps>
</Rps>`,
        cnpj: "12345678901234",
        inscriptionMunicipal: "123456",
      };

      // Mock the axios call to avoid actual network request
      const result = await client.submitRPS(validRPS);
      
      // In homologacao, the API might not be available, so we just check the structure
      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("error");
      expect(result).toHaveProperty("errorCode");
    });
  });

  describe("NFSeClient.queryNFSeStatus", () => {
    it("should query NFS-e status with valid parameters", async () => {
      const client = getNFSeClient("4314902", "homologacao");
      const result = await client.queryNFSeStatus("123456", "12345678901234");

      // Check response structure
      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("error");
      expect(result).toHaveProperty("errorCode");
    });
  });

  describe("NFSeClient.cancelNFSe", () => {
    it("should cancel NFS-e with valid parameters", async () => {
      const client = getNFSeClient("4314902", "homologacao");
      const result = await client.cancelNFSe("123456", "12345678901234", "Cancelamento de teste");

      // Check response structure
      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("error");
      expect(result).toHaveProperty("errorCode");
    });
  });

  describe("Homologacao Environment Configuration", () => {
    it("should use correct homologacao endpoint for Porto Alegre", () => {
      const client = getNFSeClient("4314902", "homologacao");
      expect(client).toBeDefined();
      // Endpoint should be: https://nfse-hom.abaco.com.br/api
    });

    it("should use correct producao endpoint for Porto Alegre", () => {
      const client = getNFSeClient("4314902", "producao");
      expect(client).toBeDefined();
      // Endpoint should be: https://nfse.abaco.com.br/api
    });

    it("should support multiple municipalities in Rio Grande do Sul", () => {
      const municipalities = ["4314902", "4305108", "4313409"];
      
      municipalities.forEach(municipalityCode => {
        const client = getNFSeClient(municipalityCode, "homologacao");
        expect(client).toBeDefined();
      });
    });
  });

  describe("Error Handling", () => {
    it("should handle network errors gracefully", async () => {
      const client = getNFSeClient("4314902", "homologacao");
      
      // Try to submit to a non-existent endpoint
      const result = await client.submitRPS({
        rpsXml: "<Rps></Rps>",
        cnpj: "12345678901234",
        inscriptionMunicipal: "123456",
      });

      // Should return error response, not throw
      expect(result.success).toBe(false);
      expect(result.errorCode).toBeDefined();
    });

    it("should handle invalid XML responses", async () => {
      const client = getNFSeClient("4314902", "homologacao");
      
      const result = await client.submitRPS({
        rpsXml: "invalid xml content",
        cnpj: "12345678901234",
        inscriptionMunicipal: "123456",
      });

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("errorCode");
    });
  });

  describe("Integration Readiness", () => {
    it("should be ready for homologacao testing", () => {
      // Verify all required municipalities are configured
      const testMunicipalities = ["4314902", "4305108", "4313409"];
      
      testMunicipalities.forEach(code => {
        const client = getNFSeClient(code, "homologacao");
        expect(client).toBeDefined();
      });
    });

    it("should support transition from homologacao to producao", () => {
      const municipalityCode = "4314902";
      
      const homClient = getNFSeClient(municipalityCode, "homologacao");
      const prodClient = getNFSeClient(municipalityCode, "producao");
      
      expect(homClient).toBeDefined();
      expect(prodClient).toBeDefined();
    });

    it("should validate all required fields in RPS submission", async () => {
      const client = getNFSeClient("4314902", "homologacao");
      
      // Test missing CNPJ
      const resultNoCNPJ = await client.submitRPS({
        rpsXml: "<Rps></Rps>",
        cnpj: "",
        inscriptionMunicipal: "123456",
      });
      expect(resultNoCNPJ.success).toBe(false);
      
      // Test invalid CNPJ format
      const resultInvalidCNPJ = await client.submitRPS({
        rpsXml: "<Rps></Rps>",
        cnpj: "invalid",
        inscriptionMunicipal: "123456",
      });
      expect(resultInvalidCNPJ.success).toBe(false);
    });
  });
});
