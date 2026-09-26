/**
 * Decides whether a document can be approved without human review.
 *
 * Rule: auto-approve only when there are no issues at all, the extractor is confident
 * and flagged nothing. Anything else goes to review — a false "approved" costs far more
 * than a few seconds of review.
 */

import type { ExtractionResult, ValidationIssue } from "./schemas";

export const AUTO_APPROVE_THRESHOLD = 0.9;

export interface Decision {
  status: "aprovado" | "revisao";
  /** 0..1, shown in the UI */
  score: number;
  reasons: string[];
}

export function decide(result: ExtractionResult, issues: ValidationIssue[]): Decision {
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  const penalty = errors.length * 0.35 + warnings.length * 0.1 + result.uncertainFields.length * 0.05;
  const score = Math.max(0, Math.min(1, result.extractorConfidence - penalty));

  const reasons: string[] = [];
  if (errors.length) reasons.push(`${errors.length} erro(s) de validação`);
  if (warnings.length) reasons.push(`${warnings.length} alerta(s)`);
  if (result.uncertainFields.length) reasons.push(`Campos incertos: ${result.uncertainFields.join(", ")}`);
  if (result.extractorConfidence < AUTO_APPROVE_THRESHOLD) reasons.push("Confiança da extração abaixo do limite");

  const approved =
    errors.length === 0 &&
    warnings.length === 0 &&
    result.uncertainFields.length === 0 &&
    result.extractorConfidence >= AUTO_APPROVE_THRESHOLD;

  return { status: approved ? "aprovado" : "revisao", score: Math.round(score * 100) / 100, reasons };
}
