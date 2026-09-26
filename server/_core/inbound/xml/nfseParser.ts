/**
 * NFS-e padrão nacional (namespace http://www.sped.fazenda.gov.br/nfse) → ExtractedDocument.
 * Accepts the authorized <NFSe> (with embedded <DPS>) or a bare <DPS>.
 * Field names mirror server/_core/dpsGenerator.ts.
 */

import { ACCESS_KEY_50, emptyDocument, type ExtractedDocument } from "../schemas";
import { at, attr, parseXml, partyDocument, text, toCents, toIsoDate, type XmlNode } from "./xmlUtils";

export async function parseNFSeNacionalXml(xml: string): Promise<ExtractedDocument> {
  const root = await parseXml(xml);
  const infNFSe = at(root, "NFSe.infNFSe") as XmlNode | undefined;
  const infDPS = (at(infNFSe, "DPS.infDPS") ?? at(root, "DPS.infDPS")) as XmlNode | undefined;
  if (!infNFSe && !infDPS) throw new Error("XML não contém infNFSe/infDPS — não é uma NFS-e nacional");

  const doc = emptyDocument("nfse");

  const id = infNFSe ? attr(root, "NFSe.infNFSe", "Id") : null;
  const key = id?.replace(/^NFS/, "") ?? null;
  doc.accessKey = key && ACCESS_KEY_50.test(key) ? key : null;

  doc.number = text(infNFSe, "nNFSe") ?? text(infDPS, "nDPS");
  doc.series = text(infDPS, "serie");
  doc.issueDate = toIsoDate(text(infDPS, "dhEmi") ?? text(infNFSe, "dhProc") ?? text(infDPS, "dCompet"));

  const issuerNode = at(infNFSe, "emit") ?? at(infDPS, "prest");
  doc.issuer = {
    document: partyDocument(issuerNode),
    name: text(issuerNode, "xNome"),
  };
  doc.recipient = {
    document: partyDocument(at(infDPS, "toma")),
    name: text(infDPS, "toma.xNome"),
  };

  doc.serviceDescription = text(infDPS, "serv.cServ.xDescServ");

  const serviceCents = toCents(text(infDPS, "valores.vServPrest.vServ"));
  // vLiq (valor líquido) only exists on the authorized NFS-e; fall back to the service value
  doc.totalCents = toCents(text(infNFSe, "valores.vLiq")) ?? serviceCents;

  if (serviceCents !== null) {
    doc.items = [
      {
        description: doc.serviceDescription ?? "Serviço",
        quantity: 1,
        unitValueCents: serviceCents,
        totalCents: serviceCents,
        ncm: null,
        cfop: null,
      },
    ];
  }

  doc.taxes.issCents =
    toCents(text(infNFSe, "valores.vISSQN")) ?? toCents(text(infDPS, "valores.vISSQN"));
  doc.taxes.pisCents = toCents(text(infDPS, "valores.retTrib.vPIS"));
  doc.taxes.cofinsCents = toCents(text(infDPS, "valores.retTrib.vCOFINS"));

  return doc;
}
