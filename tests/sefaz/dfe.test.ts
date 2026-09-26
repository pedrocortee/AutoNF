import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import https from "https";
import type { AddressInfo } from "net";
import { gzipSync } from "zlib";
import { readA1Certificate } from "../../server/_core/sefaz/certificate";
import {
  buildDistRequest,
  distributeByNsu,
  padNsu,
  parseDistResponse,
  type DistResponse,
} from "../../server/_core/sefaz/dfeDistribution";
import { syncCompany, WAIT_MS, type SyncDeps } from "../../server/_core/sefaz/dfeSync";
import { NFE_KEY, OFFICE_CLIENT_CNPJ, SUPPLIER_CNPJ, nfeProcXml } from "../inbound/fixtures";
import { makeTestPki } from "./certs";

const RES_KEY = "43260912345678000195550010000055551000055556";

function resNFeXml(key = RES_KEY) {
  return `<resNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01"><chNFe>${key}</chNFe><CNPJ>${SUPPLIER_CNPJ}</CNPJ><xNome>Fornecedor Resumo Ltda</xNome><IE>123</IE><dhEmi>2026-09-21T09:00:00-03:00</dhEmi><tpNF>1</tpNF><vNF>250.50</vNF><digVal>x</digVal><dhRecbto>2026-09-21T09:00:05-03:00</dhRecbto><nProt>1</nProt><cSitNFe>1</cSitNFe></resNFe>`;
}

function docZip(nsu: number, schema: string, xml: string) {
  return `<docZip NSU="${padNsu(nsu)}" schema="${schema}">${gzipSync(Buffer.from(xml)).toString("base64")}</docZip>`;
}

function soapResponse(r: { cStat: string; xMotivo?: string; ultNSU: number; maxNSU: number; docs?: string[] }) {
  const lote = r.docs?.length ? `<loteDistDFeInt>${r.docs.join("")}</loteDistDFeInt>` : "";
  return `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body><nfeDistDFeInteresseResponse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe"><nfeDistDFeInteresseResult><retDistDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01"><tpAmb>2</tpAmb><verAplic>1.0</verAplic><cStat>${r.cStat}</cStat><xMotivo>${r.xMotivo ?? "ok"}</xMotivo><dhResp>2026-09-26T10:00:00-03:00</dhResp><ultNSU>${padNsu(r.ultNSU)}</ultNSU><maxNSU>${padNsu(r.maxNSU)}</maxNSU>${lote}</retDistDFeInt></nfeDistDFeInteresseResult></nfeDistDFeInteresseResponse></soap:Body></soap:Envelope>`;
}

describe("buildDistRequest", () => {
  it("builds the distNSU envelope for a CNPJ in homologation", () => {
    const xml = buildDistRequest({ env: "homologacao", ufCode: 43, document: OFFICE_CLIENT_CNPJ, lastNsu: "57" });
    expect(xml).toContain("<tpAmb>2</tpAmb><cUFAutor>43</cUFAutor>");
    expect(xml).toContain(`<CNPJ>${OFFICE_CLIENT_CNPJ}</CNPJ>`);
    expect(xml).toContain("<ultNSU>000000000000057</ultNSU>");
    expect(xml).toContain('versao="1.01"');
  });

  it("uses CPF for 11-digit documents and tpAmb 1 in production", () => {
    const xml = buildDistRequest({ env: "producao", ufCode: 35, document: "12345678909", lastNsu: "0" });
    expect(xml).toContain("<tpAmb>1</tpAmb>");
    expect(xml).toContain("<CPF>12345678909</CPF>");
  });
});

