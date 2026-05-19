import nodemailer from "nodemailer";
import type { Invoice } from "../../drizzle/schema";
import type { CompanyConfig } from "../../drizzle/schema";

function createTransport() {
  if (process.env.RESEND_API_KEY) {
    // Resend SMTP gateway
    return nodemailer.createTransport({
      host: "smtp.resend.com",
      port: 465,
      secure: true,
      auth: { user: "resend", pass: process.env.RESEND_API_KEY },
    });
  }

  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" }
        : undefined,
    });
  }

  return null;
}

const FROM_ADDRESS = process.env.EMAIL_FROM ?? "noreply@autonf.com.br";

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function buildSuccessHtml(invoice: Invoice, company: CompanyConfig): string {
  const valorLiquido =
    invoice.value -
    (invoice.retISS ?? 0) -
    (invoice.retIRPJ ?? 0) -
    (invoice.retCSLL ?? 0) -
    (invoice.retCOFINS ?? 0) -
    (invoice.retPIS ?? 0) -
    (invoice.retINSS ?? 0);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">
    <div style="background:#1e293b;padding:32px;text-align:center;">
      <p style="color:#94a3b8;margin:0;font-size:12px;text-transform:uppercase;letter-spacing:.08em;">AutoNF</p>
      <h1 style="color:#fff;margin:8px 0 0;font-size:22px;">Nota Fiscal Emitida</h1>
    </div>
    <div style="padding:32px;">
      <p style="color:#475569;margin:0 0 24px;">Olá, <strong style="color:#1e293b;">${invoice.clientName}</strong>!</p>
      <p style="color:#475569;margin:0 0 24px;">
        A empresa <strong style="color:#1e293b;">${company.companyName}</strong> emitiu uma Nota Fiscal de Serviços em seu nome.
        O PDF está anexado a este email.
      </p>

      <div style="background:#f1f5f9;border-radius:8px;padding:20px;margin-bottom:24px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="color:#64748b;font-size:12px;padding:4px 0;">Número NFS-e</td>
            <td style="color:#1e293b;font-weight:bold;text-align:right;padding:4px 0;">${invoice.nfseNumber ?? "—"}</td>
          </tr>
          <tr>
            <td style="color:#64748b;font-size:12px;padding:4px 0;">Serviço</td>
            <td style="color:#1e293b;text-align:right;padding:4px 0;font-size:13px;">${invoice.serviceDescription}</td>
          </tr>
          <tr>
            <td style="color:#64748b;font-size:12px;padding:4px 0;">Competência</td>
            <td style="color:#1e293b;text-align:right;padding:4px 0;">${invoice.competenceMonth}</td>
          </tr>
          <tr>
            <td style="color:#64748b;font-size:12px;padding:4px 0;">Valor Bruto</td>
            <td style="color:#1e293b;text-align:right;padding:4px 0;">${formatCurrency(invoice.value)}</td>
          </tr>
          <tr style="border-top:2px solid #e2e8f0;">
            <td style="color:#1e293b;font-weight:bold;padding:8px 0 4px;">Valor Líquido</td>
            <td style="color:#16a34a;font-weight:bold;font-size:18px;text-align:right;padding:8px 0 4px;">${formatCurrency(valorLiquido)}</td>
          </tr>
        </table>
      </div>

      <p style="color:#94a3b8;font-size:12px;margin:0;">
        Dúvidas? Entre em contato com ${company.companyName}.
      </p>
    </div>
    <div style="background:#f8fafc;padding:16px;text-align:center;border-top:1px solid #e2e8f0;">
      <p style="color:#94a3b8;font-size:11px;margin:0;">Emitido por AutoNF · autonf.com.br</p>
    </div>
  </div>
</body>
</html>`;
}

function buildErrorHtml(invoice: Invoice, errorMessage: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">
    <div style="background:#dc2626;padding:32px;text-align:center;">
      <p style="color:#fca5a5;margin:0;font-size:12px;text-transform:uppercase;letter-spacing:.08em;">AutoNF</p>
      <h1 style="color:#fff;margin:8px 0 0;font-size:22px;">Falha na Emissão</h1>
    </div>
    <div style="padding:32px;">
      <p style="color:#475569;margin:0 0 16px;">
        A emissão da Nota Fiscal nº <strong style="color:#1e293b;">${invoice.id}</strong> para o tomador
        <strong style="color:#1e293b;">${invoice.clientName}</strong> falhou após todas as tentativas.
      </p>

      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin-bottom:24px;">
        <p style="color:#991b1b;font-weight:bold;margin:0 0 8px;font-size:13px;">Motivo do Erro</p>
        <p style="color:#b91c1c;margin:0;font-size:13px;font-family:monospace;">${errorMessage}</p>
      </div>

      <div style="background:#f1f5f9;border-radius:8px;padding:16px;margin-bottom:24px;">
        <p style="color:#64748b;font-size:12px;margin:0 0 8px;">Dados da nota:</p>
        <p style="color:#1e293b;margin:0;font-size:13px;">
          Tomador: ${invoice.clientName}<br/>
          Serviço: ${invoice.serviceDescription}<br/>
          Valor: ${formatCurrency(invoice.value)}<br/>
          Competência: ${invoice.competenceMonth}
        </p>
      </div>

      <p style="color:#475569;font-size:13px;margin:0;">
        Acesse o <a href="https://autonf.com.br/dashboard" style="color:#2563eb;">painel AutoNF</a>
        para reenviar a nota ou entrar em contato com o suporte.
      </p>
    </div>
    <div style="background:#f8fafc;padding:16px;text-align:center;border-top:1px solid #e2e8f0;">
      <p style="color:#94a3b8;font-size:11px;margin:0;">AutoNF · autonf.com.br</p>
    </div>
  </div>
</body>
</html>`;
}

export async function sendInvoiceSuccessEmail(opts: {
  toEmail: string;
  invoice: Invoice;
  company: CompanyConfig;
  pdfBuffer: Buffer;
}): Promise<void> {
  const transport = createTransport();
  if (!transport) return;

  await transport.sendMail({
    from: `AutoNF <${FROM_ADDRESS}>`,
    to: opts.toEmail,
    subject: `NFS-e Emitida — ${opts.company.companyName} · ${formatCurrency(opts.invoice.value)}`,
    html: buildSuccessHtml(opts.invoice, opts.company),
    attachments: [
      {
        filename: `nfse-${opts.invoice.nfseNumber ?? opts.invoice.id}.pdf`,
        content: opts.pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });
}

export async function sendInvoiceErrorEmail(opts: {
  toEmail: string;
  invoice: Invoice;
  errorMessage: string;
}): Promise<void> {
  const transport = createTransport();
  if (!transport) return;

  await transport.sendMail({
    from: `AutoNF <${FROM_ADDRESS}>`,
    to: opts.toEmail,
    subject: `Falha na emissão — NF #${opts.invoice.id} para ${opts.invoice.clientName}`,
    html: buildErrorHtml(opts.invoice, opts.errorMessage),
  });
}
