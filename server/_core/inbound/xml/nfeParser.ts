/**
 * NF-e (modelo 55/65, layout 4.00) → ExtractedDocument.
 * Accepts both the authorized envelope (<nfeProc>) and a bare <NFe>.
 */

import { ACCESS_KEY_44, emptyDocument, type ExtractedDocument, type LineItem } from "../schemas";
import { at, attr, asArray, parseXml, partyDocument, text, toCents, toIsoDate, toNumber, type XmlNode } from "./xmlUtils";

export async function parseNFeXml(xml: string): Promise<ExtractedDocument> {
  const root = await parseXml(xml);
  const nfe = (at(root, "nfeProc.NFe") ?? at(root, "NFe")) as XmlNode | undefined;
  const inf = at(nfe, "infNFe") as XmlNode | undefined;
  if (!inf) throw new Error("XML não contém infNFe — não é uma NF-e");

  const doc = emptyDocument("nfe");

  const idAttr = attr(nfe, "infNFe", "Id");
  const keyFromProt = text(root, "nfeProc.protNFe.infProt.chNFe");
  const key = keyFromProt ?? idAttr?.replace(/^NFe/, "") ?? null;
  doc.accessKey = key && ACCESS_KEY_44.test(key) ? key : null;

  doc.number = text(inf, "ide.nNF");
  doc.series = text(inf, "ide.serie");
  doc.issueDate = toIsoDate(text(inf, "ide.dhEmi") ?? text(inf, "ide.dEmi"));

  doc.issuer = { document: partyDocument(at(inf, "emit")), name: text(inf, "emit.xNome") };
  doc.recipient = { document: partyDocument(at(inf, "dest")), name: text(inf, "dest.xNome") };

  doc.items = asArray(at(inf, "det") as XmlNode | XmlNode[]).map(
    (det): LineItem => ({
      description: text(det, "prod.xProd") ?? "",
      quantity: toNumber(text(det, "prod.qCom")),
      unitValueCents: toCents(text(det, "prod.vUnCom")),
      totalCents: toCents(text(det, "prod.vProd")) ?? 0,
      ncm: text(det, "prod.NCM"),
      cfop: text(det, "prod.CFOP"),
    })
  );

  const tot = at(inf, "total.ICMSTot");
  doc.totalCents = toCents(text(tot, "vNF"));
  doc.taxes.icmsCents = toCents(text(tot, "vICMS"));
  doc.taxes.ipiCents = toCents(text(tot, "vIPI"));
  doc.taxes.pisCents = toCents(text(tot, "vPIS"));
  doc.taxes.cofinsCents = toCents(text(tot, "vCOFINS"));

  // Reforma tributária (grupo IBSCBSTot). Lido de forma defensiva: o layout ainda
  // recebe notas técnicas — conferir contra XMLs reais antes de usar em apuração.
  const ibsCbs = at(inf, "total.IBSCBSTot");
  doc.taxes.ibsCents = toCents(text(ibsCbs, "gIBS.vIBS") ?? text(ibsCbs, "vIBS"));
  doc.taxes.cbsCents = toCents(text(ibsCbs, "gCBS.vCBS") ?? text(ibsCbs, "vCBS"));

  const dups = asArray(at(inf, "cobr.dup") as XmlNode | XmlNode[]);
  const dueDates = dups.map((d) => toIsoDate(text(d, "dVenc"))).filter((d): d is string => !!d).sort();
  doc.dueDate = dueDates[0] ?? null;

  return doc;
}
