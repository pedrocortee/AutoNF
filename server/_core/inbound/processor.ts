/**
 * Persists the pipeline result for one inbound document. Called by the queue worker.
 */

import { getCompanyConfig } from "../../db";
import {
  findActiveByAccessKey,
  getInboundDocument,
  transitionInbound,
  updateInboundDocument,
} from "../../inboundDb";
import { readObject } from "../storage";
import { runPipeline, type PipelineDeps } from "./pipeline";

export class RetryableProcessingError extends Error {}

export async function processInboundDocument(documentId: number, deps: PipelineDeps = {}): Promise<void> {
  const doc = await getInboundDocument(documentId);
  if (!doc) throw new Error(`Inbound document ${documentId} not found`);
  // Idempotent: a retried job must not reprocess a document a person already touched
  if (doc.status !== "recebido" && doc.status !== "processando") return;

  if (doc.status === "recebido") await transitionInbound(documentId, "processando");

  const buf = await readObject(doc.storageKey);
  if (!buf) {
    await transitionInbound(documentId, "erro", { patch: { errorMessage: "Arquivo original não encontrado no storage" } });
    return;
  }

  const company = await getCompanyConfig(doc.userId);
  const outcome = await runPipeline(buf, company?.cnpj ?? null, deps);

  if (outcome.kind === "ignored") {
    await transitionInbound(documentId, "descartado", { note: outcome.reason });
    return;
  }
  if (outcome.kind === "failed") {
    if (outcome.retryable) throw new RetryableProcessingError(outcome.reason);
    await transitionInbound(documentId, "erro", { note: outcome.reason, patch: { errorMessage: outcome.reason } });
    return;
  }

  const { extraction, issues, decision } = outcome;
  const d = extraction.document;
  await updateInboundDocument(documentId, {
    docType: d.docType,
    accessKey: d.accessKey,
    issuerDocument: d.issuer.document,
    issuerName: d.issuer.name,
    recipientDocument: d.recipient.document,
    issueDate: d.issueDate,
    dueDate: d.dueDate,
    totalCents: d.totalCents,
    extracted: d,
    originalExtracted: d,
    issues,
    reviewReasons: decision.reasons,
    confidence: decision.score.toFixed(2),
    method: extraction.method,
    llmCostMicros: extraction.costMicros,
    errorMessage: null,
  });

  if (d.accessKey) {
    const original = await findActiveByAccessKey(doc.userId, d.accessKey, documentId);
    if (original) {
      await transitionInbound(documentId, "descartado", {
        note: `Duplicado do documento #${original.id} (mesma chave de acesso)`,
        patch: { duplicateOfId: original.id },
      });
      return;
    }
  }

  await transitionInbound(documentId, decision.status, {
    note: decision.status === "aprovado" ? "Aprovado automaticamente" : decision.reasons.join("; "),
  });
}
