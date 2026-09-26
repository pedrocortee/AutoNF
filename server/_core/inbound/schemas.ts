/**
 * Inbound document model — single source of truth for parsers, LLM extraction,
 * validation and the review UI.
 *
 * Monetary values are integer cents. Dates are ISO "YYYY-MM-DD".
 */

import { z } from "zod";

export const DOC_TYPES = ["nfe", "cte", "nfse", "boleto", "extrato", "recibo", "outro"] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const EXTRACTION_METHODS = ["xml", "llm"] as const;
export type ExtractionMethod = (typeof EXTRACTION_METHODS)[number];

/** NF-e/CT-e: cUF(2) AAMM(4) CNPJ(12 alfanum + 2) mod(2) série(3) número(9) tpEmis(1) cNF(8) DV(1) */
export const ACCESS_KEY_44 = /^\d{6}[0-9A-Z]{12}\d{26}$/;
/** NFS-e padrão nacional */
export const ACCESS_KEY_50 = /^[0-9A-Z]{50}$/;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve estar em YYYY-MM-DD");

export const partySchema = z.object({
  /** CPF (11 digits) or CNPJ (14 chars: numeric or alphanumeric, IN RFB 2.229/2024), no punctuation */
  document: z.string().regex(/^(\d{11}|[0-9A-Z]{12}\d{2})$/).nullable(),
  name: z.string().nullable(),
});
export type Party = z.infer<typeof partySchema>;

export const lineItemSchema = z.object({
  description: z.string(),
  quantity: z.number().nullable(),
  unitValueCents: z.number().int().nullable(),
  totalCents: z.number().int(),
  ncm: z.string().nullable(),
  cfop: z.string().nullable(),
});
export type LineItem = z.infer<typeof lineItemSchema>;

export const taxesSchema = z.object({
  icmsCents: z.number().int().nullable(),
  ipiCents: z.number().int().nullable(),
  pisCents: z.number().int().nullable(),
  cofinsCents: z.number().int().nullable(),
  issCents: z.number().int().nullable(),
  ibsCents: z.number().int().nullable(),
  cbsCents: z.number().int().nullable(),
});
export type Taxes = z.infer<typeof taxesSchema>;

export const boletoSchema = z.object({
  /** Linha digitável, digits only (47 for bank slips, 48 for utility bills) */
  digitableLine: z.string().regex(/^(\d{47}|\d{48})$/).nullable(),
  bankName: z.string().nullable(),
});

export const extractedDocumentSchema = z.object({
  docType: z.enum(DOC_TYPES),
  number: z.string().nullable(),
  series: z.string().nullable(),
  /** Chave de acesso (NF-e/CT-e: 44; NFS-e nacional: 50) */
  accessKey: z
    .string()
    .refine((k) => ACCESS_KEY_44.test(k) || ACCESS_KEY_50.test(k), "Chave de acesso inválida")
    .nullable(),
  issueDate: isoDate.nullable(),
  dueDate: isoDate.nullable(),
  issuer: partySchema,
  recipient: partySchema,
  totalCents: z.number().int().nullable(),
  items: z.array(lineItemSchema),
  taxes: taxesSchema,
  boleto: boletoSchema.nullable(),
  serviceDescription: z.string().nullable(),
});
export type ExtractedDocument = z.infer<typeof extractedDocumentSchema>;

export const emptyTaxes = (): Taxes => ({
  icmsCents: null,
  ipiCents: null,
  pisCents: null,
  cofinsCents: null,
  issCents: null,
  ibsCents: null,
  cbsCents: null,
});

export const emptyDocument = (docType: DocType): ExtractedDocument => ({
  docType,
  number: null,
  series: null,
  accessKey: null,
  issueDate: null,
  dueDate: null,
  issuer: { document: null, name: null },
  recipient: { document: null, name: null },
  totalCents: null,
  items: [],
  taxes: emptyTaxes(),
  boleto: null,
  serviceDescription: null,
});

// ---------------------------------------------------------------------------
// Validation issues and processing result
// ---------------------------------------------------------------------------

export const ISSUE_SEVERITIES = ["error", "warning"] as const;

export const validationIssueSchema = z.object({
  code: z.string(),
  field: z.string().nullable(),
  severity: z.enum(ISSUE_SEVERITIES),
  message: z.string(),
});
export type ValidationIssue = z.infer<typeof validationIssueSchema>;

export interface ExtractionResult {
  document: ExtractedDocument;
  method: ExtractionMethod;
  /** 0..1 — how much the extractor itself trusts the result (XML = 1) */
  extractorConfidence: number;
  /** Fields the extractor flagged as uncertain */
  uncertainFields: string[];
  /** LLM cost in millionths of a US dollar (0 for XML) */
  costMicros: number;
}
