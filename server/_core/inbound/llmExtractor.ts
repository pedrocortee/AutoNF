/**
 * PDF/image → ExtractedDocument via Claude structured outputs.
 *
 * The LLM schema is deliberately loose (plain strings/numbers, amounts in reais):
 * format rules (CNPJ checksum, date shape, access key) are enforced afterwards by
 * normalize() + validators.ts, never trusted from the model.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod/v4";
import {
  ACCESS_KEY_44,
  ACCESS_KEY_50,
  DOC_TYPES,
  emptyDocument,
  type ExtractedDocument,
  type ExtractionResult,
} from "./schemas";

export const DEFAULT_MODEL = "claude-opus-5";

/** USD per 1M tokens (input, output). Used only for cost tracking. */
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

const money = z.number().nullable();
const str = z.string().nullable();

const llmSchema = z.object({
  docType: z.enum(DOC_TYPES),
  number: str,
  series: str,
  accessKey: str,
  issueDate: str,
  dueDate: str,
  issuerDocument: str,
  issuerName: str,
  recipientDocument: str,
  recipientName: str,
  totalAmount: money,
  items: z.array(
    z.object({
      description: z.string(),
      quantity: z.number().nullable(),
      unitPrice: money,
      total: z.number(),
      ncm: str,
      cfop: str,
    })
  ),
  taxes: z.object({
    icms: money,
    ipi: money,
    pis: money,
    cofins: money,
    iss: money,
    ibs: money,
    cbs: money,
  }),
  digitableLine: str,
  bankName: str,
  serviceDescription: str,
  confidence: z.number(),
  uncertainFields: z.array(z.string()),
});
export type LlmOutput = z.infer<typeof llmSchema>;

const SYSTEM_PROMPT = `Você extrai dados de documentos fiscais e financeiros brasileiros (NFS-e municipal, DANFE, boleto, extrato, recibo) para lançamento contábil.

Regras:
- Copie os valores exatamente como aparecem no documento. Se um campo não aparece ou está ilegível, use null. Nunca estime, calcule ou complete um valor ausente.
- CNPJ/CPF, chave de acesso e linha digitável: apenas os caracteres, sem pontuação. O CNPJ pode ser alfanumérico (letras maiúsculas nas 12 primeiras posições).
- Datas no formato AAAA-MM-DD. Valores em reais como número decimal (1.234,56 → 1234.56).
- "issuer" é quem emite o documento ou recebe o pagamento (prestador, fornecedor, cedente/beneficiário). "recipient" é quem toma o serviço, compra ou paga (tomador, destinatário, sacado/pagador).
- docType: nfse (nota de serviço), nfe (DANFE de produto), cte (DACTE), boleto, extrato, recibo ou outro.
- Em items, liste as linhas de produto/serviço; para NFS-e com um único serviço, um item com o valor do serviço.
- confidence: de 0 a 1, o quanto você confia que todos os campos preenchidos estão corretos (baixe se a imagem estiver ruim, cortada ou manuscrita).
- uncertainFields: nomes dos campos que você leu com dúvida (ex.: "totalAmount", "issuerDocument").`;

export interface LlmExtractorOptions {
  client?: Pick<Anthropic, "beta">;
  model?: string;
}

function toCents(v: number | null): number | null {
  return v === null || !Number.isFinite(v) ? null : Math.round(v * 100);
}

function cleanDocument(v: string | null): string | null {
  if (!v) return null;
  const s = v.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  return /^(\d{11}|[0-9A-Z]{12}\d{2})$/.test(s) ? s : null;
}

function cleanDate(v: string | null): string | null {
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null;
}