describe("parseDistResponse", () => {
  it("decompresses docZip and classifies full NF-e, summaries and events", async () => {
    const res = await parseDistResponse(
      soapResponse({
        cStat: "138",
        ultNSU: 3,
        maxNSU: 9,
        docs: [
          docZip(1, "procNFe_v4.00.xsd", nfeProcXml()),
          docZip(2, "resNFe_v1.01.xsd", resNFeXml()),
          docZip(3, "resEvento_v1.01.xsd", "<resEvento/>"),
        ],
      })
    );
    expect(res).toMatchObject({ cStat: "138", ultNSU: "000000000000003", maxNSU: "000000000000009" });
    expect(res.documents.map((d) => d.kind)).toEqual(["nfe", "nfe_summary", "event"]);
    expect(res.documents[0].xml).toContain(`NFe${NFE_KEY}`);
  });

  it("turns a SOAP fault into an error", async () => {
    const fault = `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body><soap:Fault><soap:Reason><soap:Text>Certificado inválido</soap:Text></soap:Reason></soap:Fault></soap:Body></soap:Envelope>`;
    await expect(parseDistResponse(fault)).rejects.toThrow(/Certificado inválido/);
  });
});

describe("syncCompany", () => {
  const T0 = new Date("2026-09-26T10:00:00Z");
  function deps(responses: (DistResponse | Error)[]): SyncDeps & { calls: string[] } {
    const calls: string[] = [];
    return {
      calls,
      distribute: vi.fn(async (req) => {
        calls.push(req.lastNsu);
        const r = responses.shift();
        if (!r) throw new Error("unexpected call");
        if (r instanceof Error) throw r;
        return r;
      }),
      ingestNfe: vi.fn(async () => "criado" as const),
      saveSummary: vi.fn(async () => undefined),
      now: () => T0,
    };
  }
  const base = { env: "homologacao" as const, ufCode: 43, document: OFFICE_CLIENT_CNPJ, lastNsu: padNsu(0), nextAllowedAt: null };
  const page = async (cStat: string, ultNSU: number, maxNSU: number, docs: string[] = []) => parseDistResponse(soapResponse({ cStat, ultNSU, maxNSU, docs }));

  it("pages until ultNSU reaches maxNSU, then waits an hour", async () => {
    const d = deps([
      await page("138", 2, 4, [docZip(1, "procNFe_v4.00.xsd", nfeProcXml()), docZip(2, "resNFe_v1.01.xsd", resNFeXml())]),
      await page("138", 4, 4, [docZip(3, "procEventoNFe_v1.00.xsd", "<procEventoNFe/>"), docZip(4, "procNFe_v4.00.xsd", nfeProcXml())]),
    ]);
    const out = await syncCompany(base, d);
    expect(d.calls).toEqual(["000000000000000", "000000000000002"]);
    expect(out).toMatchObject({ ran: true, lastNsu: "000000000000004", received: 2, summaries: 1, ignored: 1, pages: 2 });
    expect(out.nextAllowedAt?.getTime()).toBe(T0.getTime() + WAIT_MS);
    expect(d.saveSummary).toHaveBeenCalledWith(expect.objectContaining({ accessKey: RES_KEY, totalCents: 25050, issueDate: "2026-09-21" }), "000000000000002");
  });

  it("does not call SEFAZ before nextAllowedAt", async () => {
    const d = deps([]);
    const out = await syncCompany({ ...base, nextAllowedAt: new Date(T0.getTime() + 1000) }, d);
    expect(out.ran).toBe(false);
    expect(d.distribute).not.toHaveBeenCalled();
  });

  it("waits an hour on 137 (nothing new) and advances the cursor SEFAZ returned", async () => {
    const out = await syncCompany({ ...base, lastNsu: padNsu(10) }, deps([await page("137", 12, 12)]));
    expect(out).toMatchObject({ lastNsu: "000000000000012", statusCode: "137" });
    expect(out.nextAllowedAt?.getTime()).toBe(T0.getTime() + WAIT_MS);
  });

  it("stops and waits on 656 (consumo indevido) without moving the cursor", async () => {
    const out = await syncCompany({ ...base, lastNsu: padNsu(10) }, deps([await page("656", 99, 99)]));
    expect(out).toMatchObject({ lastNsu: "000000000000010", statusCode: "656" });
    expect(out.nextAllowedAt).not.toBeNull();
  });

  it("keeps the cursor on rejections and network errors", async () => {
    const rejected = await syncCompany(base, deps([await page("593", 0, 0)]));
    expect(rejected).toMatchObject({ lastNsu: "000000000000000", statusCode: "593" });
    const failed = await syncCompany(base, deps([new Error("ECONNRESET")]));
    expect(failed).toMatchObject({ statusCode: "erro", statusMessage: "ECONNRESET", lastNsu: "000000000000000" });
    expect(failed.nextAllowedAt).not.toBeNull();
  });

  it("leaves nextAllowedAt empty when the page budget ends with documents pending", async () => {
    const d = deps([await page("138", 50, 500, [docZip(50, "procNFe_v4.00.xsd", nfeProcXml())]), await page("138", 100, 500)]);
    const out = await syncCompany({ ...base, maxPages: 2 }, d);
    expect(out).toMatchObject({ lastNsu: "000000000000100", nextAllowedAt: null, pages: 2 });
  });
});

