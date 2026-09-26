/**
 * NFeDistribuicaoDFe (Ambiente Nacional): documents issued against a CNPJ/CPF, paged by NSU.
 * Reference: NT 2014.002 (Distribuição de DF-e de Interesse dos Atores da NF-e), layout 1.01.
 *
 * The request/response handling is pure (buildDistRequest / parseDistResponse); postSoap does the
 * mutual-TLS call with the company's A1 certificate.
 */

import https from "https";
import fs from "fs";
import { gunzipSync } from "zlib";
import { asArray, at, parseXml, text, toCents, toIsoDate, type XmlNode } from "../inbound/xml/xmlUtils";

export type SefazEnv = "homologacao" | "producao";

export const DIST_ENDPOINTS: Record<SefazEnv, string> = {
  homologacao: "https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
  producao: "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
};

const WSDL_NS = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe";
const SOAP_ACTION = `${WSDL_NS}/nfeDistDFeInteresse`;

/** cStat values that matter for scheduling */
export const CSTAT = {
  NONE_FOUND: "137", // nenhum documento localizado → wait 1h
  FOUND: "138", // documento(s) localizado(s)
  OVERUSE: "656", // consumo indevido → blocked for 1h
} as const;

export const ZERO_NSU = "000000000000000";

export function padNsu(nsu: string | number): string {
  return String(nsu).replace(/\D/g, "").padStart(15, "0").slice(-15);
}

export interface DistRequest {
  env: SefazEnv;
  ufCode: number;
  /** CNPJ (14) or CPF (11) of the interested party */
  document: string;
  lastNsu: string;
}

export function buildDistRequest(r: DistRequest): string {
  const party = r.document.length === 11 ? `<CPF>${r.document}</CPF>` : `<CNPJ>${r.document}</CNPJ>`;
  const dist =
    `<distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">` +
    `<tpAmb>${r.env === "producao" ? 1 : 2}</tpAmb><cUFAutor>${r.ufCode}</cUFAutor>${party}` +
    `<distNSU><ultNSU>${padNsu(r.lastNsu)}</ultNSU></distNSU></distDFeInt>`;
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">` +
    `<soap12:Body><nfeDistDFeInteresse xmlns="${WSDL_NS}"><nfeDadosMsg>${dist}</nfeDadosMsg></nfeDistDFeInteresse></soap12:Body>` +
    `</soap12:Envelope>`
  );
}

export type DistDocKind = "nfe" | "nfe_summary" | "event" | "other";

export interface DistDocument {
  nsu: string;
  schema: string;
  kind: DistDocKind;
  xml: string;
}

export interface DistResponse {
  cStat: string;
  xMotivo: string;
  ultNSU: string;
  maxNSU: string;
  documents: DistDocument[];
}

function kindOf(schema: string): DistDocKind {
  if (schema.startsWith("procNFe")) return "nfe";
  if (schema.startsWith("resNFe")) return "nfe_summary";
  if (schema.startsWith("resEvento") || schema.startsWith("procEvento")) return "event";
  return "other";
}

export class SefazResponseError extends Error {}

export async function parseDistResponse(soapXml: string): Promise<DistResponse> {
  const root = await parseXml(soapXml);
  const body = at(root, "Envelope.Body") as XmlNode | undefined;
  if (!body) throw new SefazResponseError("Resposta da SEFAZ sem envelope SOAP");
  const fault = at(body, "Fault");
  if (fault) {
    const reason = text(fault, "Reason.Text") ?? text(fault, "faultstring") ?? "erro desconhecido";
    throw new SefazResponseError(`SEFAZ recusou a chamada (SOAP Fault): ${reason}`);
  }
  const ret = at(body, "nfeDistDFeInteresseResponse.nfeDistDFeInteresseResult.retDistDFeInt") as XmlNode | undefined;
  if (!ret) throw new SefazResponseError("Resposta da SEFAZ sem retDistDFeInt");

  const documents = asArray(at(ret, "loteDistDFeInt.docZip") as XmlNode | XmlNode[]).map((z): DistDocument => {
    const attrs = (z.$ ?? {}) as Record<string, string>;
    const schema = attrs.schema ?? "";
    const xml = gunzipSync(Buffer.from(String(z._ ?? ""), "base64")).toString("utf8");
    return { nsu: padNsu(attrs.NSU ?? "0"), schema, kind: kindOf(schema), xml };
  });

  return {
    cStat: text(ret, "cStat") ?? "",
    xMotivo: text(ret, "xMotivo") ?? "",
    ultNSU: padNsu(text(ret, "ultNSU") ?? "0"),
    maxNSU: padNsu(text(ret, "maxNSU") ?? "0"),
    documents,
  };
}

