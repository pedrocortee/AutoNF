import { describe, expect, it, vi } from "vitest";
import { extractWithLlm, LlmExtractionError, normalize, type LlmOutput } from "../../server/_core/inbound/llmExtractor";
import { BOLETO_LINE_VALID, OFFICE_CLIENT_CNPJ, SUPPLIER_CNPJ } from "./fixtures";

const baseOutput = (over: Partial<LlmOutput> = {}): LlmOutput => ({
  docType: "nfse",
  number: "881",
  series: null,
  accessKey: null,
  issueDate: "2026-09-15",
  dueDate: null,
  issuerDocument: "12.345.678/0001-95",
  issuerName: "Consultoria Exemplo Ltda",
  recipientDocument: OFFICE_CLIENT_CNPJ,
  recipientName: "Cliente do Escritorio SA",
  totalAmount: 1234.56,
  items: [{ description: "Consultoria", quantity: 1, unitPrice: 1234.56, total: 1234.56, ncm: null, cfop: null }],
  taxes: { icms: null, ipi: null, pis: null, cofins: null, iss: 61.73, ibs: null, cbs: null },
  digitableLine: null,
  bankName: null,
  serviceDescription: "Consultoria",
  confidence: 0.95,
  uncertainFields: [],
  ...over,
});

function fakeClient(response: object) {
  const create = vi.fn().mockResolvedValue(response);
  return { client: { beta: { messages: { create } } } as never, create };
}

const okResponse = (out: LlmOutput, over: object = {}) => ({
  model: "claude-opus-5",
  stop_reason: "end_turn",
  content: [{ type: "text", text: JSON.stringify(out) }],
  usage: { input_tokens: 2000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  ...over,
});

describe("normalize", () => {
  it("strips punctuation, converts reais to cents", () => {
    const { document, uncertain } = normalize(baseOutput());
    expect(document.issuer.document).toBe(SUPPLIER_CNPJ);
    expect(document.totalCents).toBe(123456);
    expect(document.taxes.issCents).toBe(6173);
    expect(document.items[0].totalCents).toBe(123456);
    expect(uncertain).toEqual([]);
  });

  it("nulls malformed values and marks them uncertain", () => {
    const { document, uncertain } = normalize(baseOutput({ issuerDocument: "123", issueDate: "15/09/2026" }));
    expect(document.issuer.document).toBeNull();
    expect(document.issueDate).toBeNull();
    expect(uncertain).toEqual(expect.arrayContaining(["issuerDocument", "issueDate"]));
  });

  it("builds the boleto block from a formatted digitable line", () => {
    const formatted = "00190.50095 40144.816069 06809.350314 3 37370000000100";
    const { document } = normalize(baseOutput({ docType: "boleto", digitableLine: formatted, bankName: "BB" }));
    expect(document.boleto).toEqual({ digitableLine: BOLETO_LINE_VALID, bankName: "BB" });
  });
});

describe("extractWithLlm", () => {
  it("sends the PDF as a document block with structured output and fallbacks", async () => {
    const { client, create } = fakeClient(okResponse(baseOutput()));
    const result = await extractWithLlm(Buffer.from("%PDF-1.7"), "application/pdf", { client });

    const params = create.mock.calls[0][0];
    expect(params.model).toBe("claude-opus-5");
    expect(params.fallbacks).toBe("default");
    expect(params.betas).toContain("server-side-fallback-2026-07-01");
    expect(params.output_config.format.type).toBe("json_schema");
    expect(params.messages[0].content[0]).toMatchObject({ type: "document", source: { media_type: "application/pdf" } });

    expect(result.method).toBe("llm");
    expect(result.extractorConfidence).toBe(0.95);
    // 2000 × $5 + 500 × $25 per 1M tokens = 22 500 micro-dollars
    expect(result.costMicros).toBe(22500);
  });

  it("uses the model from INBOUND_LLM_MODEL when set", async () => {
    vi.stubEnv("INBOUND_LLM_MODEL", "claude-sonnet-5");
    const { client, create } = fakeClient(okResponse(baseOutput(), { model: "claude-sonnet-5" }));
    const result = await extractWithLlm(Buffer.from("x"), "image/png", { client });
    expect(create.mock.calls[0][0].model).toBe("claude-sonnet-5");
    expect(create.mock.calls[0][0].messages[0].content[0].type).toBe("image");
    expect(result.costMicros).toBe(2000 * 2 + 500 * 10);
    vi.unstubAllEnvs();
  });

  it("raises on refusal and on malformed output", async () => {
    const refusal = fakeClient(okResponse(baseOutput(), { stop_reason: "refusal", content: [] }));
    await expect(extractWithLlm(Buffer.from("x"), "application/pdf", { client: refusal.client })).rejects.toBeInstanceOf(LlmExtractionError);

    const bad = fakeClient(okResponse(baseOutput(), { content: [{ type: "text", text: '{"foo":1}' }] }));
    await expect(extractWithLlm(Buffer.from("x"), "application/pdf", { client: bad.client })).rejects.toThrow(/formato/);
  });
});

describe("extractWithLlm without credentials", () => {
  it("explains that the AI key is missing", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "");
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = { beta: { messages: { create: vi.fn().mockRejectedValue(new Anthropic.AnthropicError("Could not resolve authentication method")) } } } as never;
    await expect(extractWithLlm(Buffer.from("%PDF"), "application/pdf", { client })).rejects.toThrow(/chave da Anthropic/);
    vi.unstubAllEnvs();
  });
});
