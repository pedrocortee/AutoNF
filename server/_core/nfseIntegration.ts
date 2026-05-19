/**
 * NFS-e Integration Module for Rio Grande do Sul
 *
 * Municipalities and their systems (verified Jun/2025):
 *
 *  Porto Alegre  (4314902) — SEFIN Nacional (migrou em Nov/2025; requer DPS + JWT — veja SefinNacionalClient abaixo)
 *  Caxias do Sul (4305108) — INFISC SOAP   (endpoint a confirmar via manual em nfse.caxias.rs.gov.br)
 *  Canoas        (4304606) — INFISC SOAP   (WSDL homol confirmado)
 *  Novo Hamburgo (4313409) — ABRASF REST   (endpoint a confirmar)
 *  Pelotas       (4314407) — Asten  SOAP   (endpoints confirmados)
 *  São Leopoldo  (4318705) — ABRASF REST   (endpoint a confirmar)
 */

import axios, { AxiosInstance } from "axios";
import { parseStringPromise } from "xml2js";
import * as forge from "node-forge";
import crypto from "crypto";
import { SignedXml } from "xml-crypto";
import { type DPSData, generateDPSXML, buildDPSId } from "./dpsGenerator";
import {
  generateCancelamentoXML,
  validateCancelamentoData,
  parseCancelamentoResponse,
  isWithinCancellationDeadline,
  type CancelamentoData,
  type CancelamentoResult,
  type CancelamentoMotivo,
} from "./cancelamentoGenerator";
import { signXMLWithCertificate } from "./xmlSigner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ApiProtocol = "abrasf-rest" | "soap-infisc" | "soap-asten" | "sefin-nacional";

interface MunicipalityConfig {
  protocol: ApiProtocol;
  homologacao: string;
  producao: string;
}

export interface NFSeConfig {
  municipalityCode: string;
  endpoint: string;
  protocol: ApiProtocol;
  environment: "homologacao" | "producao";
  timeout?: number;
}

export interface SubmitRPSRequest {
  rpsXml: string;
  cnpj: string;
  inscriptionMunicipal: string;
}

export interface SubmitRPSResponse {
  success: boolean;
  nfseNumber?: string;
  rpsNumber?: string;
  protocolNumber?: string;
  issueDate?: string;
  error?: string;
  errorCode?: string;
  details?: unknown;
}

// ---------------------------------------------------------------------------
// Municipality endpoint registry
// ---------------------------------------------------------------------------

const MUNICIPALITY_MAP: Record<string, MunicipalityConfig> = {
  // Porto Alegre — migrou para SEFIN Nacional (REST + DPS) em Nov/2025
  // O NFSeClient abaixo NÃO funciona para POA; use SefinNacionalClient.
  "4314902": {
    protocol: "sefin-nacional",
    homologacao: "https://sefin.producaorestrita.nfse.gov.br/SefinNacional",
    producao: "https://sefin.nfse.gov.br/SefinNacional",
  },
  // Caxias do Sul — INFISC SOAP (endpoint base; confirmar via manual em nfse.caxias.rs.gov.br)
  "4305108": {
    protocol: "soap-infisc",
    homologacao: "https://homologacao.caxias.rs.gov.br/nfse/services/NfseWs",
    producao: "https://nfse.caxias.rs.gov.br/nfse/services/NfseWs",
  },
  // Canoas — INFISC SOAP (WSDL homol: canoas-homol.infisc.com.br/services/nfse/ws/Servicos.wsdl)
  "4304606": {
    protocol: "soap-infisc",
    homologacao: "https://canoas-homol.infisc.com.br/services/nfse/ws/Servicos",
    producao: "https://canoas.infisc.com.br/services/nfse/ws/Servicos",
  },
  // Novo Hamburgo — ABRASF REST (endpoint a confirmar junto à prefeitura)
  "4313409": {
    protocol: "abrasf-rest",
    homologacao: "https://nfse-hom.novohamburgo.rs.gov.br/api",
    producao: "https://nfse.novohamburgo.rs.gov.br/api",
  },
  // Pelotas — Asten SOAP (endpoints confirmados)
  "4314407": {
    protocol: "soap-asten",
    homologacao: "http://wshomo.pelotas.rs.gov.br/wsnfse/NfseWSISAPI.dll/soap/INfse",
    producao: "http://ws.pelotas.rs.gov.br/wsnfse/NfseWSISAPI.dll/soap/INfse",
  },
  // São Leopoldo — ABRASF REST (endpoint a confirmar junto à prefeitura)
  "4318705": {
    protocol: "abrasf-rest",
    homologacao: "https://nfse-hom.saoleopoldo.rs.gov.br/nfse/api",
    producao: "https://nfse.saoleopoldo.rs.gov.br/nfse/api",
  },
};

