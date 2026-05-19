import { describe, it, expect } from "vitest";
import {
  generateCancelamentoXML,
  validateCancelamentoData,
  isWithinCancellationDeadline,
  CANCELLATION_DEADLINE_DAYS,
  CANCELAMENTO_MOTIVOS,
  parseCancelamentoResponse,
  getCancelEndpoint,
  type CancelamentoData,
} from "./server/_core/cancelamentoGenerator";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseData: CancelamentoData = {
  nfseNumber: "12345",
  providerCNPJ: "12345678000195",
  providerInscricaoMunicipal: "123456",
  municipalityCode: "4314902",
  motivo: "1",
};

// ---------------------------------------------------------------------------
// XML Generation
// ---------------------------------------------------------------------------

describe("generateCancelamentoXML", () => {
  it("generates valid XML with all required fields", () => {
    const xml = generateCancelamentoXML(baseData);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain("CancelarNfseEnvio");
    expect(xml).toContain("http://www.abrasf.org.br/nfse.xsd");
    expect(xml).toContain("<Numero>12345</Numero>");
    expect(xml).toContain("<Cnpj>12345678000195</Cnpj>");
    expect(xml).toContain("<InscricaoMunicipal>123456</InscricaoMunicipal>");
    expect(xml).toContain("<CodigoMunicipio>4314902</CodigoMunicipio>");
    expect(xml).toContain("<CodigoCancelamento>1</CodigoCancelamento>");
  });

  it("embeds nfseNumber in the InfPedidoCancelamento Id attribute", () => {
    const xml = generateCancelamentoXML(baseData);
    expect(xml).toContain('Id="PCC_12345"');
  });

  it("generates correct XML for motivo 2 (serviço não prestado)", () => {
    const xml = generateCancelamentoXML({ ...baseData, motivo: "2" });
    expect(xml).toContain("<CodigoCancelamento>2</CodigoCancelamento>");
  });

  it("generates correct XML for motivo 3 (duplicidade)", () => {
    const xml = generateCancelamentoXML({ ...baseData, motivo: "3" });
    expect(xml).toContain("<CodigoCancelamento>3</CodigoCancelamento>");
  });

  it("generates correct XML for motivo 4 (outro)", () => {
    const xml = generateCancelamentoXML({ ...baseData, motivo: "4" });
    expect(xml).toContain("<CodigoCancelamento>4</CodigoCancelamento>");
  });

  it("generates well-formed XML (has opening and closing tags)", () => {
    const xml = generateCancelamentoXML(baseData);
    expect(xml).toContain("<CancelarNfseEnvio");
    expect(xml).toContain("</CancelarNfseEnvio>");
    expect(xml).toContain("<Pedido>");
    expect(xml).toContain("</Pedido>");
    expect(xml).toContain("<InfPedidoCancelamento");
    expect(xml).toContain("</InfPedidoCancelamento>");
  });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe("validateCancelamentoData", () => {
  it("accepts valid data", () => {
    const result = validateCancelamentoData(baseData);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects invalid CNPJ (less than 14 digits)", () => {
    const result = validateCancelamentoData({ ...baseData, providerCNPJ: "1234567800019" });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("CNPJ"))).toBe(true);
  });

  it("rejects CNPJ with letters", () => {
    const result = validateCancelamentoData({ ...baseData, providerCNPJ: "1234567800019A" });
    expect(result.valid).toBe(false);
  });

  it("rejects invalid municipality code (not 7 digits)", () => {
    const result = validateCancelamentoData({ ...baseData, municipalityCode: "12345" });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("município"))).toBe(true);
  });

  it("rejects empty inscrição municipal", () => {
    const result = validateCancelamentoData({ ...baseData, providerInscricaoMunicipal: "" });
    expect(result.valid).toBe(false);
  });

  it("rejects empty nfseNumber", () => {
    const result = validateCancelamentoData({ ...baseData, nfseNumber: "" });
    expect(result.valid).toBe(false);
  });

  it("rejects nfseNumber with non-digits", () => {
    const result = validateCancelamentoData({ ...baseData, nfseNumber: "NF-123" });
    expect(result.valid).toBe(false);
  });

  it("rejects invalid motivo code", () => {
    const result = validateCancelamentoData({ ...baseData, motivo: "9" as any });
    expect(result.valid).toBe(false);
  });

  it("accepts motivos 1 through 4", () => {
    for (const motivo of ["1", "2", "3", "4"] as const) {
      const result = validateCancelamentoData({ ...baseData, motivo });
      expect(result.valid).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Cancellation Deadline
// ---------------------------------------------------------------------------

describe("isWithinCancellationDeadline", () => {
  it("returns within=true for Porto Alegre within 60 days", () => {
    const processedAt = new Date();
    processedAt.setDate(processedAt.getDate() - 30); // 30 days ago
    const result = isWithinCancellationDeadline(processedAt, "4314902");
    expect(result.within).toBe(true);
    expect(result.deadlineDays).toBe(60);
    expect(result.daysElapsed).toBeGreaterThanOrEqual(29);
  });

  it("returns within=false for Porto Alegre after 60 days", () => {
    const processedAt = new Date();
    processedAt.setDate(processedAt.getDate() - 61);
    const result = isWithinCancellationDeadline(processedAt, "4314902");
    expect(result.within).toBe(false);
  });

  it("returns within=true for Caxias do Sul within 15 days", () => {
    const processedAt = new Date();
    processedAt.setDate(processedAt.getDate() - 10);
    const result = isWithinCancellationDeadline(processedAt, "4305108");
    expect(result.within).toBe(true);
    expect(result.deadlineDays).toBe(15);
  });

  it("returns within=false for Caxias do Sul after 15 days", () => {
    const processedAt = new Date();
    processedAt.setDate(processedAt.getDate() - 16);
    const result = isWithinCancellationDeadline(processedAt, "4305108");
    expect(result.within).toBe(false);
  });

  it("defaults to 15 days for unknown municipality", () => {
    const processedAt = new Date();
    processedAt.setDate(processedAt.getDate() - 10);
    const result = isWithinCancellationDeadline(processedAt, "9999999");
    expect(result.deadlineDays).toBe(15);
    expect(result.within).toBe(true);
  });

  it("returns daysElapsed correctly for just-processed note", () => {
    const processedAt = new Date();
    const result = isWithinCancellationDeadline(processedAt, "4314902");
    expect(result.daysElapsed).toBe(0);
    expect(result.within).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Deadline days per municipality
// ---------------------------------------------------------------------------

describe("CANCELLATION_DEADLINE_DAYS", () => {
  it("Porto Alegre has 60-day deadline", () => {
    expect(CANCELLATION_DEADLINE_DAYS["4314902"]).toBe(60);
  });

  it("Caxias do Sul has 15-day deadline", () => {
    expect(CANCELLATION_DEADLINE_DAYS["4305108"]).toBe(15);
  });

  it("Novo Hamburgo has 15-day deadline", () => {
    expect(CANCELLATION_DEADLINE_DAYS["4313409"]).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// Cancel Endpoint Map
// ---------------------------------------------------------------------------

describe("getCancelEndpoint", () => {
  it("returns homologação URL for Porto Alegre", () => {
    const url = getCancelEndpoint("4314902", "homologacao");
    expect(url).toMatch(/hom.*cancelar/);
  });

  it("returns production URL for Porto Alegre", () => {
    const url = getCancelEndpoint("4314902", "producao");
    expect(url).not.toContain("hom");
    expect(url).toContain("cancelar");
  });

  it("throws for unsupported municipality", () => {
    expect(() => getCancelEndpoint("9999999", "homologacao")).toThrow();
  });

  it("returns URL for Caxias do Sul", () => {
    const url = getCancelEndpoint("4305108", "homologacao");
    expect(url).toBeTruthy();
  });

  it("returns URL for Novo Hamburgo", () => {
    const url = getCancelEndpoint("4313409", "producao");
    expect(url).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Response Parsing
// ---------------------------------------------------------------------------

describe("parseCancelamentoResponse", () => {
  it("parses successful XML response", () => {
    const xml = `<ConfirmarNfseRpsResposta>
      <Numero>12345</Numero>
      <Protocolo>PROT-001</Protocolo>
      <DataCancelamento>2026-05-17</DataCancelamento>
    </ConfirmarNfseRpsResposta>`;
    const result = parseCancelamentoResponse(xml);
    expect(result.success).toBe(true);
    expect(result.nfseNumber).toBe("12345");
    expect(result.protocolNumber).toBe("PROT-001");
    expect(result.cancellationDate).toBe("2026-05-17");
  });

  it("parses error XML response", () => {
    const xml = `<ConfirmarNfseRpsResposta>
      <Mensagem>NFS-e não encontrada ou fora do prazo</Mensagem>
      <Codigo>E001</Codigo>
    </ConfirmarNfseRpsResposta>`;
    const result = parseCancelamentoResponse(xml);
    expect(result.success).toBe(false);
    expect(result.error).toContain("NFS-e");
    expect(result.errorCode).toBe("E001");
  });

  it("parses successful JSON response", () => {
    const json = { nfseNumber: "99", protocolNumber: "P-99", cancellationDate: "2026-05-17" };
    const result = parseCancelamentoResponse(json);
    expect(result.success).toBe(true);
    expect(result.nfseNumber).toBe("99");
  });

  it("parses error JSON response", () => {
    const json = { error: "Prazo expirado" };
    const result = parseCancelamentoResponse(json);
    expect(result.success).toBe(false);
    expect(result.error).toBe("Prazo expirado");
  });

  it("returns invalid response error for null", () => {
    const result = parseCancelamentoResponse(null);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("INVALID_RESPONSE");
  });
});

// ---------------------------------------------------------------------------
// Motivo labels
// ---------------------------------------------------------------------------

describe("CANCELAMENTO_MOTIVOS", () => {
  it("has label for all 4 motivo codes", () => {
    expect(CANCELAMENTO_MOTIVOS["1"]).toBeTruthy();
    expect(CANCELAMENTO_MOTIVOS["2"]).toBeTruthy();
    expect(CANCELAMENTO_MOTIVOS["3"]).toBeTruthy();
    expect(CANCELAMENTO_MOTIVOS["4"]).toBeTruthy();
  });

  it("motivo 1 is about emission error", () => {
    expect(CANCELAMENTO_MOTIVOS["1"].toLowerCase()).toContain("erro");
  });

  it("motivo 2 is about service not rendered", () => {
    expect(CANCELAMENTO_MOTIVOS["2"].toLowerCase()).toContain("servi");
  });

  it("motivo 3 is about duplicate", () => {
    expect(CANCELAMENTO_MOTIVOS["3"].toLowerCase()).toContain("duplic");
  });
});
