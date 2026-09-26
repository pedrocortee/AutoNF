import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import type { Invoice } from "../../drizzle/schema";
import type { CompanyConfig } from "../../drizzle/schema";

export interface PDFInvoiceData {
  invoice: Invoice;
  company: CompanyConfig;
  nfseNumber?: string | null;
  /** Código de verificação retornado pela prefeitura (codigoVerificacao no XML) */
  verificationCode?: string | null;
  /** URL oficial de consulta por município. Se omitida, usa fallback genérico. */
  verificationUrl?: string | null;
  /** Regime tributário do prestador (e.g. "Simples Nacional", "Lucro Presumido") */
  taxRegime?: string | null;
}

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("pt-BR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export async function generateNFSePDF(data: PDFInvoiceData): Promise<Buffer> {
  const { invoice, company, nfseNumber, verificationCode, verificationUrl, taxRegime } = data;

  const qrUrl = verificationUrl
    ?? (nfseNumber
      ? `https://nfse.${company.municipality.toLowerCase().replace(/\s+/g, "")}.${company.state.toLowerCase()}.gov.br/verificar?nfse=${nfseNumber}&cnpj=${company.cnpj}`
      : `https://autonf.com.br/verificar/${invoice.id}`);

  const qrCodeDataUrl = await QRCode.toDataURL(qrUrl, {
    width: 120,
    margin: 1,
    color: { dark: "#1e293b", light: "#ffffff" },
  });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // ── Header ──────────────────────────────────────────────────────────────
    doc
      .rect(50, 50, doc.page.width - 100, 70)
      .fillColor("#1e293b")
      .fill();

    doc
      .fillColor("#ffffff")
      .fontSize(20)
      .font("Helvetica-Bold")
      .text("NOTA FISCAL DE SERVIÇOS ELETRÔNICA", 70, 68, { width: 460, align: "center" });

    doc
      .fontSize(10)
      .font("Helvetica")
      .text(`${company.municipality} — ${company.state} | NFS-e`, 70, 92, { width: 460, align: "center" });

    // ── NFS-e Number + código de verificação badge ───────────────────────────
    const badgeHeight = verificationCode ? 52 : 32;
    const badgeY = 138;

    if (nfseNumber) {
      doc
        .rect(50, badgeY, doc.page.width - 100, badgeHeight)
        .fillColor("#f0fdf4")
        .strokeColor("#16a34a")
        .lineWidth(1.5)
        .fillAndStroke();

      doc
        .fillColor("#15803d")
        .fontSize(14)
        .font("Helvetica-Bold")
        .text(`NFS-e Nº ${nfseNumber}`, 70, badgeY + 10, { width: 460, align: "center" });

      if (verificationCode) {
        doc
          .fillColor("#166534")
          .fontSize(9)
          .font("Helvetica")
          .text(`Código de Verificação: ${verificationCode}`, 70, badgeY + 31, { width: 460, align: "center" });
      }
    }

    const sectionStart = nfseNumber ? badgeY + badgeHeight + 18 : 145;

    // ── Prestador Section ────────────────────────────────────────────────────
    doc
      .fillColor("#f8fafc")
      .rect(50, sectionStart, doc.page.width - 100, 100)
      .fillAndStroke();

    doc
      .fillColor("#64748b")
      .fontSize(8)
      .font("Helvetica-Bold")
      .text("PRESTADOR DE SERVIÇOS", 65, sectionStart + 10);

    doc
      .fillColor("#1e293b")
      .fontSize(13)
      .font("Helvetica-Bold")
      .text(company.companyName, 65, sectionStart + 24);

    doc
      .fontSize(9)
      .font("Helvetica")
      .fillColor("#475569")
      .text(`CNPJ: ${company.cnpj}`, 65, sectionStart + 44)
      .text(`Inscrição Municipal: ${company.municipalRegistration}`, 65, sectionStart + 58)
      .text(company.address, 65, sectionStart + 72);

    // ── Tomador Section ──────────────────────────────────────────────────────
    const tomadorY = sectionStart + 120;

    doc
      .fillColor("#64748b")
      .fontSize(8)
      .font("Helvetica-Bold")
      .text("TOMADOR DE SERVIÇOS", 65, tomadorY);

    doc
      .fillColor("#1e293b")
      .fontSize(13)
      .font("Helvetica-Bold")
      .text(invoice.clientName, 65, tomadorY + 14);

    if (invoice.takerCPFCNPJ) {
      doc
        .fontSize(9)
        .font("Helvetica")
        .fillColor("#475569")
        .text(`${invoice.takerType ?? "CPF/CNPJ"}: ${invoice.takerCPFCNPJ}`, 65, tomadorY + 30);
    }

    // ── Service Details ──────────────────────────────────────────────────────
    const serviceY = tomadorY + 60;

    doc
      .rect(50, serviceY, doc.page.width - 100, 1)
      .fillColor("#e2e8f0")
      .fill();

    doc
      .fillColor("#64748b")
      .fontSize(8)
      .font("Helvetica-Bold")
      .text("DESCRIÇÃO DOS SERVIÇOS", 65, serviceY + 12);

    doc
      .fillColor("#1e293b")
      .fontSize(10)
      .font("Helvetica")
      .text(invoice.serviceDescription, 65, serviceY + 26, {
        width: doc.page.width - 130,
      });

    // ── Competence + Dates ───────────────────────────────────────────────────
    const datesY = serviceY + 80;

    doc
      .fillColor("#64748b")
      .fontSize(8)
      .font("Helvetica-Bold")
      .text("COMPETÊNCIA", 65, datesY)
      .text("DATA DE EMISSÃO", 220, datesY);

    doc
      .fillColor("#1e293b")
      .fontSize(10)
      .font("Helvetica")
      .text(invoice.competenceMonth, 65, datesY + 14)
      .text(formatDate(invoice.processedAt ?? invoice.createdAt), 220, datesY + 14);

    // ── Dados Fiscais (LC 116/2003, ISS, Regime) ─────────────────────────────
    const fiscalY = datesY + 42;

    doc
      .rect(50, fiscalY, doc.page.width - 100, 1)
      .fillColor("#e2e8f0")
      .fill();

    const issRate = parseFloat(company.issRate ?? "5.00");

    doc
      .fillColor("#64748b")
      .fontSize(8)
      .font("Helvetica-Bold")
      .text("CÓDIGO DO SERVIÇO (LC 116/2003)", 65, fiscalY + 10)
      .text("ALÍQUOTA ISS", 300, fiscalY + 10);

    if (taxRegime) {
      doc.text("REGIME TRIBUTÁRIO", 420, fiscalY + 10);
    }

    doc
      .fillColor("#1e293b")
      .fontSize(10)
      .font("Helvetica")
      .text(company.cTribNac, 65, fiscalY + 23)
      .text(`${issRate.toFixed(2).replace(".", ",")}%`, 300, fiscalY + 23);

    if (taxRegime) {
      doc.text(taxRegime, 420, fiscalY + 23);
    }

    // ── Values Table ─────────────────────────────────────────────────────────
    const tableY = fiscalY + 48;

    doc
      .rect(50, tableY, doc.page.width - 100, 30)
      .fillColor("#f1f5f9")
      .fill();

    doc
      .fillColor("#64748b")
      .fontSize(8)
      .font("Helvetica-Bold")
      .text("DESCRIÇÃO", 65, tableY + 10)
      .text("VALOR", doc.page.width - 160, tableY + 10, { width: 100, align: "right" });

    const rows: Array<[string, number]> = [
      ["Valor Bruto do Serviço", invoice.value],
    ];

    if (invoice.retISS && invoice.retISS > 0) rows.push(["(-) ISS Retido", -invoice.retISS]);
    if (invoice.retIRPJ && invoice.retIRPJ > 0) rows.push(["(-) IRPJ Retido", -invoice.retIRPJ]);
    if (invoice.retCSLL && invoice.retCSLL > 0) rows.push(["(-) CSLL Retido", -invoice.retCSLL]);
    if (invoice.retCOFINS && invoice.retCOFINS > 0) rows.push(["(-) COFINS Retido", -invoice.retCOFINS]);
    if (invoice.retPIS && invoice.retPIS > 0) rows.push(["(-) PIS Retido", -invoice.retPIS]);
    if (invoice.retINSS && invoice.retINSS > 0) rows.push(["(-) INSS Retido", -invoice.retINSS]);

    const totalRetencoes =
      (invoice.retISS ?? 0) +
      (invoice.retIRPJ ?? 0) +
      (invoice.retCSLL ?? 0) +
      (invoice.retCOFINS ?? 0) +
      (invoice.retPIS ?? 0) +
      (invoice.retINSS ?? 0);
    const valorLiquido = invoice.value - totalRetencoes;

    let rowY = tableY + 30;
    rows.forEach(([label, value], i) => {
      doc
        .rect(50, rowY, doc.page.width - 100, 22)
        .fillColor(i % 2 === 0 ? "#ffffff" : "#f8fafc")
        .fill();

      doc
        .fillColor(value < 0 ? "#dc2626" : "#1e293b")
        .fontSize(9)
        .font("Helvetica")
        .text(label, 65, rowY + 6)
        .text(value < 0 ? formatCurrency(-value) : formatCurrency(value), doc.page.width - 160, rowY + 6, {
          width: 100,
          align: "right",
        });

      rowY += 22;
    });

    doc
      .rect(50, rowY, doc.page.width - 100, 32)
      .fillColor("#1e293b")
      .fill();

    doc
      .fillColor("#ffffff")
      .fontSize(11)
      .font("Helvetica-Bold")
      .text("VALOR LÍQUIDO A RECEBER", 65, rowY + 10)
      .text(formatCurrency(valorLiquido), doc.page.width - 160, rowY + 10, {
        width: 100,
        align: "right",
      });

    rowY += 32;

    // ── QR Code + Footer ─────────────────────────────────────────────────────
    const footerY = rowY + 30;

    const qrBuffer = Buffer.from(qrCodeDataUrl.split(",")[1], "base64");
    doc.image(qrBuffer, 65, footerY, { width: 90, height: 90 });

    doc
      .fillColor("#64748b")
      .fontSize(7)
      .font("Helvetica")
      .text("Consulta de autenticidade:", 175, footerY + 10)
      .text(qrUrl, 175, footerY + 22, { width: 310 })
      .fillColor("#94a3b8")
      .text(`ID Interno: #${invoice.id} | Gerado em: ${formatDate(new Date())}`, 175, footerY + 50)
      .text("Emitido via AutoNF — autonf.com.br", 175, footerY + 63);

    doc.end();
  });
}