// ---------------------------------------------------------------------------
// SOAP envelope builders
// ---------------------------------------------------------------------------

function buildInfiscSoapEnvelope(signedXml: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope
  xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:nfse="http://www.infisc.com.br/nfse">
  <soapenv:Header/>
  <soapenv:Body>
    <nfse:RecepcionarLoteRps>
      <nfse:xmlEnvio><![CDATA[${signedXml}]]></nfse:xmlEnvio>
    </nfse:RecepcionarLoteRps>
  </soapenv:Body>
</soapenv:Envelope>`;
}

function buildAstenSoapEnvelope(signedXml: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope
  xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:nfse="http://nfse.abrasf.org.br">
  <soapenv:Header/>
  <soapenv:Body>
    <nfse:RecepcionarLoteRps>
      <nfse:XmlEnvio><![CDATA[${signedXml}]]></nfse:XmlEnvio>
    </nfse:RecepcionarLoteRps>
  </soapenv:Body>
</soapenv:Envelope>`;
}

// ---------------------------------------------------------------------------
// Response parser (xml2js)
// ---------------------------------------------------------------------------

async function parseNFSeXmlResponse(xml: string): Promise<SubmitRPSResponse> {
  try {
    const parsed = await parseStringPromise(xml, { explicitArray: false, ignoreAttrs: true });

    // Unwrap SOAP envelope if present
    const body =
      parsed?.["soapenv:Envelope"]?.["soapenv:Body"] ??
      parsed?.["soap:Envelope"]?.["soap:Body"] ??
      parsed;

    // Try to find error elements
    const errorList =
      body?.RetornoLoteRps?.ListaMensagemRetorno?.MensagemRetorno ??
      body?.RetornoNfse?.ListaMensagemRetorno?.MensagemRetorno ??
      body?.Erro;

    if (errorList) {
      const msg = Array.isArray(errorList) ? errorList[0] : errorList;
      return {
        success: false,
        error: msg?.Mensagem ?? msg?.Descricao ?? JSON.stringify(msg),
        errorCode: msg?.Codigo ?? "API_ERROR",
        details: parsed,
      };
    }

    // Extract NFS-e number from multiple possible paths
    const nfseNumber =
      body?.RetornoLoteRps?.NumeroNfse ??
      body?.RetornoNfse?.NfseConsultaMsg?.Nfse?.InfNfse?.Numero ??
      body?.CompNfse?.Nfse?.InfNfse?.Numero ??
      body?.Numero;

    const protocolNumber =
      body?.RetornoLoteRps?.Protocolo ?? body?.Protocolo;

    const issueDate =
      body?.RetornoLoteRps?.DataEmissao ?? body?.DataEmissao;

    return {
      success: true,
      nfseNumber: nfseNumber ? String(nfseNumber) : undefined,
      protocolNumber: protocolNumber ? String(protocolNumber) : undefined,
      issueDate: issueDate ? String(issueDate) : undefined,
      details: parsed,
    };
  } catch {
    return {
      success: false,
      error: "Falha ao parsear resposta XML da prefeitura",
      errorCode: "PARSE_ERROR",
      details: xml,
    };
  }
}

