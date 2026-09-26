import { describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { runPipeline } from "../../server/_core/inbound/pipeline";
import { LlmExtractionError } from "../../server/_core/inbound/llmExtractor";
import { toCsv } from "../../server/_core/inbound/exporter";
import { expandFiles, isZip } from "../../server/_core/inbound/ingest";
import { emptyDocument, type ExtractionResult } from "../../server/_core/inbound/schemas";
import { parseNFeXml } from "../../server/_core/inbound/xml/nfeParser";
import { BOLETO_LINE_VALID, NFE_KEY, OFFICE_CLIENT_CNPJ, SUPPLIER_CNPJ, nfeProcXml } from "./fixtures";

const TODAY = "2026-09-26";

function boletoResult(totalCents: number): ExtractionResult {
  const doc = emptyDocument("boleto");
  doc.issuer = { document: SUPPLIER_CNPJ, name: "Fornecedor" };
  doc.totalCents = totalCents;
  doc.dueDate = "2032-08-21"; // fator 3737 na base FEBRABAN de 22/02/2025
  doc.boleto = { digitableLine: BOLETO_LINE_VALID, bankName: "BB" };
  return { document: doc, method: "llm", extractorConfidence: 0.97, uncertainFields: [], costMicros: 1200 };
}

describe("runPipeline", () => {
  it("auto-approves a valid NF-e XML addressed to the company, without calling the LLM", async () => {
    const llm = vi.fn();
    const out = await runPipeline(Buffer.from(nfeProcXml()), OFFICE_CLIENT_CNPJ, { extractWithLlm: llm, today: TODAY });
    expect(llm).not.toHaveBeenCalled();
    expect(out.kind).toBe("extracted");
    if (out.kind !== "extracted") return;
    expect(out.docType).toBe("nfe");
    expect(out.extraction.method).toBe("xml");
    expect(out.decision.status).toBe("aprovado");
  });

  it("sends an NF-e for another company to review", async () => {
    const out = await runPipeline(Buffer.from(nfeProcXml()), "11222333000181", { today: TODAY });
    expect(out.kind === "extracted" && out.decision.status).toBe("revisao");
  });

  it("routes PDFs to the LLM and validates its output", async () => {
    const llm = vi.fn().mockResolvedValue(boletoResult(999)); // line says R$ 1,00
    const out = await runPipeline(Buffer.from("%PDF-1.7 boleto"), OFFICE_CLIENT_CNPJ, { extractWithLlm: llm, today: TODAY });
    expect(llm).toHaveBeenCalledWith(expect.any(Buffer), "application/pdf", undefined);
    expect(out.kind === "extracted" && out.issues.map((i) => i.code)).toContain("boleto_amount_mismatch");
    expect(out.kind === "extracted" && out.decision.status).toBe("revisao");
  });

  it("approves a consistent boleto read by the LLM", async () => {
    const llm = vi.fn().mockResolvedValue(boletoResult(100));
    const out = await runPipeline(Buffer.from("%PDF-1.7"), OFFICE_CLIENT_CNPJ, { extractWithLlm: llm, today: TODAY });
    expect(out.kind === "extracted" && out.decision.status).toBe("aprovado");
  });

  it("propagates retryable LLM failures and fails fast on the rest", async () => {
    const temp = vi.fn().mockRejectedValue(new LlmExtractionError("429", true));
    expect(await runPipeline(Buffer.from("%PDF-1.7"), null, { extractWithLlm: temp })).toEqual({ kind: "failed", reason: "429", retryable: true });

    const out = await runPipeline(Buffer.from("<nfeProc><NFe/></nfeProc>"), null);
    expect(out).toMatchObject({ kind: "failed", retryable: false });
  });

  it("ignores SEFAZ events and rejects unknown files", async () => {
    expect((await runPipeline(Buffer.from("<procEventoNFe/>"), null)).kind).toBe("ignored");
    expect((await runPipeline(Buffer.from("texto qualquer"), null)).kind).toBe("failed");
  });

  it("does not parse CT-e yet and says so", async () => {
    const out = await runPipeline(Buffer.from("<cteProc/>"), null);
    expect(out).toMatchObject({ kind: "failed", reason: expect.stringMatching(/CT-e/) });
  });
});

describe("toCsv", () => {
  it("writes an Excel pt-BR friendly CSV", async () => {
    const doc = await parseNFeXml(nfeProcXml());
    doc.issuer.name = 'Distribuidora "Exemplo"; Ltda';
    const csv = toCsv([{ id: 7, status: "aprovado", method: "xml", document: doc }]);
    expect(csv.startsWith("﻿")).toBe(true);
    const [header, row] = csv.slice(1).split("\r\n");
    expect(header.split(";")[0]).toBe("ID");
    expect(row).toContain(`="${NFE_KEY}"`);
    expect(row).toContain("20/09/2026");
    expect(row).toContain(";110,00;");
    expect(row).toContain('"Distribuidora ""Exemplo""; Ltda"');
    expect(row.endsWith(";XML;aprovado")).toBe(true);
  });
});

describe("expandFiles", () => {
  it("flattens ZIP entries and skips folders and OS metadata", async () => {
    const zip = new JSZip();
    zip.file("notas/a.xml", nfeProcXml());
    zip.file("b.pdf", "%PDF-1.7");
    zip.file("__MACOSX/._a.xml", "junk");
    zip.file(".DS_Store", "junk");
    const buf = await zip.generateAsync({ type: "nodebuffer" });
    expect(isZip(buf)).toBe(true);

    const { files, rejected } = await expandFiles([{ filename: "lote.zip", buffer: buf }, { filename: "c.xml", buffer: Buffer.from("<x/>") }]);
    expect(rejected).toEqual([]);
    expect(files.map((f) => f.filename).sort()).toEqual(["a.xml", "b.pdf", "c.xml"]);
  });
});