/** Maps loose LLM output onto the strict document model; anything malformed becomes null + uncertain. */
export function normalize(out: LlmOutput): { document: ExtractedDocument; uncertain: string[] } {
  const uncertain = new Set(out.uncertainFields);
  const doc = emptyDocument(out.docType);

  const mark = <T>(field: string, raw: unknown, cleaned: T | null): T | null => {
    if (raw !== null && raw !== undefined && raw !== "" && cleaned === null) uncertain.add(field);
    return cleaned;
  };

  doc.number = out.number;
  doc.series = out.series;
  const key = out.accessKey?.replace(/\s/g, "").toUpperCase() ?? null;
  doc.accessKey = mark("accessKey", key, key && (ACCESS_KEY_44.test(key) || ACCESS_KEY_50.test(key)) ? key : null);
  doc.issueDate = mark("issueDate", out.issueDate, cleanDate(out.issueDate));
  doc.dueDate = mark("dueDate", out.dueDate, cleanDate(out.dueDate));
  doc.issuer = {
    document: mark("issuerDocument", out.issuerDocument, cleanDocument(out.issuerDocument)),
    name: out.issuerName,
  };
  doc.recipient = {
    document: mark("recipientDocument", out.recipientDocument, cleanDocument(out.recipientDocument)),
    name: out.recipientName,
  };
  doc.totalCents = toCents(out.totalAmount);
  doc.items = out.items.map((it) => ({
    description: it.description,
    quantity: it.quantity,
    unitValueCents: toCents(it.unitPrice),
    totalCents: toCents(it.total) ?? 0,
    ncm: it.ncm,
    cfop: it.cfop,
  }));
  doc.taxes = {
    icmsCents: toCents(out.taxes.icms),
    ipiCents: toCents(out.taxes.ipi),
    pisCents: toCents(out.taxes.pis),
    cofinsCents: toCents(out.taxes.cofins),
    issCents: toCents(out.taxes.iss),
    ibsCents: toCents(out.taxes.ibs),
    cbsCents: toCents(out.taxes.cbs),
  };
  if (out.docType === "boleto" || out.digitableLine) {
    const line = out.digitableLine?.replace(/\D/g, "") ?? null;
    doc.boleto = {
      digitableLine: mark("digitableLine", out.digitableLine, line && /^(\d{47}|\d{48})$/.test(line) ? line : null),
      bankName: out.bankName,
    };
  }
  doc.serviceDescription = out.serviceDescription;

  return { document: doc, uncertain: [...uncertain] };
}

function costMicros(model: string, usage: Anthropic.Beta.BetaUsage): number {
  const p = PRICING[model] ?? PRICING[DEFAULT_MODEL];
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  // USD per 1M tokens == micro-dollars per token
  return Math.round(
    usage.input_tokens * p.input + cacheRead * p.input * 0.1 + cacheWrite * p.input * 1.25 + usage.output_tokens * p.output
  );
}

export class LlmExtractionError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
  }
}

export async function extractWithLlm(
  file: Buffer,
  mediaType: "application/pdf" | "image/png" | "image/jpeg",
  opts: LlmExtractorOptions = {}
): Promise<ExtractionResult> {
  const client = opts.client ?? new Anthropic();
  const model = opts.model ?? process.env.INBOUND_LLM_MODEL ?? DEFAULT_MODEL;
  const data = file.toString("base64");

  const source: Anthropic.Beta.BetaContentBlockParam =
    mediaType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
      : { type: "image", source: { type: "base64", media_type: mediaType, data } };

  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM_PROMPT,
      output_config: { format: zodOutputFormat(llmSchema) },
      messages: [{ role: "user", content: [source, { type: "text", text: "Extraia os dados deste documento." }] }],
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError || err instanceof Anthropic.APIConnectionError) {
      throw new LlmExtractionError(`Falha temporária na IA: ${err.message}`, true);
    }
    if (err instanceof Anthropic.APIError) {
      throw new LlmExtractionError(`Erro da API de IA (${err.status}): ${err.message}`, false);
    }
    throw err;
  }

  const cost = costMicros(response.model, response.usage);

  if (response.stop_reason === "refusal") {
    throw new LlmExtractionError("A IA recusou processar este documento", false);
  }
  if (response.stop_reason === "max_tokens") {
    throw new LlmExtractionError("Resposta da IA truncada (documento grande demais)", false);
  }

  const text = response.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")?.text;
  const parsed = text ? llmSchema.safeParse(JSON.parse(text)) : null;
  if (!parsed?.success) {
    throw new LlmExtractionError("Resposta da IA fora do formato esperado", false);
  }

  const { document, uncertain } = normalize(parsed.data);
  return {
    document,
    method: "llm",
    extractorConfidence: Math.max(0, Math.min(1, parsed.data.confidence)),
    uncertainFields: uncertain,
    costMicros: cost,
  };
}
