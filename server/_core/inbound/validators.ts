/**
 * Business validation for extracted inbound documents.
 * Never mutates the document — returns issues for the review queue.
 */

import {
  cnpjFromAccessKey,
  isValidAccessKey44,
  isValidDocument,
  parseDigitableLine,
} from "./checksums";
import type { ExtractedDocument, ExtractionMethod, ValidationIssue } from "./schemas";

export interface ValidationContext {
  /** CNPJ/CPF of the company that owns this inbox (the expected recipient) */
  companyDocument: string | null;
  method: ExtractionMethod;
  /** Reference "today" (injectable for tests), ISO date */
  today?: string;
}

const FISCAL_TYPES = new Set(["nfe", "cte", "nfse"]);
const FIVE_YEARS_DAYS = 5 * 365;

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

export function validateDocument(doc: ExtractedDocument, ctx: ValidationContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (severity: ValidationIssue["severity"], code: string, field: string | null, message: string) =>
    issues.push({ severity, code, field, message });
  const today = ctx.today ?? new Date().toISOString().slice(0, 10);

  // ── Parties ────────────────────────────────────────────────────────────────
  if (!doc.issuer.document) {
    add("error", "issuer_missing", "issuer.document", "CNPJ/CPF do emitente não encontrado");
  } else if (!isValidDocument(doc.issuer.document)) {
    add("error", "issuer_invalid", "issuer.document", "CNPJ/CPF do emitente com dígito verificador inválido");
  }

  if (FISCAL_TYPES.has(doc.docType)) {
    if (!doc.recipient.document) {
      add("error", "recipient_missing", "recipient.document", "CNPJ/CPF do destinatário não encontrado");
    } else if (ctx.companyDocument && doc.recipient.document !== ctx.companyDocument) {
      add("error", "recipient_mismatch", "recipient.document", "Documento não é destinado a esta empresa");
    }
  }

  // ── Value ──────────────────────────────────────────────────────────────────
  if (doc.totalCents === null) {
    add("error", "total_missing", "totalCents", "Valor total não encontrado");
  } else if (doc.totalCents <= 0) {
    add("error", "total_non_positive", "totalCents", "Valor total deve ser maior que zero");
  }

  // Items vs total is only checked for LLM output: in NF-e XML the total legitimately
  // differs from the sum of items (frete, desconto, IPI, ST…) and the XML is authoritative.
  if (ctx.method === "llm" && doc.items.length > 0 && doc.totalCents !== null) {
    const sum = doc.items.reduce((acc, it) => acc + it.totalCents, 0);
    if (Math.abs(sum - doc.totalCents) > 1) {
      add("warning", "items_total_mismatch", "items", `Soma dos itens (${sum}) difere do total (${doc.totalCents})`);
    }
  }

  // ── Dates ──────────────────────────────────────────────────────────────────
  if (!doc.issueDate) {
    if (doc.docType !== "boleto") add("error", "issue_date_missing", "issueDate", "Data de emissão não encontrada");
  } else {
    if (doc.issueDate > today) add("error", "issue_date_future", "issueDate", "Data de emissão no futuro");
    if (daysBetween(doc.issueDate, today) > FIVE_YEARS_DAYS) {
      add("warning", "issue_date_old", "issueDate", "Documento com mais de 5 anos");
    }
  }
  if (doc.issueDate && doc.dueDate && doc.dueDate < doc.issueDate) {
    add("warning", "due_before_issue", "dueDate", "Vencimento anterior à emissão");
  }

  // ── Access key ─────────────────────────────────────────────────────────────
  if ((doc.docType === "nfe" || doc.docType === "cte") && ctx.method === "xml") {
    if (!doc.accessKey) {
      add("error", "access_key_missing", "accessKey", "Chave de acesso não encontrada");
    }
  }
  if (doc.accessKey && doc.accessKey.length === 44) {
    if (!isValidAccessKey44(doc.accessKey)) {
      add("error", "access_key_invalid", "accessKey", "Chave de acesso com dígito verificador inválido");
    } else if (doc.issuer.document && doc.issuer.document.length === 14 && cnpjFromAccessKey(doc.accessKey) !== doc.issuer.document) {
      add("error", "access_key_issuer_mismatch", "accessKey", "CNPJ da chave de acesso difere do emitente");
    }
  }

  // ── Boleto ─────────────────────────────────────────────────────────────────
  if (doc.docType === "boleto") {
    const line = doc.boleto?.digitableLine ?? null;
    if (!line) {
      add("error", "boleto_line_missing", "boleto.digitableLine", "Linha digitável não encontrada");
    } else {
      const info = parseDigitableLine(line);
      if (!info || !info.valid) {
        add("error", "boleto_line_invalid", "boleto.digitableLine", "Linha digitável com dígito verificador inválido");
      } else {
        if (info.amountCents !== null && doc.totalCents !== null && info.amountCents !== doc.totalCents) {
          add("error", "boleto_amount_mismatch", "totalCents", "Valor do boleto difere do valor na linha digitável");
        }
        if (info.dueDate && doc.dueDate && info.dueDate !== doc.dueDate) {
          add("warning", "boleto_due_mismatch", "dueDate", "Vencimento difere do codificado na linha digitável");
        }
      }
    }
    if (!doc.dueDate) add("warning", "boleto_due_missing", "dueDate", "Vencimento não encontrado");
  }

  return issues;
}

/**
 * Document numbers written differently by different sources ("2026/000874" in the PDF,
 * "874" in the XML) are the same when their digit strings, without leading zeros, are
 * equal or one ends with the other. Missing numbers never match.
 */
export function sameDocumentNumber(a: string | null, b: string | null): boolean {
  const norm = (v: string | null) => (v ?? "").replace(/\D/g, "").replace(/^0+/, "");
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  return x === y || x.endsWith(y) || y.endsWith(x);
}
