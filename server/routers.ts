import { systemRouter } from "./_core/systemRouter";
import { inboundRouter } from "./routers/inbound";
import { companiesRouter } from "./routers/companies";
import { rulesRouter } from "./routers/rules";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import { BillingError, cancelPlan, checkout, syncPendingPayment } from "./_core/billing";
import { billingDeps } from "./billingService";
import { getCurrentSubscription, liveAsaasSubscriptions } from "./billingDb";
import { inboundAllowance } from "./_core/inbound/quota";

async function billingCall<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof BillingError) throw new TRPCError({ code: err.code, message: err.message });
    throw err;
  }
}
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  getUserInvoices,
  getInvoiceMetrics,
  createInvoice,
  addInvoiceHistory,
  getInvoiceById,
  getInvoiceHistory,
  updateInvoiceStatus,
  upsertCompanyConfig,
  getCompanyConfig,
  uploadDigitalCertificate,
  getActiveCertificate,
  listCertificates,
  getAllPlans,
  getUserSubscription,
  getInvoiceUsageThisMonth,
  incrementInvoiceUsage,
  listBillingInvoices,
  saveNFSeNumber,
  setInvoiceJob,
  getInvoiceByIdempotencyKey,
  setPrivacyConsent,
  deleteUserAndData,
  listWebhookEndpoints,
  getWebhookEndpointById,
  createWebhookEndpoint,
  updateWebhookEndpoint,
  deleteWebhookEndpoint,
  listWebhookDeliveries,
  savePdfPath,
  getNotificationPrefs,
  upsertNotificationPrefs,
} from "./db";
import { generateNFSePDF } from "./_core/pdfGenerator";
import { sendTestEmail } from "./_core/emailService";
import { savePDF, readPDF } from "./_core/storage";
import { dispatchWebhookEvent } from "./_core/webhookDispatcher";
import crypto from "crypto";
import { nfseQueue } from "./_core/queue";
import { getCertificatesExpiringSoon } from "./_core/certExpiryJob";
import { isAsaasConfigured } from "./_core/asaas";
import {
  getNFSeClient,
  isWithinCancellationDeadline,
  CANCELAMENTO_MOTIVOS,
} from "./_core/nfseIntegration";
import type { CancelamentoMotivo } from "./_core/cancelamentoGenerator";
import { validateCertificate } from "./_core/certificateValidator";
import { decryptData } from "./_core/crypto";