export interface NfeSummary {
  accessKey: string;
  issuerDocument: string | null;
  issuerName: string | null;
  issueDate: string | null;
  totalCents: number | null;
}

export async function parseResNFe(xml: string): Promise<NfeSummary | null> {
  const res = at(await parseXml(xml), "resNFe") as XmlNode | undefined;
  const key = text(res, "chNFe");
  if (!res || !key || !/^\d{44}$/.test(key)) return null;
  return {
    accessKey: key,
    issuerDocument: text(res, "CNPJ") ?? text(res, "CPF"),
    issuerName: text(res, "xNome")?.slice(0, 255) ?? null,
    issueDate: toIsoDate(text(res, "dhEmi")),
    totalCents: toCents(text(res, "vNF")),
  };
}

export interface TlsIdentity {
  keyPem: string;
  certChainPem: string;
}

/**
 * SEFAZ servers use ICP-Brasil TLS certificates, which are not in Node's default trust store.
 * SEFAZ_CA_BUNDLE points to a PEM file with the ICP-Brasil chain (download "ACcompactado.zip"
 * from https://www.gov.br/iti → Repositório ICP-Brasil and concatenate the .crt files).
 */
function trustOptions(): Pick<https.AgentOptions, "ca" | "rejectUnauthorized"> {
  const bundle = process.env.SEFAZ_CA_BUNDLE;
  if (bundle) return { ca: fs.readFileSync(bundle) };
  if (process.env.SEFAZ_TLS_INSECURE === "true") return { rejectUnauthorized: false };
  return {};
}

export async function postSoap(
  url: string,
  body: string,
  identity: TlsIdentity,
  opts: { timeoutMs?: number; action?: string; ca?: string | Buffer } = {}
): Promise<string> {
  const agent = new https.Agent({
    key: identity.keyPem,
    cert: identity.certChainPem,
    ...(opts.ca ? { ca: opts.ca } : trustOptions()),
    keepAlive: false,
  });
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: "POST",
        agent,
        headers: {
          "Content-Type": `application/soap+xml; charset=utf-8; action="${opts.action ?? SOAP_ACTION}"`,
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: opts.timeoutMs ?? 30_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const payload = Buffer.concat(chunks).toString("utf8");
          // SOAP faults come with HTTP 500 but still carry a parseable envelope
          if (res.statusCode && res.statusCode >= 400 && !payload.includes("Envelope")) {
            reject(new SefazResponseError(`SEFAZ respondeu HTTP ${res.statusCode}`));
          } else resolve(payload);
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("Tempo esgotado aguardando a SEFAZ")));
    req.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "UNABLE_TO_GET_ISSUER_CERT_LOCALLY" || err.code === "SELF_SIGNED_CERT_IN_CHAIN") {
        reject(new Error("Certificado TLS da SEFAZ não reconhecido — configure SEFAZ_CA_BUNDLE com a cadeia ICP-Brasil"));
      } else reject(err);
    });
    req.end(body);
  });
}

export async function distributeByNsu(
  r: DistRequest,
  identity: TlsIdentity,
  opts: { url?: string; ca?: string | Buffer } = {}
): Promise<DistResponse> {
  const xml = await postSoap(opts.url ?? DIST_ENDPOINTS[r.env], buildDistRequest(r), identity, { ca: opts.ca });
  return parseDistResponse(xml);
}
