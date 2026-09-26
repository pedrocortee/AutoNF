import { describe, expect, it } from "vitest";
import {
  isValidAccessKey44,
  isValidCnpj,
  isValidCpf,
  parseDigitableLine,
} from "../../server/_core/inbound/checksums";
import { sameDocumentNumber, validateDocument } from "../../server/_core/inbound/validators";
import { decide } from "../../server/_core/inbound/confidence";
import { parseNFeXml } from "../../server/_core/inbound/xml/nfeParser";
import { emptyDocument, type ExtractionResult } from "../../server/_core/inbound/schemas";
import {
  ALNUM_CNPJ,
  BOLETO_LINE_VALID,
  NFE_KEY,
  NFE_KEY_ALNUM,
  OFFICE_CLIENT_CNPJ,
  SUPPLIER_CNPJ,
  nfeProcXml,
} from "./fixtures";

const TODAY = "2026-09-26";
const codes = (issues: { code: string }[]) => issues.map((i) => i.code);

describe("checksums", () => {
  it("validates numeric and alphanumeric CNPJ", () => {
    expect(isValidCnpj("11222333000181")).toBe(true);
    expect(isValidCnpj(ALNUM_CNPJ)).toBe(true);
    expect(isValidCnpj("11222333000182")).toBe(false);
    expect(isValidCnpj("12ABC34501DE36")).toBe(false);
    expect(isValidCnpj("11111111111111")).toBe(false);
  });

  it("validates CPF", () => {
    expect(isValidCpf("52998224725")).toBe(true);
    expect(isValidCpf("52998224726")).toBe(false);
    expect(isValidCpf("00000000000")).toBe(false);
  });

  it("validates 44-char access keys, including alphanumeric CNPJ", () => {
    expect(isValidAccessKey44(NFE_KEY)).toBe(true);
    expect(isValidAccessKey44(NFE_KEY_ALNUM)).toBe(true);
    expect(isValidAccessKey44(NFE_KEY.slice(0, 43) + "0")).toBe(false);
  });

  it("parses a valid bank slip digitable line", () => {
    const info = parseDigitableLine(BOLETO_LINE_VALID);
    expect(info).toMatchObject({ valid: true, kind: "bancario", amountCents: 100 });
  });

  it("detects a typo in the digitable line", () => {
    const typo = BOLETO_LINE_VALID.slice(0, 5) + "1" + BOLETO_LINE_VALID.slice(6);
    expect(parseDigitableLine(typo)?.valid).toBe(false);
  });

  it("accepts punctuation in the digitable line", () => {
    const formatted = "00190.50095 40144.816069 06809.350314 3 37370000000100";
    expect(parseDigitableLine(formatted)?.valid).toBe(true);
  });

  it("returns null for lines of the wrong length", () => {
    expect(parseDigitableLine("123")).toBeNull();
  });
});

describe("validateDocument", () => {
  it("passes a correct NF-e addressed to the company", async () => {
    const doc = await parseNFeXml(nfeProcXml());
    expect(validateDocument(doc, { companyDocuments: [OFFICE_CLIENT_CNPJ], method: "xml", today: TODAY })).toEqual([]);
  });

  it("flags NF-e addressed to another company", async () => {
    const doc = await parseNFeXml(nfeProcXml());
    const issues = validateDocument(doc, { companyDocuments: ["11222333000181"], method: "xml", today: TODAY });
    expect(codes(issues)).toContain("recipient_mismatch");
  });

  it("flags access key whose CNPJ differs from the issuer", async () => {
    const doc = await parseNFeXml(nfeProcXml({ emit: "11222333000181" }));
    const issues = validateDocument(doc, { companyDocuments: [OFFICE_CLIENT_CNPJ], method: "xml", today: TODAY });
    expect(codes(issues)).toContain("access_key_issuer_mismatch");
  });

  it("flags future issue date and invalid issuer CNPJ", () => {
    const doc = emptyDocument("recibo");
    doc.issuer.document = "11222333000182";
    doc.totalCents = 1000;
    doc.issueDate = "2026-12-01";
    const issues = validateDocument(doc, { companyDocuments: [], method: "llm", today: TODAY });
    expect(codes(issues)).toEqual(expect.arrayContaining(["issuer_invalid", "issue_date_future"]));
  });

  it("checks items vs total only for LLM output", () => {
    const doc = emptyDocument("recibo");
    doc.issuer.document = SUPPLIER_CNPJ;
    doc.issueDate = "2026-09-01";
    doc.totalCents = 1000;
    doc.items = [{ description: "x", quantity: 1, unitValueCents: 900, totalCents: 900, ncm: null, cfop: null }];
    expect(codes(validateDocument(doc, { companyDocuments: [], method: "llm", today: TODAY }))).toContain("items_total_mismatch");
    expect(codes(validateDocument(doc, { companyDocuments: [], method: "xml", today: TODAY }))).not.toContain("items_total_mismatch");
  });

  it("validates boleto line against the extracted amount", () => {
    const doc = emptyDocument("boleto");
    doc.issuer.document = SUPPLIER_CNPJ;
    doc.dueDate = "2026-10-10";
    doc.totalCents = 999;
    doc.boleto = { digitableLine: BOLETO_LINE_VALID, bankName: "Banco do Brasil" };
    const issues = validateDocument(doc, { companyDocuments: [], method: "llm", today: TODAY });
    expect(codes(issues)).toContain("boleto_amount_mismatch");
  });
});

describe("decide", () => {
  const base = (over: Partial<ExtractionResult> = {}): ExtractionResult => ({
    document: emptyDocument("nfe"),
    method: "xml",
    extractorConfidence: 1,
    uncertainFields: [],
    costMicros: 0,
    ...over,
  });

  it("auto-approves clean, confident results", () => {
    expect(decide(base(), []).status).toBe("aprovado");
  });

  it("sends anything with issues or uncertainty to review", () => {
    expect(decide(base(), [{ code: "x", field: null, severity: "warning", message: "" }]).status).toBe("revisao");
    expect(decide(base({ uncertainFields: ["totalCents"] }), []).status).toBe("revisao");
    expect(decide(base({ extractorConfidence: 0.8 }), []).status).toBe("revisao");
  });

  it("does not block on doubt about descriptive fields only", () => {
    expect(decide(base({ uncertainFields: ["bankName", "issuerName"] }), []).status).toBe("aprovado");
    expect(decide(base({ uncertainFields: ["bankName", "dueDate"] }), []).status).toBe("revisao");
  });

  it("lowers the score for errors", () => {
    const d = decide(base(), [{ code: "x", field: null, severity: "error", message: "" }]);
    expect(d.score).toBeCloseTo(0.65);
    expect(d.reasons[0]).toMatch(/erro/);
  });
});

describe("sameDocumentNumber", () => {
  it("matches numbers written differently by different sources", () => {
    expect(sameDocumentNumber("2026/000874", "874")).toBe(true);
    expect(sameDocumentNumber("000874", "874")).toBe(true);
    expect(sameDocumentNumber("874", "875")).toBe(false);
    expect(sameDocumentNumber(null, "874")).toBe(false);
    expect(sameDocumentNumber("s/n", "")).toBe(false);
  });
});
