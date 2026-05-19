import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
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
  createSubscription,
  getInvoiceUsageThisMonth,
  incrementInvoiceUsage,
  getPlanByName,
  upsertAsaasCustomer,
  getAsaasCustomerByUserId,
  createBillingInvoice,
  updateBillingInvoiceByAsaasPaymentId,
  getBillingInvoiceByAsaasPaymentId,
  listBillingInvoices,
  updateSubscriptionByUserId,
  getUserByIdFromDb,
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
import { savePDF, readPDF } from "./_core/storage";
import { dispatchWebhookEvent } from "./_core/webhookDispatcher";
import crypto from "crypto";
import { nfseQueue } from "./_core/queue";
import { getCertificatesExpiringSoon } from "./_core/certExpiryJob";
import {
  createAsaasCustomer,
  createAsaasSubscription,
  cancelAsaasSubscription,
  isAsaasConfigured,
} from "./_core/asaas";
import {
  getNFSeClient,
  isWithinCancellationDeadline,
  CANCELAMENTO_MOTIVOS,
} from "./_core/nfseIntegration";
import type { CancelamentoMotivo } from "./_core/cancelamentoGenerator";
import { COOKIE_NAME } from "@shared/const";
import { validateCertificate } from "./_core/certificateValidator";
import { decryptData } from "./_core/crypto";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
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
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
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

        const result = await createInvoice({
          userId: ctx.user.id,
          clientName: input.clientName,
          serviceDescription: input.serviceDescription,
          value: valueInCents,
          competenceMonth: input.competenceMonth,
          status: "Pendente",
          tomadorEmail: input.tomadorEmail ?? null,
          retIRPJ: Math.round((input.retentions?.irpj ?? 0) * 100),
          retCSLL: Math.round((input.retentions?.csll ?? 0) * 100),
          retCOFINS: Math.round((input.retentions?.cofins ?? 0) * 100),
          retPIS: Math.round((input.retentions?.pis ?? 0) * 100),
          retINSS: Math.round((input.retentions?.inss ?? 0) * 100),
          retISS,
        });

        const invoiceId = (result as any).insertId;

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
      return getActiveCertificate(ctx.user.id);
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

    getSubscription: protectedProcedure.query(async ({ ctx }) => {
      return getUserSubscription(ctx.user.id);
    }),

    subscribe: protectedProcedure
      .input(z.object({ planName: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const plan = await getPlanByName(input.planName);
        if (!plan) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Plano nao encontrado" });
        }

        await createSubscription(ctx.user.id, plan.id);
        return { success: true, plan };
      }),

    getUsage: protectedProcedure.query(async ({ ctx }) => {
      const subscription = await getUserSubscription(ctx.user.id);
      if (!subscription) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem plano ativo" });
      }

      const usage = await getInvoiceUsageThisMonth(ctx.user.id);
      return {
        usage,
        limit: subscription.plan.maxInvoicesPerMonth,
        remaining: Math.max(0, subscription.plan.maxInvoicesPerMonth - usage),
        percentage: Math.round((usage / subscription.plan.maxInvoicesPerMonth) * 100),
      };
    }),
  }),

  payments: router({
    /**
     * Create Asaas checkout for a plan.
     * Returns { paymentUrl } to redirect the user, or { directActivation: true }
     * when Asaas is not configured (dev mode).
     */
    createCheckout: protectedProcedure
      .input(z.object({ planName: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const plan = await getPlanByName(input.planName);
        if (!plan) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Plano não encontrado" });
        }

        if (!isAsaasConfigured()) {
          // Dev mode: activate directly without payment
          await createSubscription(ctx.user.id, plan.id);
          return { directActivation: true, paymentUrl: null };
        }

        // Get or create Asaas customer
        let asaasCustomerRecord = await getAsaasCustomerByUserId(ctx.user.id);
        if (!asaasCustomerRecord) {
          const user = await getUserByIdFromDb(ctx.user.id);
          const asaasCustomer = await createAsaasCustomer({
            name: user?.name ?? `User ${ctx.user.id}`,
            email: user?.email ?? `user${ctx.user.id}@autonf.com.br`,
          });
          await upsertAsaasCustomer(ctx.user.id, asaasCustomer.id);
          asaasCustomerRecord = await getAsaasCustomerByUserId(ctx.user.id);
        }

        if (!asaasCustomerRecord) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao criar cliente no Asaas" });
        }

        // Create Asaas subscription (UNDEFINED billing type → user chooses on checkout page)
        const asaasSub = await createAsaasSubscription({
          customerId: asaasCustomerRecord.asaasCustomerId,
          value: plan.pricePerMonth / 100,
          planName: plan.name,
        });

        // Create pending billing invoice
        const nextDueDate = new Date().toISOString().split("T")[0];
        await createBillingInvoice({
          userId: ctx.user.id,
          planName: plan.name,
          amount: plan.pricePerMonth,
          dueDate: nextDueDate,
          asaasSubscriptionId: asaasSub.id,
          status: "pending",
        });

        return {
          directActivation: false,
          paymentUrl: asaasSub.paymentLink ?? null,
          asaasSubscriptionId: asaasSub.id,
        };
      }),

    cancelSubscription: protectedProcedure.mutation(async ({ ctx }) => {
      const subscription = await getUserSubscription(ctx.user.id);
      if (!subscription) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Nenhuma assinatura ativa" });
      }

      if (isAsaasConfigured()) {
        // Find billing invoice with asaasSubscriptionId to cancel in Asaas
        const asaasCustomer = await getAsaasCustomerByUserId(ctx.user.id);
        if (asaasCustomer) {
          const invoices = await listBillingInvoices(ctx.user.id);
          const latest = invoices.find(inv => inv.asaasSubscriptionId);
          if (latest?.asaasSubscriptionId) {
            try {
              await cancelAsaasSubscription(latest.asaasSubscriptionId);
            } catch (err) {
              console.warn("[Payments] Failed to cancel Asaas subscription:", err);
            }
          }
        }
      }

      await updateSubscriptionByUserId(ctx.user.id, { status: "cancelled" });
      return { success: true };
    }),
  }),

  billing: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return listBillingInvoices(ctx.user.id);
    }),
  }),

  webhooks: router({
    /**
     * Asaas webhook handler — public endpoint.
     * Configure in Asaas dashboard: POST /api/trpc/webhooks.asaas
     */
    asaas: publicProcedure
      .input(
        z.object({
          event: z.string(),
          payment: z
            .object({
              id: z.string(),
              customer: z.string(),
              subscription: z.string().optional(),
              value: z.number(),
              billingType: z.string(),
              status: z.string(),
              dueDate: z.string(),
              paymentDate: z.string().optional(),
              invoiceUrl: z.string().optional(),
            })
            .optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { event, payment } = input;

        if (!payment) return { ok: true };

        const existingInvoice = await getBillingInvoiceByAsaasPaymentId(payment.id);

        if (event === "PAYMENT_CONFIRMED" || event === "PAYMENT_RECEIVED") {
          // Activate subscription
          if (existingInvoice) {
            await updateBillingInvoiceByAsaasPaymentId(payment.id, {
              status: "confirmed",
              paymentMethod: payment.billingType,
            });

            // Find userId via billing invoice and activate subscription
            const userId = existingInvoice.userId;
            const planName = existingInvoice.planName;
            const plan = await getPlanByName(planName);
            if (plan && userId) {
              await createSubscription(userId, plan.id);
            }
          }
        }

        if (event === "PAYMENT_OVERDUE") {
          if (existingInvoice) {
            await updateBillingInvoiceByAsaasPaymentId(payment.id, { status: "overdue" });
          }
        }

        if (event === "PAYMENT_DELETED" || event === "SUBSCRIPTION_DELETED") {
          if (existingInvoice) {
            await updateBillingInvoiceByAsaasPaymentId(payment.id, { status: "cancelled" });
            await updateSubscriptionByUserId(existingInvoice.userId, { status: "cancelled" });
          }
        }

        return { ok: true };
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
        const id = (result as any).insertId as number;
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
          pdfBuffer = readPDF(invoice.pdfPath);
        }

        // On-demand generation for older invoices or if file was lost
        if (!pdfBuffer) {
          const company = await getCompanyConfig(ctx.user.id);
          if (!company) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Dados da empresa não configurados" });
          }
          pdfBuffer = await generateNFSePDF({ invoice, company, nfseNumber: invoice.nfseNumber });
          const pdfPath = savePDF(input.invoiceId, pdfBuffer);
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
  }),
});

export type AppRouter = typeof appRouter;
