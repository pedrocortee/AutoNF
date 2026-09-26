/**
 * Parses pasted company lists: "CNPJ;Razão social;Código". Separator is ";" or tab;
 * comma is used only when the line has neither (so "Silva, Souza Ltda" survives).
 */

import { isValidDocument } from "./checksums";

export type ParsedCompanyLine =
  | { ok: true; document: string; name: string; externalCode: string | null }
  | { ok: false; reason: string; header?: boolean };

export const cleanDocument = (v: string) => v.replace(/[^0-9A-Za-z]/g, "").toUpperCase();

export function parseCompanyLine(line: string): ParsedCompanyLine {
  const sep = /[;\t]/.test(line) ? /[;\t]/ : /,/;
  const [docRaw = "", nameRaw = "", codeRaw = ""] = line.split(sep).map((p) => p.trim());
  const document = cleanDocument(docRaw);
  if (!/^(\d{11}|[0-9A-Z]{12}\d{2})$/.test(document) || !isValidDocument(document)) {
    return { ok: false, reason: "CNPJ/CPF inválido", header: /cnpj|cpf|documento/i.test(docRaw) };
  }
  if (nameRaw.length < 2) return { ok: false, reason: "Razão social ausente" };
  return { ok: true, document, name: nameRaw.slice(0, 255), externalCode: codeRaw.slice(0, 40) || null };
}
