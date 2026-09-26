import { parseStringPromise, processors } from "xml2js";

export type XmlNode = Record<string, unknown>;

/** Parses XML into plain objects: namespace prefixes stripped, single children not wrapped in arrays. */
export async function parseXml(xml: string): Promise<XmlNode> {
  return parseStringPromise(xml, {
    explicitArray: false,
    tagNameProcessors: [processors.stripPrefix],
    attrkey: "$",
    charkey: "_",
    trim: true,
  });
}

/** Walks a dotted path ("NFe.infNFe.ide.nNF"). Returns undefined if any step is missing. */
export function at(node: unknown, path: string): unknown {
  let cur: unknown = node;
  for (const key of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as XmlNode)[key];
  }
  return cur;
}

/** Text value of a leaf (handles elements that carry attributes: { _: "text", $: {...} }). */
export function text(node: unknown, path?: string): string | null {
  const v = path ? at(node, path) : node;
  if (v === undefined || v === null) return null;
  if (typeof v === "string") return v === "" ? null : v;
  if (typeof v === "number") return String(v);
  if (typeof v === "object" && "_" in (v as XmlNode)) return text((v as XmlNode)._);
  return null;
}

export function attr(node: unknown, path: string, name: string): string | null {
  const v = at(node, path);
  if (!v || typeof v !== "object") return null;
  const attrs = (v as XmlNode).$ as Record<string, string> | undefined;
  return attrs?.[name] ?? null;
}

export function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

/** "1234.56" → 123456. Returns null for missing/invalid values. */
export function toCents(value: string | null): number | null {
  if (value === null) return null;
  const n = Number(value.replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export function toNumber(value: string | null): number | null {
  if (value === null) return null;
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** "2026-09-26T10:00:00-03:00" or "2026-09-26" → "2026-09-26" */
export function toIsoDate(value: string | null): string | null {
  if (!value) return null;
  const m = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/** First non-empty CNPJ/CPF under a party node */
export function partyDocument(node: unknown): string | null {
  const raw = text(node, "CNPJ") ?? text(node, "CPF");
  return raw ? raw.replace(/[^0-9A-Za-z]/g, "").toUpperCase() : null;
}
