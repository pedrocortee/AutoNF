import { Worker, Job } from "bullmq";
import IORedis from "ioredis";
import { NFSE_QUEUE_NAME, type NFSeJobData } from "./queue";
import {
  getInvoiceById,
  getCompanyConfig,
  getActiveCertificate,
  updateInvoiceStatus,
  addInvoiceHistory,
  saveNFSeNumber,
  savePdfPath,
  getNotificationPrefs,
  getUserByIdFromDb,
} from "../db";
import { getNFSeClient, SefinNacionalClient } from "./nfseIntegration";
import { generateRPSXML, validateRPSData } from "./rpsGenerator";
import { signXMLWithCertificate } from "./xmlSigner";
import { decryptData } from "./crypto";
import { dispatchWebhookEvent } from "./webhookDispatcher";
import { generateNFSePDF } from "./pdfGenerator";
import { savePDF } from "./storage";
import { sendInvoiceSuccessEmail, sendInvoiceErrorEmail } from "./emailService";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// "homologacao" em dev; "producao" somente quando NFSE_ENV=producao explícito
const NFSE_ENV: "homologacao" | "producao" =
  process.env.NFSE_ENV === "producao" ? "producao" : "homologacao";

async function processNFSeJob(job: Job<NFSeJobData>): Promise<void> {
  const { invoiceId, userId } = job.data;

  const invoice = await getInvoiceById(invoiceId);
  if (!invoice || invoice.userId !== userId) {
    throw new Error(`Invoice ${invoiceId} not found or access denied`);
  }

  // Already finished by a previous attempt that partially succeeded
  if (invoice.status === "Processado" || invoice.status === "Cancelado") {
    return;
  }

  const company = await getCompanyConfig(userId);
  if (!company) throw new Error("Dados da empresa não configurados");

  const cert = await getActiveCertificate(userId);
  if (!cert) throw new Error("Certificado digital não configurado");

  const municipalityCodeMap: Record<string, string> = {
    "porto alegre": "4314902",
    "caxias do sul": "4305108",
    "canoas": "4304606",
    "novo hamburgo": "4313409",
    "pelotas": "4314407",
    "são leopoldo": "4318705",
    "sao leopoldo": "4318705",
    "gravataí": "4309209",
    "viamão": "4322400",
    "sapucaia do sul": "4320008",
  };
  const municipalityCode = municipalityCodeMap[company.municipality.toLowerCase()] ?? "4314902";

  const decryptedPassword = decryptData(cert.encryptedPassword);
  const issRate = parseFloat(company.issRate ?? "5");

  let result: { success: boolean; nfseNumber?: string; issueDate?: string; error?: string };

  if (municipalityCode === "4314902") {
    // Porto Alegre migrou para SEFIN Nacional em Nov/2025 — usa DPS + JWT, não RPS
    const sefinClient = new SefinNacionalClient(NFSE_ENV);
    const vBCCents = invoice.value; // no deductions at this stage
    const vISSQNCents = Math.round(vBCCents * issRate / 100);

    const sefinResult = await sefinClient.submitDPS({
      cnpj: company.cnpj,
      certificateData: cert.certificateData,
      certificatePassword: decryptedPassword,
      dpsData: {
        serie: "1",
        nDPS: String(invoice.id),
        dCompet: invoice.competenceMonth,
        tpAmb: NFSE_ENV === "producao" ? 1 : 2,
        cLocEmi: "4314902",
        cLocPrestacao: "4314902",
        providerCNPJ: company.cnpj,
        providerIM: company.municipalRegistration,
        opSimpNac: 2, // não optante do Simples — ajustar se necessário
        regEspTrib: 0,
        takerType: "CNPJ", // placeholder; ajustar quando o cadastro tiver CPFCNPJ do tomador
        takerDocument: "00000000000000",
        takerName: invoice.clientName,
        cTribNac: "0107", // Serviços de TI — confirmar na lista nacional LC 116/2003
        xDescServ: invoice.serviceDescription,
        vServ: invoice.value,
        pAliqAplic: issRate,
        vISSQN: invoice.retISS ?? vISSQNCents,
        tpRetISSQN: (invoice.retISS ?? 0) > 0 ? 1 : 2,
        retIRPJ:   invoice.retIRPJ   ?? 0,
        retCSLL:   invoice.retCSLL   ?? 0,
        retCOFINS: invoice.retCOFINS ?? 0,
        retPIS:    invoice.retPIS    ?? 0,
        retINSS:   invoice.retINSS   ?? 0,
      },
    });

    result = {
      success: sefinResult.success,
      nfseNumber: sefinResult.nNFSe,
      issueDate: sefinResult.dhEmi,
      error: sefinResult.error,
    };
  } else {
    // Demais municípios: fluxo ABRASF / SOAP existente
    const rpsData = {
      rpsNumber: String(invoice.id),
      seriesNumber: "1",
      rpsType: "RPS" as const,
      municipalityCode,
      providerCNPJ: company.cnpj,
      providerInscriptionMunicipal: company.municipalRegistration,
      takerName: invoice.clientName,
      takerCPFCNPJ: "00000000000000",
      serviceDescription: invoice.serviceDescription,
      serviceValue: invoice.value,
      competenceMonth: invoice.competenceMonth,
      rpsDate: new Date().toISOString().split("T")[0],
      issRate,
      retISS: invoice.retISS ?? 0,
      retIRPJ: invoice.retIRPJ ?? 0,
      retCSLL: invoice.retCSLL ?? 0,
      retCOFINS: invoice.retCOFINS ?? 0,
      retPIS: invoice.retPIS ?? 0,
      retINSS: invoice.retINSS ?? 0,
    };

    const validation = validateRPSData(rpsData);
    if (!validation.valid) {
      throw new Error(validation.errors.join(", "));
    }

    const rpsXml = generateRPSXML(rpsData);
    const signedXml = signXMLWithCertificate({
      certificateData: cert.certificateData,
      certificatePassword: decryptedPassword,
      xmlContent: rpsXml,
    }).signedXml;

    const nfseClient = getNFSeClient(municipalityCode, NFSE_ENV);
    const rpsResult = await nfseClient.submitRPS({
      rpsXml: signedXml,
      cnpj: company.cnpj,
      inscriptionMunicipal: company.municipalRegistration,
    });

    result = {
      success: rpsResult.success,
      nfseNumber: rpsResult.nfseNumber,
      issueDate: rpsResult.issueDate,
      error: rpsResult.error,
    };
  }

  if (result.success) {
    await updateInvoiceStatus(invoiceId, "Processado");
    if (result.nfseNumber) await saveNFSeNumber(invoiceId, result.nfseNumber);
    await addInvoiceHistory(
      invoiceId,
      "Processando",
      "Processado",
      `NFS-e emitida com sucesso. Número: ${result.nfseNumber}`
    );
    dispatchWebhookEvent(userId, "invoice.processed", {
      invoiceId,
      nfseNumber: result.nfseNumber ?? null,
      processedAt: new Date().toISOString(),
    });

    // Re-fetch invoice with updated nfseNumber for PDF generation
    const updatedInvoice = await getInvoiceById(invoiceId);
    if (updatedInvoice && company) {
      try {
        const pdfBuffer = await generateNFSePDF({
          invoice: updatedInvoice,
          company,
          nfseNumber: result.nfseNumber,
        });
        const pdfPath = savePDF(invoiceId, pdfBuffer);
        await savePdfPath(invoiceId, pdfPath);

        // Send email to tomador if configured
        const prefs = await getNotificationPrefs(userId);
        const tomadorEmail = updatedInvoice.tomadorEmail ?? prefs?.defaultTomadorEmail;
        if (prefs?.emailTomadorOnSuccess !== "false" && tomadorEmail) {
          sendInvoiceSuccessEmail({
            toEmail: tomadorEmail,
            invoice: updatedInvoice,
            company,
            pdfBuffer,
          }).catch((err) => console.error("[Worker] Failed to send success email:", err));
        }
      } catch (pdfErr) {
        // PDF failure must not fail the job — NFS-e was already emitted
        console.error("[Worker] PDF/email error (non-fatal):", pdfErr);
      }
    }
  } else {
    // Throw so BullMQ can retry
    throw new Error(result.error ?? "Erro desconhecido na emissão");
  }
}

