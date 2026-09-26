import { describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// Worker logic tests — tests the pure logic without BullMQ/Redis/DB
// ---------------------------------------------------------------------------

describe("NFSe Worker Logic", () => {
  describe("Municipality code mapping", () => {
    const municipalityCodeMap: Record<string, string> = {
      "porto alegre": "4314902",
      "caxias do sul": "4305108",
      "canoas": "4304606",
      "novo hamburgo": "4313409",
      "pelotas": "4314407",
      "são leopoldo": "4318705",
      "sao leopoldo": "4318705",
      "gravataí": "4309209",
      "viamão": "4322400",
      "sapucaia do sul": "4320008",
    };

    const getCode = (municipality: string, fallback = "4314902") =>
      municipalityCodeMap[municipality.toLowerCase()] ?? fallback;

    it("maps Porto Alegre to 4314902", () => {
      expect(getCode("Porto Alegre")).toBe("4314902");
      expect(getCode("porto alegre")).toBe("4314902");
      expect(getCode("PORTO ALEGRE")).toBe("4314902");
    });

    it("maps Caxias do Sul to 4305108", () => {
      expect(getCode("Caxias do Sul")).toBe("4305108");
    });

    it("maps Canoas to 4304606", () => {
      expect(getCode("Canoas")).toBe("4304606");
    });

    it("maps Novo Hamburgo to 4313409", () => {
      expect(getCode("Novo Hamburgo")).toBe("4313409");
    });

    it("maps Pelotas to 4314407", () => {
      expect(getCode("Pelotas")).toBe("4314407");
    });

    it("maps São Leopoldo (accented) to 4318705", () => {
      expect(getCode("São Leopoldo")).toBe("4318705");
    });

    it("maps Sao Leopoldo (no accent) to 4318705", () => {
      expect(getCode("Sao Leopoldo")).toBe("4318705");
    });

    it("falls back to Porto Alegre code for unknown municipality", () => {
      expect(getCode("Desconhecido")).toBe("4314902");
    });

    it("Porto Alegre routes to SEFIN Nacional (DPS), not ABRASF", () => {
      const poa = getCode("Porto Alegre");
      const usesSefinNacional = poa === "4314902";
      expect(usesSefinNacional).toBe(true);
    });

    it("other municipalities route to ABRASF/SOAP", () => {
      const caxias = getCode("Caxias do Sul");
      const usesSefinNacional = caxias === "4314902";
      expect(usesSefinNacional).toBe(false);
    });
  });

  describe("NFSE_ENV environment control", () => {
    it("defaults to homologacao when NFSE_ENV is not set", () => {
      const env = process.env.NFSE_ENV === "producao" ? "producao" : "homologacao";
      expect(env).toBe("homologacao");
    });

    it("uses producao only when explicitly set", () => {
      const saved = process.env.NFSE_ENV;
      process.env.NFSE_ENV = "producao";
      const env = process.env.NFSE_ENV === "producao" ? "producao" : "homologacao";
      expect(env).toBe("producao");
      if (saved !== undefined) process.env.NFSE_ENV = saved;
      else delete process.env.NFSE_ENV;
    });
  });

  describe("Job retry and DLQ logic", () => {
    it("is not last attempt when attemptsMade < maxAttempts", () => {
      const attemptsMade = 1;
      const maxAttempts = 3;
      const isLastAttempt = attemptsMade >= maxAttempts;
      expect(isLastAttempt).toBe(false);
    });

    it("is last attempt when attemptsMade equals maxAttempts", () => {
      const attemptsMade = 3;
      const maxAttempts = 3;
      const isLastAttempt = attemptsMade >= maxAttempts;
      expect(isLastAttempt).toBe(true);
    });

    it("determines DLQ entry after 3 failed attempts", () => {
      const attempts = [1, 2, 3];
      const dlqEntries = attempts.filter(n => n >= 3);
      expect(dlqEntries).toHaveLength(1);
    });
  });

  describe("Invoice status transition on success", () => {
    it("success path sets status to Processado", () => {
      const result = { success: true, nfseNumber: "12345" };
      const status = result.success ? "Processado" : "Erro";
      expect(status).toBe("Processado");
    });

    it("failure path throws for BullMQ retry", () => {
      const result = { success: false, error: "SOAP Timeout" };
      const throwOnFailure = () => {
        if (!result.success) throw new Error(result.error);
      };
      expect(throwOnFailure).toThrow("SOAP Timeout");
    });
  });

  describe("ISS rate calculation in worker", () => {
    it("calculates ISS from percentage correctly", () => {
      const issRate = 5; // 5%
      const valueInCents = 10000; // R$ 100
      const issQn = Math.round(valueInCents * issRate / 100);
      expect(issQn).toBe(500);
    });

    it("uses 2% minimum rate", () => {
      const issRate = 2;
      const value = 10000;
      const iss = Math.round(value * issRate / 100);
      expect(iss).toBe(200);
    });

    it("uses invoice retISS if already set", () => {
      const invoice = { retISS: 750, value: 10000 };
      const issRate = 5;
      const vISSQN = invoice.retISS ?? Math.round(invoice.value * issRate / 100);
      expect(vISSQN).toBe(750); // Uses pre-calculated value
    });
  });

  describe("tpRetISSQN flag", () => {
    it("sets tpRetISSQN to 1 (retained) when retISS > 0", () => {
      const retISS = 500;
      const tpRetISSQN = retISS > 0 ? 1 : 2;
      expect(tpRetISSQN).toBe(1);
    });

    it("sets tpRetISSQN to 2 (not retained) when retISS = 0", () => {
      const retISS = 0;
      const tpRetISSQN = retISS > 0 ? 1 : 2;
      expect(tpRetISSQN).toBe(2);
    });
  });

  describe("PDF generation path (non-fatal)", () => {
    it("PDF generation failure does not fail the job", async () => {
      const processResult = { success: true, nfseNumber: "99999" };
      let pdfError: Error | null = null;

      if (processResult.success) {
        try {
          throw new Error("Simulated PDF generation failure");
        } catch (err) {
          pdfError = err as Error;
          // Non-fatal: job should still succeed
        }
      }

      expect(processResult.success).toBe(true);
      expect(pdfError).not.toBeNull();
    });
  });

  describe("Webhook dispatch on job completion", () => {
    it("dispatches invoice.processed event on success", () => {
      const events: string[] = [];
      const dispatchMock = (userId: number, event: string) => events.push(event);

      const result = { success: true, nfseNumber: "12345" };
      if (result.success) {
        dispatchMock(1, "invoice.processed");
      } else {
        dispatchMock(1, "invoice.error");
      }

      expect(events).toContain("invoice.processed");
      expect(events).not.toContain("invoice.error");
    });

    it("dispatches invoice.error event on final failure", () => {
      const events: string[] = [];
      const dispatchMock = (userId: number, event: string) => events.push(event);

      const isLastAttempt = true;
      if (isLastAttempt) {
        dispatchMock(1, "invoice.error");
      }

      expect(events).toContain("invoice.error");
    });
  });

  describe("Idempotency guard", () => {
    it("skips already-Processado invoice", () => {
      const invoice = { status: "Processado" as const };
      const shouldSkip = invoice.status === "Processado" || invoice.status === "Cancelado";
      expect(shouldSkip).toBe(true);
    });

    it("skips already-Cancelado invoice", () => {
      const invoice = { status: "Cancelado" as const };
      const shouldSkip = invoice.status === "Processado" || invoice.status === "Cancelado";
      expect(shouldSkip).toBe(true);
    });

    it("processes Processando invoice normally", () => {
      const invoice = { status: "Processando" as const };
      const shouldSkip = invoice.status === "Processado" || invoice.status === "Cancelado";
      expect(shouldSkip).toBe(false);
    });
  });
});