export const appRouter = router({
  system: systemRouter,
  inbound: inboundRouter,
  companies: companiesRouter,
  rules: rulesRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(() => {
      return { success: true } as const;
    }),
    acceptPrivacy: protectedProcedure.mutation(async ({ ctx }) => {
      await setPrivacyConsent(ctx.user.id);
      return { success: true };
    }),
  }),

  account: router({
    deleteAccount: protectedProcedure.mutation(async ({ ctx }) => {
      await deleteUserAndData(ctx.user.id);
      return { success: true };
    }),
  }),

  invoices: router({
    list: protectedProcedure
      .input(
        z.object({
          status: z.enum(["Pendente", "Processado", "Erro"]).optional(),
          clientName: z.string().optional(),
          competenceMonth: z.string().optional(),
          limit: z.number().default(50),
          offset: z.number().default(0),
        })
      )
      .query(async ({ ctx, input }) => {
        return getUserInvoices(ctx.user.id, input);
      }),

    metrics: protectedProcedure.query(async ({ ctx }) => {
      return getInvoiceMetrics(ctx.user.id);
    }),

    create: protectedProcedure
      .input(
        z.object({
          clientName: z.string().min(1, "Cliente é obrigatório"),
          serviceDescription: z.string().min(1, "Descrição do serviço é obrigatória"),
          value: z.number().min(1, "Valor deve ser maior que 0"),
          competenceMonth: z.string().regex(/^\d{4}-\d{2}$/, "Formato deve ser YYYY-MM"),
          retentions: z
            .object({
              irpj: z.number().min(0).default(0),
              csll: z.number().min(0).default(0),
              cofins: z.number().min(0).default(0),
              pis: z.number().min(0).default(0),
              inss: z.number().min(0).default(0),
            })
            .optional(),
          tomadorEmail: z.string().email().optional(),
          takerCPFCNPJ: z.string().regex(/^\d{11}$|^\d{14}$/, "CPF (11 dígitos) ou CNPJ (14 dígitos)").optional(),
          takerType: z.enum(["CPF", "CNPJ"]).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const subscription = await getUserSubscription(ctx.user.id);
        if (!subscription) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Nenhum plano ativo" });
        }

        const usage = await getInvoiceUsageThisMonth(ctx.user.id);
        if (usage >= subscription.plan.maxInvoicesPerMonth) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Limite de emissoes atingido" });
        }

        const company = await getCompanyConfig(ctx.user.id);
        const issRateDecimal = parseFloat(company?.issRate ?? "5") / 100;
        const valueInCents = Math.round(input.value * 100);
        const retISS = Math.round(valueInCents * issRateDecimal);

        const isFree = subscription.plan.pricePerMonth === 0;
        const expiresAt = isFree
          ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          : null;

        const result = await createInvoice({
          userId: ctx.user.id,
          clientName: input.clientName,
          serviceDescription: input.serviceDescription,
          value: valueInCents,
          competenceMonth: input.competenceMonth,
          status: "Pendente",
          tomadorEmail: input.tomadorEmail ?? null,
          takerCPFCNPJ: input.takerCPFCNPJ ?? null,
          takerType: input.takerType ?? null,
          retIRPJ: Math.round((input.retentions?.irpj ?? 0) * 100),
          retCSLL: Math.round((input.retentions?.csll ?? 0) * 100),
          retCOFINS: Math.round((input.retentions?.cofins ?? 0) * 100),
          retPIS: Math.round((input.retentions?.pis ?? 0) * 100),
          retINSS: Math.round((input.retentions?.inss ?? 0) * 100),
          retISS,
          ...(expiresAt && { expiresAt }),
        });

        const invoiceId = (result as any)[0].insertId;

        await incrementInvoiceUsage(ctx.user.id);
        await addInvoiceHistory(invoiceId, "Criado", "Pendente", "Nota fiscal criada");

        dispatchWebhookEvent(ctx.user.id, "invoice.created", {
          invoiceId,
          clientName: input.clientName,
          serviceDescription: input.serviceDescription,
          value: valueInCents,
          competenceMonth: input.competenceMonth,
          createdAt: new Date().toISOString(),
        });

        return { id: invoiceId, status: "Pendente" };
      }),

    processInvoice: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const invoice = await getInvoiceById(input.id);
        if (!invoice || invoice.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }

        const shouldError = Math.random() < 0.1;

        if (shouldError) {
          await updateInvoiceStatus(input.id, "Erro", "Erro simulado na validação");
          await addInvoiceHistory(input.id, "Pendente", "Erro", "Falha na validação com prefeitura");
          return { status: "Erro" };
        } else {
          await updateInvoiceStatus(input.id, "Processado");
          await addInvoiceHistory(input.id, "Pendente", "Processado", "Emitida com sucesso");
          return { status: "Processado" };
        }
      }),

    detail: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const invoice = await getInvoiceById(input.id);
        if (!invoice || invoice.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const history = await getInvoiceHistory(input.id);
        return { invoice, history };
      }),

    cancelInvoice: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          motivo: z.enum(["1", "2", "3", "4"] as [CancelamentoMotivo, ...CancelamentoMotivo[]]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const invoice = await getInvoiceById(input.id);
        if (!invoice || invoice.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }

        if (invoice.status !== "Processado") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Apenas notas com status Processado podem ser canceladas",
          });
        }

        if (!invoice.nfseNumber) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Número da NFS-e não encontrado. A nota pode não ter sido emitida pela API municipal.",
          });
        }

        const company = await getCompanyConfig(ctx.user.id);
        if (!company) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Dados da empresa não configurados" });
        }

        const cert = await getActiveCertificate(ctx.user.id);
        if (!cert) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Certificado digital não configurado" });
        }

        // Map company municipality to IBGE code
        const municipalityCodeMap: Record<string, string> = {
          "porto alegre": "4314902",
          "caxias do sul": "4305108",
          "novo hamburgo": "4313409",
        };
        const municipalityCode =
          municipalityCodeMap[company.municipality.toLowerCase()] ?? "4314902";

        // Check cancellation deadline
        const deadlineCheck = isWithinCancellationDeadline(
          invoice.processedAt ?? invoice.updatedAt,
          municipalityCode
        );

        if (!deadlineCheck.within) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Prazo de cancelamento expirado. Esta nota foi emitida há ${deadlineCheck.daysElapsed} dias (limite: ${deadlineCheck.deadlineDays} dias).`,
          });
        }

        try {
          const decryptedPassword = decryptData(cert.encryptedPassword);
          const nfseClient = getNFSeClient(municipalityCode, "homologacao");

          const result = await nfseClient.cancelNFSeWithCertificate({
            cancelData: {
              nfseNumber: invoice.nfseNumber,
              providerCNPJ: company.cnpj,
              providerInscricaoMunicipal: company.municipalRegistration,
              municipalityCode,
              motivo: input.motivo,
            },
            certificateData: cert.certificateData,
            certificatePassword: decryptedPassword,
            environment: "homologacao",
          });

          if (result.success) {
            await updateInvoiceStatus(input.id, "Cancelado");
            await addInvoiceHistory(
              input.id,
              "Processado",
              "Cancelado",
              `NFS-e cancelada. Motivo: ${CANCELAMENTO_MOTIVOS[input.motivo]}. Protocolo: ${result.protocolNumber ?? "N/A"}`
            );
            dispatchWebhookEvent(ctx.user.id, "invoice.cancelled", {
              invoiceId: input.id,
              nfseNumber: invoice.nfseNumber,
              motivo: CANCELAMENTO_MOTIVOS[input.motivo],
              protocolNumber: result.protocolNumber ?? null,
              cancelledAt: new Date().toISOString(),
            });
            return { success: true, protocolNumber: result.protocolNumber };
          } else {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: result.error ?? "Erro ao cancelar NFS-e na prefeitura",
            });
          }
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }),
  }),

  company: router({
    getConfig: protectedProcedure.query(async ({ ctx }) => {
      return getCompanyConfig(ctx.user.id);
    }),

    updateConfig: protectedProcedure
      .input(
        z.object({
          cnpj: z.string().regex(/^\d{14}$/, "CNPJ deve ter 14 dígitos"),
          municipalRegistration: z.string().min(1, "Inscrição Municipal é obrigatória"),
          companyName: z.string().min(1, "Razão Social é obrigatória"),
          address: z.string().min(1, "Endereço é obrigatório"),
          municipality: z.string().min(1, "Município é obrigatório"),
          state: z.string().regex(/^[A-Z]{2}$/, "Estado deve ser uma sigla de 2 letras"),
          issRate: z.number().min(2).max(5).default(5),
          cTribNac: z.string().regex(/^\d{4,6}$/, "Código de 4 a 6 dígitos").default("0107"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await upsertCompanyConfig({
          userId: ctx.user.id,
          ...input,
          issRate: String(input.issRate),
        });
        return { success: true };
      }),
  }),

  certificates: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return listCertificates(ctx.user.id);
    }),

    getActive: protectedProcedure.query(async ({ ctx }) => {
      return (await getActiveCertificate(ctx.user.id)) ?? null;
    }),

    expirySoon: protectedProcedure.query(async ({ ctx }) => {
      const all = await getCertificatesExpiringSoon(30);
      const userCerts = all.filter((c) => c.userId === ctx.user.id);
      if (userCerts.length === 0) return null;

      const cert = userCerts[0];
      const now = new Date();
      const validUntil = cert.validUntil ? new Date(cert.validUntil) : null;
      const daysLeft = validUntil
        ? Math.ceil((validUntil.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : null;

      return { filename: cert.filename, validUntil: cert.validUntil, daysLeft };
    }),

    upload: protectedProcedure
      .input(
        z.object({
          filename: z.string().min(1),
          certificateData: z.string().min(1, "Arquivo de certificado é obrigatório"),
          encryptedPassword: z.string().min(1, "Senha do certificado é obrigatória"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // Validate certificate
        let certInfo;
        try {
          certInfo = validateCertificate(input.certificateData, input.encryptedPassword);
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error instanceof Error ? error.message : "Certificado inválido",
          });
        }

        // Upload certificate with validated info
        await uploadDigitalCertificate({
          userId: ctx.user.id,
          filename: input.filename,
          certificateData: input.certificateData,
          encryptedPassword: input.encryptedPassword,
          subject: certInfo.subject,
          issuer: certInfo.issuer,
          validFrom: certInfo.validFrom,
          validUntil: certInfo.validUntil,
          isActive: "true",
        });
        return { success: true };
      }),
  }),

  plans: router({
    list: publicProcedure.query(async () => {
      return getAllPlans();
    }),

    /** Current plan, including a paused one (payment overdue) so the UI can offer to pay it */
    getSubscription: protectedProcedure.query(async ({ ctx }) => {
      return (await getCurrentSubscription(ctx.user.id)) ?? null;
    }),

    getUsage: protectedProcedure.query(async ({ ctx }) => {
      const subscription = await getCurrentSubscription(ctx.user.id);
      if (!subscription) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem plano ativo" });
      }
      const usage = await getInvoiceUsageThisMonth(ctx.user.id);
      const limit = subscription.plan.maxInvoicesPerMonth;
      return {
        usage,
        limit,
        remaining: Math.max(0, limit - usage),
        percentage: Math.min(100, Math.round((usage / limit) * 100)),
      };
    }),

    inboundUsage: protectedProcedure.query(({ ctx }) => inboundAllowance(ctx.user)),
  }),

  payments: router({
    /**
     * Starts the purchase of a plan. Free plan (or local dev without Asaas) activates directly;
     * paid plans return the Asaas checkout page and are activated only by the confirmed payment.
     */
    createCheckout: protectedProcedure
      .input(z.object({ planName: z.string().max(50) }))
      .mutation(({ ctx, input }) => billingCall(() => checkout(billingDeps, ctx.user.id, input.planName))),

    /** "Já paguei": checks Asaas directly in case the webhook is late. */
    syncSubscription: protectedProcedure.mutation(async ({ ctx }) => {
      const current = await getCurrentSubscription(ctx.user.id);
      if (!isAsaasConfigured()) {
        return { activated: false, alreadyActive: current?.status === "active", planName: current?.plan.name ?? null };
      }
      const r = await billingCall(() => syncPendingPayment(billingDeps, ctx.user.id));
      if (r.activated) return { activated: true, alreadyActive: false, planName: r.planName };
      const waiting = (await liveAsaasSubscriptions(ctx.user.id)).some((s) => s.status === "pending" || s.status === "overdue");
      return { activated: false, alreadyActive: !waiting && current?.status === "active", planName: current?.plan.name ?? null };
    }),

    cancelSubscription: protectedProcedure.mutation(async ({ ctx }) => {
      await billingCall(() => cancelPlan(billingDeps, ctx.user.id));
      return { success: true };
    }),
  }),

  billing: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return listBillingInvoices(ctx.user.id);
    }),
  }),

  webhookEndpoints: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return listWebhookEndpoints(ctx.user.id);
    }),

    create: protectedProcedure
      .input(
        z.object({
          url: z.string().url("URL inválida"),
          description: z.string().max(255).optional(),
          events: z
            .array(
              z.enum([
                "invoice.created",
                "invoice.processed",
                "invoice.error",
                "invoice.cancelled",
              ])
            )
            .min(1, "Selecione pelo menos um evento"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const secret = crypto.randomBytes(32).toString("hex");
        const result = await createWebhookEndpoint({
          userId: ctx.user.id,
          url: input.url,
          description: input.description ?? null,
          events: JSON.stringify(input.events),
          secret,
          isActive: "true",
        });
        const id = (result as any)[0].insertId as number;
        return { id, secret };
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          url: z.string().url().optional(),
          description: z.string().max(255).optional(),
          events: z
            .array(
              z.enum([
                "invoice.created",
                "invoice.processed",
                "invoice.error",
                "invoice.cancelled",
              ])
            )
            .min(1)
            .optional(),
          isActive: z.boolean().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { id, ...rest } = input;
        const ep = await getWebhookEndpointById(id, ctx.user.id);
        if (!ep) throw new TRPCError({ code: "NOT_FOUND" });

        await updateWebhookEndpoint(id, ctx.user.id, {
          ...(rest.url !== undefined && { url: rest.url }),
          ...(rest.description !== undefined && { description: rest.description }),
          ...(rest.events !== undefined && { events: JSON.stringify(rest.events) }),
          ...(rest.isActive !== undefined && { isActive: rest.isActive ? "true" : "false" }),
        });
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const ep = await getWebhookEndpointById(input.id, ctx.user.id);
        if (!ep) throw new TRPCError({ code: "NOT_FOUND" });
        await deleteWebhookEndpoint(input.id, ctx.user.id);
        return { success: true };
      }),

    deliveries: protectedProcedure
      .input(z.object({ endpointId: z.number() }))
      .query(async ({ ctx, input }) => {
        const ep = await getWebhookEndpointById(input.endpointId, ctx.user.id);
        if (!ep) throw new TRPCError({ code: "NOT_FOUND" });
        return listWebhookDeliveries(input.endpointId, 20);
      }),
  }),

  nfse: router({
    /**
     * Enqueue async NFS-e emission job.
     * Returns immediately with jobId; frontend polls nfse.status for updates.
     */
    submitRPS: protectedProcedure
      .input(z.object({ invoiceId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const invoice = await getInvoiceById(input.invoiceId);
        if (!invoice || invoice.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }

        if (invoice.status === "Processando") {
          return { jobId: invoice.jobId, status: "Processando" as const };
        }

        if (invoice.status === "Processado") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nota já foi processada" });
        }

        if (invoice.status === "Cancelado") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nota cancelada não pode ser reemitida" });
        }

        // Idempotency: one RPS per invoice
        const idempotencyKey = `rps-invoice-${input.invoiceId}`;
        const existing = await getInvoiceByIdempotencyKey(idempotencyKey);
        if (existing && existing.id !== input.invoiceId) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "RPS já enviado para esta nota (chave de idempotência duplicada)",
          });
        }

        const job = await nfseQueue.add(
          `emit-rps-${input.invoiceId}`,
          { invoiceId: input.invoiceId, userId: ctx.user.id, idempotencyKey },
          { jobId: idempotencyKey }
        );

        await setInvoiceJob(input.invoiceId, job.id!, idempotencyKey);
        await addInvoiceHistory(input.invoiceId, "Pendente", "Processando", "Emissão enfileirada para processamento assíncrono");

        return { jobId: job.id, status: "Processando" as const };
      }),

    /** Poll endpoint: returns current invoice status for the frontend. */
    status: protectedProcedure
      .input(z.object({ invoiceId: z.number() }))
      .query(async ({ ctx, input }) => {
        const invoice = await getInvoiceById(input.invoiceId);
        if (!invoice || invoice.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        return {
          status: invoice.status,
          jobId: invoice.jobId ?? null,
          nfseNumber: invoice.nfseNumber ?? null,
          errorMessage: invoice.errorMessage ?? null,
        };
      }),
  }),

  /**
   * PDF download endpoint.
   * Returns the PDF for a processed invoice as a base64-encoded string.
   * If the PDF hasn't been generated yet (older invoices), generates it on-demand.
   */
  pdf: router({
    get: protectedProcedure
      .input(z.object({ invoiceId: z.number() }))
      .query(async ({ ctx, input }) => {
        const invoice = await getInvoiceById(input.invoiceId);
        if (!invoice || invoice.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }

        if (invoice.status !== "Processado") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "PDF disponível apenas para notas processadas",
          });
        }

        // Try to read existing PDF from storage
        let pdfBuffer: Buffer | null = null;
        if (invoice.pdfPath) {
          pdfBuffer = await readPDF(invoice.pdfPath);
        }

        // On-demand generation for older invoices or if file was lost
        if (!pdfBuffer) {
          const company = await getCompanyConfig(ctx.user.id);
          if (!company) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Dados da empresa não configurados" });
          }
          pdfBuffer = await generateNFSePDF({ invoice, company, nfseNumber: invoice.nfseNumber });
          const pdfPath = await savePDF(input.invoiceId, pdfBuffer);
          await savePdfPath(input.invoiceId, pdfPath);
        }

        return { pdf: pdfBuffer.toString("base64"), filename: `nfse-${invoice.nfseNumber ?? invoice.id}.pdf` };
      }),
  }),

  notifications: router({
    getPrefs: protectedProcedure.query(async ({ ctx }) => {
      const prefs = await getNotificationPrefs(ctx.user.id);
      return {
        emailTomadorOnSuccess: prefs?.emailTomadorOnSuccess !== "false",
        emailPrestadorOnError: prefs?.emailPrestadorOnError !== "false",
        defaultTomadorEmail: prefs?.defaultTomadorEmail ?? null,
      };
    }),

    updatePrefs: protectedProcedure
      .input(
        z.object({
          emailTomadorOnSuccess: z.boolean().optional(),
          emailPrestadorOnError: z.boolean().optional(),
          defaultTomadorEmail: z.string().email().nullable().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await upsertNotificationPrefs(ctx.user.id, {
          ...(input.emailTomadorOnSuccess !== undefined && {
            emailTomadorOnSuccess: input.emailTomadorOnSuccess ? "true" : "false",
          }),
          ...(input.emailPrestadorOnError !== undefined && {
            emailPrestadorOnError: input.emailPrestadorOnError ? "true" : "false",
          }),
          ...(input.defaultTomadorEmail !== undefined && {
            defaultTomadorEmail: input.defaultTomadorEmail ?? undefined,
          }),
        });
        return { success: true };
      }),

    sendTestEmail: protectedProcedure
      .input(z.object({ toEmail: z.string().email() }))
      .mutation(async ({ ctx, input }) => {
        const company = await getCompanyConfig(ctx.user.id);
        await sendTestEmail({
          toEmail: input.toEmail,
          companyName: company?.companyName ?? "AutoNF",
        });
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
