/**
 * Generic CSV export (Excel pt-BR friendly: ";" separator, decimal comma, UTF-8 BOM).
 * Accounting-system specific layouts will live in exporters/ (Fase D).
 */

import type { ExtractedDocument } from "./schemas";

export interface ExportRow {
  id: number;
  status: string;
  method: string | null;
  document: ExtractedDocument;
}

const DOC_TYPE_LABEL: Record<string, string> = {
  nfe: "NF-e",
  cte: "CT-e",
  nfse: "NFS-e",
  boleto: "Boleto",
  extrato: "Extrato",
  recibo: "Recibo",
  outro: "Outro",
};

function money(cents: number | null): string {
  if (cents === null) return "";
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

function brDate(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function cell(v: string | null | undefined): string {
  const s = v ?? "";
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const HEADER = [
  "ID", "Tipo", "Número", "Série", "Chave de acesso", "Emissão", "Vencimento",
  "CNPJ/CPF emitente", "Emitente", "CNPJ/CPF destinatário", "Destinatário",
  "Valor total", "ICMS", "IPI", "PIS", "COFINS", "ISS", "IBS", "CBS",
  "Linha digitável", "Descrição do serviço", "Leitura", "Status",
];

export function toCsv(rows: ExportRow[]): string {
  const lines = [HEADER.join(";")];
  for (const r of rows) {
    const d = r.document;
    lines.push(
      [
        String(r.id),
        DOC_TYPE_LABEL[d.docType] ?? d.docType,
        d.number,
        d.series,
        // Leading apostrophe-free: quote to stop Excel from turning 44-digit keys into scientific notation
        d.accessKey ? `="${d.accessKey}"` : "",
        brDate(d.issueDate),
        brDate(d.dueDate),
        d.issuer.document,
        d.issuer.name,
        d.recipient.document,
        d.recipient.name,
        money(d.totalCents),
        money(d.taxes.icmsCents),
        money(d.taxes.ipiCents),
        money(d.taxes.pisCents),
        money(d.taxes.cofinsCents),
        money(d.taxes.issCents),
        money(d.taxes.ibsCents),
        money(d.taxes.cbsCents),
        d.boleto?.digitableLine ? `="${d.boleto.digitableLine}"` : "",
        d.serviceDescription,
        r.method === "xml" ? "XML" : r.method === "llm" ? "IA" : "",
        r.status,
      ]
        .map((v) => (v?.startsWith('="') ? v : cell(v)))
        .join(";")
    );
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}
