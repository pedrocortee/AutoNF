import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getCompanyConfig } from "../db";
import {
  countInboundByStatus,
  getInboundDocument,
  inboundStats,
  listInboundDocuments,
  listInboundEvents,
  transitionInbound,
  updateInboundDocument,
} from "../inboundDb";
import { INBOUND_STATUSES } from "../../drizzle/inboundSchema";
import { DOC_TYPES, extractedDocumentSchema } from "../_core/inbound/schemas";
import { validateDocument } from "../_core/inbound/validators";
import { enqueueInbound } from "../_core/inbound/queue";

async function ownedDocument(id: number, userId: number) {
  const doc = await getInboundDocument(id, userId);
  if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "Documento não encontrado" });
  return doc;
}

export const inboundRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        status: z.enum(INBOUND_STATUSES).optional(),
        docType: z.enum(DOC_TYPES).optional(),
        search: z.string().max(100).optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(25),
      })
    )
    .query(async ({ ctx, input }) => {
      const { items, total } = await listInboundDocuments(ctx.user.id, {
        status: input.status,
        docType: input.docType,
        search: input.search?.trim() || undefined,
        limit: input.pageSize,
        offset: (input.page - 1) * input.pageSize,
      });
      return { items, total, page: input.page, pageSize: input.pageSize };
    }),

  counts: protectedProcedure.query(({ ctx }) => countInboundByStatus(ctx.user.id)),

  get: protectedProcedure.input(z.object({ id: z.number().int() })).query(async ({ ctx, input }) => {
    const doc = await ownedDocument(input.id, ctx.user.id);
    const events = await listInboundEvents(doc.id);
    const { storageKey: _s, sha256: _h, ...safe } = doc;
    return { document: safe, events };
  }),

  /** Saves a reviewer's corrections and re-runs validation. Does not change status. */
  update: protectedProcedure
    .input(z.object({ id: z.number().int(), extracted: extractedDocumentSchema }))
    .mutation(async ({ ctx, input }) => {
      const doc = await ownedDocument(input.id, ctx.user.id);
      if (doc.status !== "revisao" && doc.status !== "aprovado") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Só é possível editar documentos em revisão ou aprovados" });
      }
      const company = await getCompanyConfig(ctx.user.id);
      const d = input.extracted;
      const issues = validateDocument(d, { companyDocument: company?.cnpj ?? null, method: doc.method ?? "llm" });
      await updateInboundDocument(doc.id, {
        extracted: d,
        issues,
        docType: d.docType,
        accessKey: d.accessKey,
        issuerDocument: d.issuer.document,
        issuerName: d.issuer.name,
        recipientDocument: d.recipient.document,
        issueDate: d.issueDate,
        dueDate: d.dueDate,
        totalCents: d.totalCents,
      });
      return { issues };
    }),

  approve: protectedProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
    const doc = await ownedDocument(input.id, ctx.user.id);
    if (doc.status !== "revisao") throw new TRPCError({ code: "BAD_REQUEST", message: "Documento não está em revisão" });
    if ((doc.issues ?? []).some((i) => i.severity === "error")) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Corrija os erros de validação ou descarte o documento" });
    }
    await transitionInbound(doc.id, "aprovado", {
      actorUserId: ctx.user.id,
      note: "Aprovado na revisão",
      patch: { reviewedBy: ctx.user.id, reviewedAt: new Date() },
    });
    return { ok: true };
  }),

  discard: protectedProcedure
    .input(z.object({ id: z.number().int(), reason: z.string().min(3).max(500) }))
    .mutation(async ({ ctx, input }) => {
      const doc = await ownedDocument(input.id, ctx.user.id);
      if (doc.status === "exportado") throw new TRPCError({ code: "BAD_REQUEST", message: "Documento já exportado" });
      await transitionInbound(doc.id, "descartado", {
        actorUserId: ctx.user.id,
        note: input.reason,
        patch: { reviewedBy: ctx.user.id, reviewedAt: new Date() },
      });
      return { ok: true };
    }),

  reprocess: protectedProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
    const doc = await ownedDocument(input.id, ctx.user.id);
    if (doc.status !== "erro") throw new TRPCError({ code: "BAD_REQUEST", message: "Só documentos com erro podem ser reprocessados" });
    await transitionInbound(doc.id, "recebido", { actorUserId: ctx.user.id, note: "Reprocessamento solicitado", patch: { errorMessage: null } });
    await enqueueInbound(doc.id);
    return { ok: true };
  }),

  stats: protectedProcedure
    .input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() }))
    .query(({ ctx, input }) => inboundStats(ctx.user.id, input.month)),
});
