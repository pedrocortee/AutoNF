import { describe, expect, it } from "vitest";
import { parseNFeXml } from "../../server/_core/inbound/xml/nfeParser";
import { parseNFSeNacionalXml } from "../../server/_core/inbound/xml/nfseParser";
import { classify } from "../../server/_core/inbound/classifier";
import { extractedDocumentSchema } from "../../server/_core/inbound/schemas";
import {
  ALNUM_CNPJ,
  NFE_KEY,
  NFE_KEY_ALNUM,
  NFSE_KEY,
  OFFICE_CLIENT_CNPJ,
  SUPPLIER_CNPJ,
  nfeProcXml,
  nfseNacionalXml,
} from "./fixtures";

describe("parseNFeXml", () => {
  it("extracts header, parties, items, totals and earliest due date", async () => {
    const doc = await parseNFeXml(nfeProcXml());
    expect(doc.docType).toBe("nfe");
    expect(doc.accessKey).toBe(NFE_KEY);
    expect(doc.number).toBe("1234");
    expect(doc.series).toBe("1");
    expect(doc.issueDate).toBe("2026-09-20");
    expect(doc.issuer).toEqual({ document: SUPPLIER_CNPJ, name: "Distribuidora Exemplo Ltda" });
    expect(doc.recipient.document).toBe(OFFICE_CLIENT_CNPJ);
    expect(doc.items).toHaveLength(2);
    expect(doc.items[0]).toMatchObject({ description: "Parafuso sextavado", quantity: 100, unitValueCents: 50, totalCents: 5000, ncm: "73181500", cfop: "5102" });
    expect(doc.totalCents).toBe(11000);
    expect(doc.taxes).toMatchObject({ icmsCents: 1800, ipiCents: 0, pisCents: 65, cofinsCents: 300, ibsCents: null, cbsCents: null });
    expect(doc.dueDate).toBe("2026-10-20");
    expect(extractedDocumentSchema.safeParse(doc).success).toBe(true);
  });

  it("reads IBS/CBS totals when present", async () => {
    const doc = await parseNFeXml(nfeProcXml({ withIbsCbs: true }));
    expect(doc.taxes.ibsCents).toBe(10);
    expect(doc.taxes.cbsCents).toBe(90);
  });

  it("accepts alphanumeric CNPJ in parties and access key", async () => {
    const doc = await parseNFeXml(nfeProcXml({ key: NFE_KEY_ALNUM, emit: ALNUM_CNPJ }));
    expect(doc.issuer.document).toBe(ALNUM_CNPJ);
    expect(doc.accessKey).toBe(NFE_KEY_ALNUM);
    expect(extractedDocumentSchema.safeParse(doc).success).toBe(true);
  });

  it("parses a bare <NFe> without protocol, taking the key from infNFe Id", async () => {
    const bare = nfeProcXml().replace(/<\/?nfeProc[^>]*>/g, "").replace(/<protNFe[\s\S]*<\/protNFe>/, "");
    const doc = await parseNFeXml(bare);
    expect(doc.accessKey).toBe(NFE_KEY);
  });

  it("rejects XML that is not an NF-e", async () => {
    await expect(parseNFeXml("<foo><bar/></foo>")).rejects.toThrow(/infNFe/);
  });
});

describe("parseNFSeNacionalXml", () => {
  it("extracts NFS-e nacional fields", async () => {
    const doc = await parseNFSeNacionalXml(nfseNacionalXml());
    expect(doc.docType).toBe("nfse");
    expect(doc.accessKey).toBe(NFSE_KEY);
    expect(doc.number).toBe("42");
    expect(doc.issueDate).toBe("2026-09-21");
    expect(doc.issuer).toEqual({ document: SUPPLIER_CNPJ, name: "Consultoria Exemplo Ltda" });
    expect(doc.recipient).toEqual({ document: OFFICE_CLIENT_CNPJ, name: "Cliente do Escritorio SA" });
    expect(doc.serviceDescription).toBe("Suporte técnico em TI");
    expect(doc.totalCents).toBe(100000);
    expect(doc.taxes.issCents).toBe(5000);
    expect(doc.items).toHaveLength(1);
    expect(extractedDocumentSchema.safeParse(doc).success).toBe(true);
  });
});

describe("classify", () => {
  it("routes fiscal XML by root element", () => {
    expect(classify(Buffer.from(nfeProcXml()))).toEqual({ route: "xml", docType: "nfe" });
    expect(classify(Buffer.from(nfseNacionalXml()))).toEqual({ route: "xml", docType: "nfse" });
    expect(classify(Buffer.from('<?xml version="1.0"?><cteProc/>'))).toEqual({ route: "xml", docType: "cte" });
  });

  it("handles BOM, comments and namespace prefixes", () => {
    const xml = '﻿<?xml version="1.0"?><!-- x --><ns:nfeProc xmlns:ns="a"/>';
    expect(classify(Buffer.from(xml))).toEqual({ route: "xml", docType: "nfe" });
  });

  it("ignores SEFAZ events and summaries", () => {
    expect(classify(Buffer.from("<procEventoNFe/>")).route).toBe("ignore");
    expect(classify(Buffer.from("<resNFe/>")).route).toBe("ignore");
  });

  it("sends PDF and images to the LLM", () => {
    expect(classify(Buffer.from("%PDF-1.7\n..."))).toEqual({ route: "llm", mediaType: "application/pdf" });
    expect(classify(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toEqual({ route: "llm", mediaType: "image/jpeg" });
    expect(classify(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toEqual({ route: "llm", mediaType: "image/png" });
  });

  it("marks unknown content as unsupported", () => {
    expect(classify(Buffer.from("hello")).route).toBe("unsupported");
    expect(classify(Buffer.from("<planilha/>")).route).toBe("unsupported");
  });
});
