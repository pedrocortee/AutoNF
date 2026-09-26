/**
 * Booking rules: pick the account / cost center / history for a document.
 * Pure — the caller loads the rules. First match wins after ordering by
 * priority, then specificity (company-specific before global, more matchers first).
 */

import type { ExtractedDocument } from "./schemas";

export interface RuleLike {
  id: number;
  name: string;
  companyId: number | null;
  matchIssuerDocument: string | null;
  matchDocType: string | null;
  matchKeyword: string | null;
  account: string;
  costCenter: string | null;
  historyTemplate: string | null;
  priority: number;
  active: boolean;
}

export interface Classification {
  ruleId: number;
  ruleName: string;
  account: string;
  costCenter: string | null;
  history: string | null;
}

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function specificity(r: RuleLike): number {
  return (r.companyId !== null ? 8 : 0) + (r.matchIssuerDocument ? 4 : 0) + (r.matchKeyword ? 2 : 0) + (r.matchDocType ? 1 : 0);
}

export function ruleMatches(rule: RuleLike, doc: ExtractedDocument, companyId: number | null): boolean {
  if (!rule.active) return false;
  if (rule.companyId !== null && rule.companyId !== companyId) return false;
  // A rule with no matcher at all would swallow every document — never match
  if (!rule.matchIssuerDocument && !rule.matchDocType && !rule.matchKeyword) return false;
  if (rule.matchIssuerDocument && rule.matchIssuerDocument !== doc.issuer.document) return false;
  if (rule.matchDocType && rule.matchDocType !== doc.docType) return false;
  if (rule.matchKeyword) {
    const haystack = normalize(
      [doc.issuer.name, doc.serviceDescription, ...doc.items.map((i) => i.description)].filter(Boolean).join(" \n ")
    );
    if (!haystack.includes(normalize(rule.matchKeyword))) return false;
  }
  return true;
}

function brDate(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function brMoney(cents: number | null): string {
  if (cents === null) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

const DOC_LABEL: Record<string, string> = { nfe: "NF-e", cte: "CT-e", nfse: "NFS-e", boleto: "Boleto", extrato: "Extrato", recibo: "Recibo", outro: "Documento" };

export function renderHistory(template: string, doc: ExtractedDocument): string {
  const vars: Record<string, string> = {
    emitente: doc.issuer.name ?? "",
    cnpj_emitente: doc.issuer.document ?? "",
    numero: doc.number ?? "",
    tipo: DOC_LABEL[doc.docType] ?? doc.docType,
    emissao: brDate(doc.issueDate),
    vencimento: brDate(doc.dueDate),
    valor: brMoney(doc.totalCents),
  };
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k] : m)).replace(/\s+/g, " ").trim();
}

export function sortRules<T extends RuleLike>(rules: T[]): T[] {
  return [...rules].sort((a, b) => a.priority - b.priority || specificity(b) - specificity(a) || a.id - b.id);
}

export function classify(doc: ExtractedDocument, companyId: number | null, rules: RuleLike[]): Classification | null {
  const rule = sortRules(rules).find((r) => ruleMatches(r, doc, companyId));
  if (!rule) return null;
  return {
    ruleId: rule.id,
    ruleName: rule.name,
    account: rule.account,
    costCenter: rule.costCenter,
    history: rule.historyTemplate ? renderHistory(rule.historyTemplate, doc) : null,
  };
}