describe("readA1Certificate", () => {
  const pki = makeTestPki();

  it("picks the holder certificate (not the CA) and reads the CNPJ from the CN", () => {
    const a1 = readA1Certificate(pki.pfxBase64, pki.password);
    expect(a1.holderDocument).toBe(OFFICE_CLIENT_CNPJ);
    expect(a1.subject).toContain("CN=CLIENTE DO ESCRITORIO SA");
    expect(a1.issuer).toContain("AC Teste AutoNF");
    expect(a1.certChainPem.match(/BEGIN CERTIFICATE/g)).toHaveLength(2);
    expect(a1.keyPem).toContain("PRIVATE KEY");
  });

  it("rejects a wrong password with a readable message", () => {
    expect(() => readA1Certificate(pki.pfxBase64, "errada")).toThrow(/Senha do certificado incorreta/);
  });
});

describe("distributeByNsu over mutual TLS", () => {
  const pki = makeTestPki();
  let server: https.Server;
  let url: string;
  const seen: { cn?: string; body?: string } = {};

  beforeAll(async () => {
    server = https.createServer(
      { key: pki.serverKeyPem, cert: pki.serverCertPem, ca: pki.caPem, requestCert: true, rejectUnauthorized: true },
      (req, res) => {
        const peer = (req.socket as import("tls").TLSSocket).getPeerCertificate();
        seen.cn = peer.subject?.CN;
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
          seen.body = body;
          res.writeHead(200, { "Content-Type": "application/soap+xml" });
          res.end(soapResponse({ cStat: "138", ultNSU: 1, maxNSU: 1, docs: [docZip(1, "procNFe_v4.00.xsd", nfeProcXml())] }));
        });
      }
    );
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    url = `https://localhost:${(server.address() as AddressInfo).port}/NFeDistribuicaoDFe.asmx`;
  });
  afterAll(() => server.close());

  it("presents the company's A1 and parses the answer", async () => {
    const a1 = readA1Certificate(pki.pfxBase64, pki.password);
    const res = await distributeByNsu(
      { env: "homologacao", ufCode: 43, document: OFFICE_CLIENT_CNPJ, lastNsu: "0" },
      { keyPem: a1.keyPem, certChainPem: a1.certChainPem },
      { url, ca: pki.caPem }
    );
    expect(seen.cn).toBe("CLIENTE DO ESCRITORIO SA:98765432000198");
    expect(seen.body).toContain(`<CNPJ>${OFFICE_CLIENT_CNPJ}</CNPJ>`);
    expect(res.documents[0].kind).toBe("nfe");
  });

  it("fails when the server's certificate is not trusted", async () => {
    const a1 = readA1Certificate(pki.pfxBase64, pki.password);
    await expect(
      distributeByNsu({ env: "homologacao", ufCode: 43, document: OFFICE_CLIENT_CNPJ, lastNsu: "0" }, { keyPem: a1.keyPem, certChainPem: a1.certChainPem }, { url })
    ).rejects.toThrow();
  });
});
