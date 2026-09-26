/**
 * Cheap, deterministic classification by content — no LLM.
 * XML is identified by root element; PDFs and images are routed to LLM extraction.
 */

import type { DocType } from "./schemas";

export type Classification =
  | { route: "xml"; docType: Extract<DocType, "nfe" | "cte" | "nfse"> }
  | { route: "llm"; mediaType: "application/pdf" | "image/png" | "image/jpeg" }
  | { route: "ignore"; reason: string }
  | { route: "unsupported"; reason: string };

function sniffMediaType(buf: Buffer): "application/pdf" | "image/png" | "image/jpeg" | "xml" | null {
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (buf[0] === 0x89 && buf.subarray(1, 4).toString("latin1") === "PNG") return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  const head = buf.subarray(0, 512).toString("utf8").replace(/^﻿/, "").trimStart();
  if (head.startsWith("<")) return "xml";
  return null;
}

/** Root element local name, skipping the XML declaration and comments. */
function xmlRoot(buf: Buffer): string | null {
  const head = buf.subarray(0, 4096).toString("utf8");
  const m = head.replace(/<\?[\s\S]*?\?>/g, "").replace(/<!--[\s\S]*?-->/g, "").match(/<\s*(?:[\w-]+:)?([\w-]+)/);
  return m ? m[1] : null;
}

export function classify(buf: Buffer): Classification {
  const media = sniffMediaType(buf);
  if (!media) return { route: "unsupported", reason: "Formato de arquivo não reconhecido" };
  if (media !== "xml") return { route: "llm", mediaType: media };

  const root = xmlRoot(buf);
  switch (root) {
    case "nfeProc":
    case "NFe":
      return { route: "xml", docType: "nfe" };
    case "cteProc":
    case "CTe":
      return { route: "xml", docType: "cte" };
    case "NFSe":
    case "DPS":
      return { route: "xml", docType: "nfse" };
    // Events and summaries from SEFAZ distribution: not documents to book
    case "procEventoNFe":
    case "resEvento":
    case "procEventoCTe":
      return { route: "ignore", reason: "Evento fiscal (não é documento)" };
    case "resNFe":
      return { route: "ignore", reason: "Resumo de NF-e — aguardando XML completo" };
    default:
      return { route: "unsupported", reason: `XML não suportado (raiz <${root ?? "?"}>)` };
  }
}