// ---------------------------------------------------------------------------
// NFSeClient — ABRASF REST + INFISC SOAP + Asten SOAP
// ---------------------------------------------------------------------------

export class NFSeClient {
  private client: AxiosInstance;
  private config: NFSeConfig;

  constructor(config: NFSeConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: config.endpoint,
      timeout: config.timeout ?? 30000,
      headers: { "Content-Type": "application/xml", Accept: "application/xml" },
    });
  }

  async submitRPS(request: SubmitRPSRequest): Promise<SubmitRPSResponse> {
    if (!request.rpsXml || request.rpsXml.trim().length === 0) {
      return { success: false, error: "RPS XML is required", errorCode: "INVALID_INPUT" };
    }
    if (!request.cnpj || !/^\d{14}$/.test(request.cnpj)) {
      return { success: false, error: "Invalid CNPJ format", errorCode: "INVALID_CNPJ" };
    }

    if (this.config.protocol === "sefin-nacional") {
      return {
        success: false,
        error:
          "Porto Alegre usa SEFIN Nacional (API REST federal com JWT + DPS). " +
          "Use SefinNacionalClient em vez de NFSeClient.",
        errorCode: "WRONG_CLIENT",
      };
    }

    try {
      let body: string;
      let extraHeaders: Record<string, string> = {};

      if (this.config.protocol === "soap-infisc") {
        body = buildInfiscSoapEnvelope(request.rpsXml);
        extraHeaders = {
          "SOAPAction": "RecepcionarLoteRps",
          "Content-Type": "text/xml; charset=UTF-8",
        };
      } else if (this.config.protocol === "soap-asten") {
        body = buildAstenSoapEnvelope(request.rpsXml);
        extraHeaders = {
          "SOAPAction": "RecepcionarLoteRps",
          "Content-Type": "text/xml; charset=UTF-8",
        };
      } else {
        // abrasf-rest
        body = request.rpsXml;
        extraHeaders = {
          "X-CNPJ": request.cnpj,
          "X-Inscricao-Municipal": request.inscriptionMunicipal,
        };
      }

      const path =
        this.config.protocol === "abrasf-rest" ? "/nfse/enviar-rps" : "";

      const response = await this.client.post(path, body, { headers: extraHeaders });
      return await parseNFSeXmlResponse(
        typeof response.data === "string" ? response.data : JSON.stringify(response.data)
      );
    } catch (error) {
      return this.handleError(error);
    }
  }

  async queryNFSeStatus(nfseNumber: string, cnpj: string): Promise<SubmitRPSResponse> {
    try {
      const response = await this.client.get(`/nfse/${nfseNumber}`, {
        headers: { "X-CNPJ": cnpj },
      });
      return await parseNFSeXmlResponse(
        typeof response.data === "string" ? response.data : JSON.stringify(response.data)
      );
    } catch (error) {
      return this.handleError(error);
    }
  }

  /** @deprecated Use cancelNFSeWithCertificate for ABRASF-compliant cancellation */
  async cancelNFSe(nfseNumber: string, cnpj: string, reason: string): Promise<SubmitRPSResponse> {
    try {
      const cancelXml = buildSimpleCancelXml(nfseNumber, cnpj, reason);
      const response = await this.client.post("/nfse/cancelar", cancelXml, {
        headers: { "X-CNPJ": cnpj },
      });
      return await parseNFSeXmlResponse(
        typeof response.data === "string" ? response.data : JSON.stringify(response.data)
      );
    } catch (error) {
      return this.handleError(error);
    }
  }

  async cancelNFSeWithCertificate(params: {
    cancelData: CancelamentoData;
    certificateData: string;
    certificatePassword: string;
    environment?: "homologacao" | "producao";
  }): Promise<CancelamentoResult> {
    const { cancelData, certificateData, certificatePassword, environment = "homologacao" } = params;

    const validation = validateCancelamentoData(cancelData);
    if (!validation.valid) {
      return { success: false, error: validation.errors.join(", "), errorCode: "VALIDATION_ERROR" };
    }

    try {
      const cancelXml = generateCancelamentoXML(cancelData);
      const { signedXml } = signXMLWithCertificate({ certificateData, certificatePassword, xmlContent: cancelXml });

      const cfg = MUNICIPALITY_MAP[cancelData.municipalityCode];
      const endpoint = cfg ? cfg[environment] : null;
      if (!endpoint) {
        return {
          success: false,
          error: `Município ${cancelData.municipalityCode} sem endpoint de cancelamento configurado`,
          errorCode: "NO_ENDPOINT",
        };
      }

      let body = signedXml;
      const extraHeaders: Record<string, string> = {
        "Content-Type": "application/xml",
        Accept: "application/xml",
      };

      if (cfg.protocol === "soap-infisc") {
        body = buildInfiscSoapEnvelope(signedXml);
        extraHeaders["SOAPAction"] = "CancelarNfse";
        extraHeaders["Content-Type"] = "text/xml; charset=UTF-8";
      } else if (cfg.protocol === "soap-asten") {
        body = buildAstenSoapEnvelope(signedXml);
        extraHeaders["SOAPAction"] = "CancelarNfse";
        extraHeaders["Content-Type"] = "text/xml; charset=UTF-8";
      } else {
        extraHeaders["X-CNPJ"] = cancelData.providerCNPJ;
        extraHeaders["X-Inscricao-Municipal"] = cancelData.providerInscricaoMunicipal;
      }

      const cancelPath = cfg.protocol === "abrasf-rest" ? "/nfse/cancelar" : "";
      const response = await axios.post(`${endpoint}${cancelPath}`, body, {
        headers: extraHeaders,
        timeout: 30000,
      });

      return parseCancelamentoResponse(response.data);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response) {
          const parsed = parseCancelamentoResponse(error.response.data);
          return parsed.success
            ? parsed
            : {
                success: false,
                error: `API Error ${error.response.status}: ${error.response.statusText}`,
                errorCode: `HTTP_${error.response.status}`,
                details: error.response.data,
              };
        }
        return { success: false, error: "Sem resposta da API da prefeitura", errorCode: "NO_RESPONSE" };
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        errorCode: "UNKNOWN_ERROR",
      };
    }
  }

  private handleError(error: unknown): SubmitRPSResponse {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        return {
          success: false,
          error: `API Error: ${error.response.status} ${error.response.statusText}`,
          errorCode: `HTTP_${error.response.status}`,
          details: error.response.data,
        };
      }
      return { success: false, error: "Sem resposta da API", errorCode: "NO_RESPONSE" };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      errorCode: "UNKNOWN_ERROR",
    };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function getNFSeClient(
  municipalityCode: string,
  environment: "homologacao" | "producao" = "homologacao"
): NFSeClient {
  const cfg = MUNICIPALITY_MAP[municipalityCode];
  if (!cfg) {
    throw new Error(`No NFS-e endpoint configured for municipality ${municipalityCode}`);
  }

  return new NFSeClient({
    municipalityCode,
    endpoint: cfg[environment],
    protocol: cfg.protocol,
    environment,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSimpleCancelXml(nfseNumber: string, cnpj: string, reason: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<CancelamentoNfse xmlns="http://www.abrasf.org.br/nfse">
  <Pedido>
    <InfPedidoCancelamento Id="Cancelamento_${nfseNumber}">
      <IdentificacaoNfse>
        <Numero>${nfseNumber}</Numero>
        <CpfCnpj><Cnpj>${cnpj}</Cnpj></CpfCnpj>
      </IdentificacaoNfse>
      <DataPedido>${new Date().toISOString().split("T")[0]}</DataPedido>
      <Motivo>${reason}</Motivo>
    </InfPedidoCancelamento>
  </Pedido>
</CancelamentoNfse>`;
}

export { isWithinCancellationDeadline, CANCELAMENTO_MOTIVOS } from "./cancelamentoGenerator";
export type { CancelamentoData, CancelamentoResult, CancelamentoMotivo };
export type { DPSData };

// ---------------------------------------------------------------------------
// SEFIN Nacional — Porto Alegre (migrou Nov/2025)
// Spec: gov.br/nfse/pt-br/biblioteca/documentacao-tecnica
// ---------------------------------------------------------------------------

export interface SefinNacionalRequest {
  dpsData: DPSData;
  certificateData: string;    // base64-encoded PFX/P12
  certificatePassword: string;
  cnpj: string;               // provider CNPJ, 14 digits
}

export interface SefinNacionalResponse {
  success: boolean;
  chNFSe?: string;   // chave da NFS-e nacional
  nNFSe?: string;    // número da NFS-e
  dhEmi?: string;    // data/hora de emissão ISO-8601
  error?: string;
  errorCode?: string;
  details?: unknown;
}

// Extract private key and certificate from PFX, returning PEM strings.
function extractCertPems(
  certData: string,
  certPassword: string
): { privKeyPem: string; certPem: string } {
  // Strip data: URL prefix if the cert came from FileReader.readAsDataURL()
  const cleanData = certData.startsWith("data:") ? (certData.split(",")[1] ?? certData) : certData;
  const binaryData = forge.util.decode64(cleanData);
  const pkcs12Asn1 = forge.asn1.fromDer(binaryData);
  const pkcs12 = forge.pkcs12.pkcs12FromAsn1(pkcs12Asn1, certPassword);

  const certBagOid = forge.pki.oids.certBag;
  const keyBagOid  = forge.pki.oids.pkcs8ShroudedKeyBag;

  const certBags = pkcs12.getBags({ bagType: certBagOid });
  const keyBags  = pkcs12.getBags({ bagType: keyBagOid });

  const certificate = (certBags[certBagOid] ?? [])[0]?.cert;
  const privateKey  = (keyBags[keyBagOid]  ?? [])[0]?.key;

  if (!certificate || !privateKey) {
    throw new Error("Certificado ou chave privada não encontrados no arquivo PFX");
  }

  return {
    privKeyPem: forge.pki.privateKeyToPem(privateKey),
    certPem:    forge.pki.certificateToPem(certificate),
  };
}

// Generate RS256 JWT signed with the A1 certificate private key.
function generateRS256JWT(cnpj: string, audience: string, privKeyPem: string): string {
  const b64url = (obj: object) =>
    Buffer.from(JSON.stringify(obj), "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");

  const header  = b64url({ alg: "RS256", typ: "JWT" });
  const now     = Math.floor(Date.now() / 1000);
  const payload = b64url({
    iss: cnpj,
    sub: cnpj,
    aud: audience,
    iat: now,
    exp: now + 300, // 5-minute token
    jti: crypto.randomUUID(),
  });

  const signingInput = `${header}.${payload}`;
  const sign = crypto.createSign("SHA256");
  sign.update(signingInput, "utf8");
  const sig = sign
    .sign({ key: privKeyPem, padding: crypto.constants.RSA_PKCS1_PADDING })
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  return `${signingInput}.${sig}`;
}

// Embed a proper XMLDSig (RSA-SHA256, C14N) block referencing infDPS by Id.
// Uses xml-crypto for correct inclusive C14N — required by SEFIN Nacional.
function signDPSXML(
  dpsXml: string,
  infDPSId: string,
  privKeyPem: string,
  certPem: string  // full PEM string (with headers)
): string {
  const sig = new SignedXml({
    privateKey: privKeyPem,
    publicCert: certPem,
    signatureAlgorithm: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
    canonicalizationAlgorithm: "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
  });

  sig.addReference({
    xpath: `//*[@Id="${infDPSId}"]`,
    digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
    transforms: [
      "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
      "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
    ],
    uri: `#${infDPSId}`,
    isEmptyUri: false,
  });

  sig.computeSignature(dpsXml, {
    location: { reference: "/*", action: "append" },
    existingPrefixes: { nfse: "http://www.sped.fazenda.gov.br/nfse" },
  });

  return sig.getSignedXml();
}

// Parse the JSON response from SEFIN Nacional into a normalized shape.
function parseSefinResponse(data: unknown): SefinNacionalResponse {
  if (typeof data !== "object" || data === null) {
    return {
      success: false,
      error: "Resposta inválida da API SEFIN Nacional",
      errorCode: "INVALID_RESPONSE",
      details: data,
    };
  }

  const d = data as Record<string, unknown>;

  // Error shapes returned by the API
  if (d.codigo || d.erros || d.mensagem) {
    const erros = Array.isArray(d.erros)
      ? (d.erros as Array<{ codigo?: string; mensagem?: string }>)
      : null;
    const first = erros?.[0];
    return {
      success: false,
      error: first?.mensagem ?? String(d.mensagem ?? d.descricao ?? "Erro desconhecido"),
      errorCode: first?.codigo ?? String(d.codigo ?? "API_ERROR"),
      details: data,
    };
  }

  return {
    success: true,
    chNFSe: d.chNFSe != null ? String(d.chNFSe) : undefined,
    nNFSe:  d.nNFSe  != null ? String(d.nNFSe)  : undefined,
    dhEmi:  d.dhEmi  != null ? String(d.dhEmi)  : undefined,
    details: data,
  };
}

export class SefinNacionalClient {
  private readonly baseUrl: string;
  private readonly timeout: number;

  constructor(
    environment: "homologacao" | "producao" = "homologacao",
    timeout = 30_000
  ) {
    this.baseUrl =
      environment === "producao"
        ? "https://sefin.nfse.gov.br/SefinNacional"
        : "https://sefin.producaorestrita.nfse.gov.br/SefinNacional";
    this.timeout = timeout;
  }

  async submitDPS(request: SefinNacionalRequest): Promise<SefinNacionalResponse> {
    const { dpsData, certificateData, certificatePassword, cnpj } = request;

    if (!cnpj || !/^\d{14}$/.test(cnpj)) {
      return { success: false, error: "CNPJ inválido", errorCode: "INVALID_CNPJ" };
    }

    try {
      const { privKeyPem, certPem } = extractCertPems(certificateData, certificatePassword);

      const dpsXml    = generateDPSXML(dpsData);
      const infDPSId  = buildDPSId(dpsData);
      const signedDPS = signDPSXML(dpsXml, infDPSId, privKeyPem, certPem);

      const jwt = generateRS256JWT(cnpj, this.baseUrl, privKeyPem);

      const response = await axios.post(
        `${this.baseUrl}/contribuinte/nfse`,
        signedDPS,
        {
          timeout: this.timeout,
          headers: {
            "Content-Type": "application/xml",
            "Accept": "application/json",
            "Authorization": `Bearer ${jwt}`,
          },
        }
      );

      return parseSefinResponse(response.data);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response) {
          const parsed = parseSefinResponse(error.response.data);
          return parsed.success
            ? {
                success: false,
                error: `HTTP ${error.response.status}: ${error.response.statusText}`,
                errorCode: `HTTP_${error.response.status}`,
                details: error.response.data,
              }
            : parsed;
        }
        return {
          success: false,
          error: "Sem resposta da API SEFIN Nacional",
          errorCode: "NO_RESPONSE",
        };
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        errorCode: "UNKNOWN_ERROR",
      };
    }
  }
}
