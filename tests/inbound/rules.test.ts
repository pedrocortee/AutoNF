import { describe, expect, it } from "vitest";
import { classify, renderHistory, ruleMatches, type RuleLike } from "../../server/_core/inbound/rules";
import { parseCompanyLine } from "../../server/_core/inbound/companyImport";
import { toCsv } from "../../server/_core/inbound/exporter";
import { validateDocument } from "../../server/_core/inbound/validators";
import { parseNFeXml } from "../../server/_core/inbound/xml/nfeParser";
import { parseNFSeNacionalXml } from "../../server/_core/inbound/xml/nfseParser";
import { ALNUM_CNPJ, OFFICE_CLIENT_CNPJ, SUPPLIER_CNPJ, nfeProcXml, nfseNacionalXml } from "./fixtures";

let seq = 0;
const rule = (over: Partial<RuleLike>): RuleLike => ({
  id: ++seq,
  name: `r${seq}`,
  companyId: null,
  matchIssuerDocument: null,
  matchDocType: null,
  matchKeyword: null,
  account: "0000",
  costCenter: null,
  historyTemplate: null,
  priority: 100,
  active: true,
  ...over,
});

describe("rules", () => {
  it("matches by issuer, type and keyword (accent and case insensitive)", async () => {
    const doc = await parseNFSeNacionalXml(nfseNacionalXml()); // "Suporte técnico em TI"
    expect(ruleMatches(rule({ matchIssuerDocument: SUPPLIER_CNPJ }), doc, 1)).toBe(true);
    expect(ruleMatches(rule({ matchDocType: "nfse" }), doc, 1)).toBe(true);
    expect(ruleMatches(rule({ matchKeyword: "SUPORTE TECNICO" }), doc, 1)).toBe(true);
    expect(ruleMatches(rule({ matchKeyword: "aluguel" }), doc, 1)).toBe(false);
    expect(ruleMatches(rule({ matchDocType: "nfe" }), doc, 1)).toBe(false);
  });

  it("never matches a rule without criteria, inactive rules or another company's rules", async () => {
    const doc = await parseNFeXml(nfeProcXml());
    expect(ruleMatches(rule({}), doc, 1)).toBe(false);
    expect(ruleMatches(rule({ matchDocType: "nfe", active: false }), doc, 1)).toBe(false);
    expect(ruleMatches(rule({ matchDocType: "nfe", companyId: 2 }), doc, 1)).toBe(false);
  });

  it("prefers lower priority, then the most specific rule", async () => {
    const doc = await parseNFeXml(nfeProcXml());
    const generic = rule({ matchDocType: "nfe", account: "GENERICA" });
    const bySupplier = rule({ matchIssuerDocument: SUPPLIER_CNPJ, account: "FORNECEDOR" });
    const companySpecific = rule({ matchIssuerDocument: SUPPLIER_CNPJ, companyId: 7, account: "EMPRESA" });
    expect(classify(doc, 1, [generic, bySupplier])?.account).toBe("FORNECEDOR");
    expect(classify(doc, 7, [generic, bySupplier, companySpecific])?.account).toBe("EMPRESA");
    const urgent = rule({ matchDocType: "nfe", account: "PRIORITARIA", priority: 10 });
    expect(classify(doc, 7, [generic, bySupplier, companySpecific, urgent])?.account).toBe("PRIORITARIA");
    expect(classify(doc, 1, [])).toBeNull();
  });

  it("renders the history template", async () => {
    const doc = await parseNFeXml(nfeProcXml());
    expect(renderHistory("Compra {tipo} {numero} de {emitente} em {emissao} — R$ {valor} {desconhecido}", doc)).toBe(
      "Compra NF-e 1234 de Distribuidora Exemplo Ltda em 20/09/2026 — R$ 110,00 {desconhecido}"
    );
  });
});

describe("parseCompanyLine", () => {
  it("parses ; tab and comma separated lines", () => {
    expect(parseCompanyLine("12.345.678/0001-95;Consultoria Exemplo;C01")).toEqual({ ok: true, document: SUPPLIER_CNPJ, name: "Consultoria Exemplo", externalCode: "C01" });
    expect(parseCompanyLine(`${OFFICE_CLIENT_CNPJ}\tCliente SA`)).toMatchObject({ ok: true, externalCode: null });
    expect(parseCompanyLine("12ABC34501DE35, Nova Empresa")).toMatchObject({ ok: true, document: ALNUM_CNPJ });
  });

  it("keeps commas inside names when ; is the separator", () => {
    expect(parseCompanyLine("12345678000195;Silva, Souza Ltda")).toMatchObject({ ok: true, name: "Silva, Souza Ltda" });
  });

  it("rejects invalid documents, flags header rows and missing names", () => {
    expect(parseCompanyLine("12345678000196;X Ltda")).toMatchObject({ ok: false, reason: "CNPJ/CPF inválido" });
    expect(parseCompanyLine("CNPJ;Razão social")).toMatchObject({ ok: false, header: true });
    expect(parseCompanyLine("12345678000195;")).toMatchObject({ ok: false, reason: "Razão social ausente" });
  });
});

describe("multi-company validation and export", () => {
  it("accepts a recipient that is any registered company", async () => {
    const doc = await parseNFeXml(nfeProcXml());
    const ctx = { method: "xml" as const, today: "2026-09-26" };
    expect(validateDocument(doc, { ...ctx, companyDocuments: ["11222333000181", OFFICE_CLIENT_CNPJ] })).toEqual([]);
    const issues = validateDocument(doc, { ...ctx, companyDocuments: ["11222333000181", ALNUM_CNPJ] });
    expect(issues[0]).toMatchObject({ code: "recipient_mismatch", message: "Destinatário não é nenhuma das empresas cadastradas" });
  });

  it("writes company and booking columns", async () => {
    const doc = await parseNFeXml(nfeProcXml());
    const csv = toCsv([
      {
        id: 3,
        status: "aprovado",
        method: "xml",
        document: doc,
        company: { document: OFFICE_CLIENT_CNPJ, name: "Cliente SA", externalCode: "C77" },
        classification: { ruleId: 1, ruleName: "Compras", account: "3.1.01", costCenter: "ADM", history: "Compra NF 1234" },
      },
    ]);
    const [header, row] = csv.slice(1).split("\r\n");
    const cols = header.split(";");
    const values = row.split(";");
    const at = (name: string) => values[cols.indexOf(name)];
    expect(at("Empresa (CNPJ/CPF)")).toBe(OFFICE_CLIENT_CNPJ);
    expect(at("Código da empresa")).toBe("C77");
    expect(at("Conta")).toBe("3.1.01");
    expect(at("Centro de custo")).toBe("ADM");
    expect(at("Histórico")).toBe("Compra NF 1234");
    expect(at("Regra")).toBe("Compras");
  });
});
