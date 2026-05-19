/**
 * DPS (Documento de Prestação de Serviço) XML Generator
 *
 * Generates XML per NT DPS 1.00 for submission to the SEFIN Nacional API.
 * Used exclusively for Porto Alegre (4314902), which migrated in Nov/2025.
 */

export interface DPSData {
  // Identification
  serie: string;
  nDPS: string;
  dCompet: string;        // YYYY-MM

  // Environment: 1=producao, 2=homologacao
  tpAmb: 1 | 2;

  // Municipality IBGE codes
  cLocEmi: string;        // provider's city (where DPS is issued)
  cLocPrestacao: string;  // where service is rendered

  // Provider (Prestador)
  providerCNPJ: string;   // 14 digits, no punctuation
  providerIM: string;     // Inscrição Municipal
  opSimpNac: 1 | 2;      // 1=Simples Nacional optant, 2=not optant
  regEspTrib?: number;    // special tax regime, 0=none

  // Taker (Tomador)
  takerType: "CPF" | "CNPJ";
  takerDocument: string;  // 11 or 14 digits, no punctuation
  takerName: string;
  takerMunCode?: string;  // IBGE code
  takerZipCode?: string;  // 8 digits
  takerStreet?: string;
  takerNumber?: string;
  takerNeighborhood?: string;
  takerEmail?: string;

  // Service
  cTribNac: string;       // national service code, 4 chars e.g. "0107"
  cTribMun?: string;      // optional municipal code
  xDescServ: string;      // max 2000 chars

  // Values (all in cents)
  vServ: number;
  vDescIncond?: number;   // unconditional discount
  vDescCond?: number;     // conditional discount
  vDedRed?: number;       // deductions / reductions
  pAliqAplic: number;     // ISS rate as %, e.g. 5.00
  vISSQN: number;         // ISS amount in cents
  tpRetISSQN: 1 | 2;     // 1=retained by taker, 2=not retained

  // Federal tax retentions (cents)
  retIRPJ?: number;
  retCSLL?: number;
  retCOFINS?: number;
  retPIS?: number;
  retINSS?: number;
}

function r(cents: number): string {
  return (cents / 100).toFixed(2);
}

function x(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildDPSId(
  data: Pick<DPSData, "providerCNPJ" | "dCompet" | "serie" | "nDPS">
): string {
  return `DPS${data.providerCNPJ}${data.dCompet.replace("-", "")}${data.serie}${data.nDPS.padStart(9, "0")}`;
}

export function generateDPSXML(data: DPSData): string {
  const id = buildDPSId(data);

  const totalDiscounts = (data.vDescIncond ?? 0) + (data.vDescCond ?? 0);
  const vBC = r(data.vServ - (data.vDedRed ?? 0) - totalDiscounts);

  const takerDoc =
    data.takerType === "CPF"
      ? `<CPF>${data.takerDocument}</CPF>`
      : `<CNPJ>${data.takerDocument}</CNPJ>`;

  const hasAddress = data.takerMunCode || data.takerZipCode || data.takerStreet;
  const endBlock = hasAddress
    ? `
      <end>
        <endNac>
          ${data.takerMunCode ? `<cMun>${data.takerMunCode}</cMun>` : ""}
          ${data.takerZipCode ? `<CEP>${data.takerZipCode.replace(/\D/g, "")}</CEP>` : ""}
        </endNac>
        ${data.takerStreet ? `<xLgr>${x(data.takerStreet)}</xLgr>` : ""}
        <nro>${x(data.takerNumber ?? "SN")}</nro>
        ${data.takerNeighborhood ? `<xBairro>${x(data.takerNeighborhood)}</xBairro>` : ""}
      </end>`
    : "";

  const retLines = [
    data.retIRPJ   ? `<vIR>${r(data.retIRPJ)}</vIR>`         : "",
    data.retCSLL   ? `<vCSLL>${r(data.retCSLL)}</vCSLL>`      : "",
    data.retCOFINS ? `<vCOFINS>${r(data.retCOFINS)}</vCOFINS>` : "",
    data.retPIS    ? `<vPIS>${r(data.retPIS)}</vPIS>`         : "",
    data.retINSS   ? `<vINSS>${r(data.retINSS)}</vINSS>`      : "",
  ].filter(Boolean);

  return `<?xml version="1.0" encoding="UTF-8"?>
<DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">
  <infDPS Id="${id}" versao="1.00">
    <tpAmb>${data.tpAmb}</tpAmb>
    <cLocEmi>${data.cLocEmi}</cLocEmi>
    <serie>${x(data.serie)}</serie>
    <nDPS>${data.nDPS}</nDPS>
    <dCompet>${data.dCompet}</dCompet>
    <prest>
      <CNPJ>${data.providerCNPJ}</CNPJ>
      <IM>${data.providerIM}</IM>
      <regTrib>
        <opSimpNac>${data.opSimpNac}</opSimpNac>
        <regEspTrib>${data.regEspTrib ?? 0}</regEspTrib>
      </regTrib>
    </prest>
    <toma>
      ${takerDoc}
      <xNome>${x(data.takerName)}</xNome>${endBlock}
      ${data.takerEmail ? `<email>${x(data.takerEmail)}</email>` : ""}
    </toma>
    <serv>
      <locPrest>
        <cLocPrestacao>${data.cLocPrestacao}</cLocPrestacao>
        <cPaisPrestacao>1058</cPaisPrestacao>
      </locPrest>
      <cServ>
        <cTribNac>${data.cTribNac}</cTribNac>
        ${data.cTribMun ? `<cTribMun>${data.cTribMun}</cTribMun>` : ""}
        <xDescServ>${x(data.xDescServ)}</xDescServ>
      </cServ>
    </serv>
    <valores>
      <vServPrest>
        <vServ>${r(data.vServ)}</vServ>
        ${totalDiscounts > 0 ? `<vDescCondIncond>${r(totalDiscounts)}</vDescCondIncond>` : ""}
      </vServPrest>
      ${data.vDescIncond ? `<vDescIncond>${r(data.vDescIncond)}</vDescIncond>` : ""}
      ${data.vDescCond   ? `<vDescCond>${r(data.vDescCond)}</vDescCond>`       : ""}
      ${data.vDedRed     ? `<vDedRed>${r(data.vDedRed)}</vDedRed>`             : ""}
      <vBC>${vBC}</vBC>
      <pAliqAplic>${data.pAliqAplic.toFixed(2)}</pAliqAplic>
      <vISSQN>${r(data.vISSQN)}</vISSQN>
      <tpRetISSQN>${data.tpRetISSQN}</tpRetISSQN>
      ${
        retLines.length > 0
          ? `<retTrib>\n        ${retLines.join("\n        ")}\n      </retTrib>`
          : ""
      }
    </valores>
  </infDPS>
</DPS>`;
}
