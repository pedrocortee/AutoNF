import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import type { Invoice } from "../../drizzle/schema";
import type { CompanyConfig } from "../../drizzle/schema";

export interface PDFInvoiceData {
  invoice: Invoice;
  company: CompanyConfig;
  nfseNumber?: string | null;
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
  const { invoice, company, nfseNumber } = data;

  const qrVerificationUrl = nfseNumber
    ? `https://nfse.${company.municipality.toLowerCase().replace(/\s+/g, "")}.rs.gov.br/verificar?nfse=${nfseNumber}&cnpj=${company.cnpj}`
    : `https://autonf.com.br/verificar/${invoice.id}`;

  const qrCodeDataUrl = await QRCode.toDataURL(qrVerificationUrl, {
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
      .text("NFS-e — Emitida via AutoNF", 70, 92, { width: 460, align: "center" });

    // ── NFS-e Number badge ───────────────────────────────────────────────────
    const badgeY = 138;
    if (nfseNumber) {
      doc
        .rect(50, badgeY, doc.page.width - 100, 32)
        .fillColor("#f0fdf4")
        .strokeColor("#16a34a")
        .lineWidth(1)
        .fillAndStroke();

      doc
        .fillColor("#15803d")
        .fontSize(12)
        .font("Helvetica-Bold")
        .text(`NFS-e Nº ${nfseNumber}`, 70, badgeY + 10, { width: 460, align: "center" });
    }

    const sectionStart = nfseNumber ? 190 : 145;

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
      .fillColor("#1e293b")
      .fontSize(8)
      .font("Helvetica-Bold")
      .fillColor("#64748b")
      .text("TOMADOR DE SERVIÇOS", 65, tomadorY);

    doc
      .fillColor("#1e293b")
      .fontSize(13)
      .font("Helvetica-Bold")
      .text(invoice.clientName, 65, tomadorY + 14);

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

    // ── Values Table ─────────────────────────────────────────────────────────
    const tableY = datesY + 55;

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
      if (i % 2 === 0) {
        doc.rect(50, rowY, doc.page.width - 100, 22).fillColor("#ffffff").fill();
      } else {
        doc.rect(50, rowY, doc.page.width - 100, 22).fillColor("#f8fafc").fill();
      }

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

    // Total row
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
      .text(qrVerificationUrl, 175, footerY + 22, { width: 310 })
      .fillColor("#94a3b8")
      .text("Documento gerado por AutoNF — autonf.com.br", 175, footerY + 50)
      .text(`Gerado em: ${formatDate(new Date())} | ID Interno: #${invoice.id}`, 175, footerY + 64);

    doc.end();
  });
}
