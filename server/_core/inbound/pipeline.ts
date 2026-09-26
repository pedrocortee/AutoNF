/**
 * Pure processing pipeline: bytes → classification → extraction → validation → decision.
 * No database or queue access, so it can be tested in isolation; persistence lives in processor.ts.
 */

import { classify } from "./classifier";
import { decide, type Decision } from "./confidence";
import { extractWithLlm, LlmExtractionError, type LlmExtractorOptions } from "./llmExtractor";
import type { DocType, ExtractionResult, ValidationIssue } from "./schemas";
import { validateDocument } from "./validators";
import { parseNFeXml } from "./xml/nfeParser";
import { parseNFSeNacionalXml } from "./xml/nfseParser";

export type PipelineOutcome =
  | {
      kind: "extracted";
      docType: DocType;
      mediaType: string;
      extraction: ExtractionResult;
      issues: ValidationIssue[];
      decision: Decision;
    }
  | { kind: "ignored"; reason: string }
  | { kind: "failed"; reason: string; retryable: boolean };

export interface PipelineDeps {
  extractWithLlm?: typeof extractWithLlm;
  llmOptions?: LlmExtractorOptions;
  today?: string;
}

async function extractXml(buf: Buffer, docType: "nfe" | "cte" | "nfse"): Promise<ExtractionResult | string> {
  const xml = buf.toString("utf8").replace(/^﻿/, "");
  if (docType === "cte") return "Leitura de CT-e ainda não disponível — revisar manualmente";
  const document = docType === "nfe" ? await parseNFeXml(xml) : await parseNFSeNacionalXml(xml);
  return { document, method: "xml", extractorConfidence: 1, uncertainFields: [], costMicros: 0 };
}

export async function runPipeline(
  buf: Buffer,
  companyDocument: string | null,
  deps: PipelineDeps = {}
): Promise<PipelineOutcome> {
  const c = classify(buf);
  if (c.route === "ignore") return { kind: "ignored", reason: c.reason };
  if (c.route === "unsupported") return { kind: "failed", reason: c.reason, retryable: false };

  let extraction: ExtractionResult;
  let mediaType: string;
  try {
    if (c.route === "xml") {
      mediaType = "application/xml";
      const r = await extractXml(buf, c.docType);
      if (typeof r === "string") return { kind: "failed", reason: r, retryable: false };
      extraction = r;
    } else {
      mediaType = c.mediaType;
      extraction = await (deps.extractWithLlm ?? extractWithLlm)(buf, c.mediaType, deps.llmOptions);
    }
  } catch (err) {
    if (err instanceof LlmExtractionError) return { kind: "failed", reason: err.message, retryable: err.retryable };
    return { kind: "failed", reason: `Falha ao ler o documento: ${(err as Error).message}`, retryable: false };
  }

  const issues = validateDocument(extraction.document, {
    companyDocument,
    method: extraction.method,
    today: deps.today,
  });
  const decision = decide(extraction, issues);
  return { kind: "extracted", docType: extraction.document.docType, mediaType, extraction, issues, decision };
}