export function startNFSeWorker(): Worker<NFSeJobData> {
  const connection = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  const worker = new Worker<NFSeJobData>(NFSE_QUEUE_NAME, processNFSeJob, {
    connection,
    concurrency: 5,
  });

  worker.on("completed", (job) => {
    console.log(`[NFSeWorker] Job ${job.id} completed for invoice ${job.data.invoiceId}`);
  });

  // DLQ: after all 3 attempts exhausted, mark invoice as Erro
  worker.on("failed", async (job, error) => {
    if (!job) return;

    const isLastAttempt = job.attemptsMade >= (job.opts.attempts ?? 3);
    console.error(
      `[NFSeWorker] Job ${job.id} failed (attempt ${job.attemptsMade}): ${error.message}`
    );

    if (isLastAttempt) {
      console.error(`[NFSeWorker] Job ${job.id} moved to DLQ after ${job.attemptsMade} attempts`);
      try {
        await updateInvoiceStatus(job.data.invoiceId, "Erro", error.message);
        await addInvoiceHistory(
          job.data.invoiceId,
          "Processando",
          "Erro",
          `Falha após ${job.attemptsMade} tentativas: ${error.message}`
        );
        dispatchWebhookEvent(job.data.userId, "invoice.error", {
          invoiceId: job.data.invoiceId,
          error: error.message,
          attempts: job.attemptsMade,
        });

        // Send error notification to the prestador (account owner)
        const prefs = await getNotificationPrefs(job.data.userId);
        if (prefs?.emailPrestadorOnError !== "false") {
          const user = await getUserByIdFromDb(job.data.userId);
          const prestadorEmail = user?.email;
          if (prestadorEmail) {
            const failedInvoice = await getInvoiceById(job.data.invoiceId);
            if (failedInvoice) {
              sendInvoiceErrorEmail({
                toEmail: prestadorEmail,
                invoice: failedInvoice,
                errorMessage: error.message,
              }).catch((err) => console.error("[Worker] Failed to send error email:", err));
            }
          }
        }
      } catch (dbError) {
        console.error("[NFSeWorker] Failed to update invoice status after DLQ:", dbError);
      }
    }
  });

  worker.on("error", (error) => {
    console.error("[NFSeWorker] Worker error:", error);
  });

  return worker;
}
