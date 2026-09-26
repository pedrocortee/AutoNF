import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createClientCompany,
  findClientCompanyByDocument,
  getClientCompany,
  listClientCompanies,
  pendingByCompany,
  routeOrphanDocuments,
  updateClientCompany,
} from "../clientCompaniesDb";
import { isValidDocument } from "../_core/inbound/checksums";
import { revalidateCompanyDocuments } from "../_core/inbound/revalidate";
import { cleanDocument, parseCompanyLine } from "../_core/inbound/companyImport";

const documentInput = z
  .string()
  .transform(cleanDocument)
  .refine((d) => /^(\d{11}|[0-9A-Z]{12}\d{2})$/.test(d) && isValidDocument(d), "CNPJ/CPF inválido");

async function register(userId: number, document: string, name: string, externalCode: string | null) {
  const id = await createClientCompany({ userId, document, name, externalCode });
  const routed = await routeOrphanDocuments(userId, id, document);
  const { approved } = routed > 0 ? await revalidateCompanyDocuments(userId, id, document) : { approved: 0 };
  return { id, routed, approved };
}

export const companiesRouter = router({
  list: protectedProcedure
    .input(z.object({ includeInactive: z.boolean().default(false) }).optional())
    .query(async ({ ctx, input }) => {
      const [companies, pending] = await Promise.all([
        listClientCompanies(ctx.user.id, { includeInactive: input?.includeInactive }),
        pendingByCompany(ctx.user.id),
      ]);
      const empty = { revisao: 0, aprovado: 0, total: 0 };
      return {
        companies: companies.map((c) => ({ ...c, pending: pending.get(c.id) ?? empty })),
        unassigned: pending.get(null) ?? empty,
      };
    }),

  create: protectedProcedure
    .input(z.object({ document: documentInput, name: z.string().trim().min(2).max(255), externalCode: z.string().trim().max(40).optional() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await findClientCompanyByDocument(ctx.user.id, input.document);
      if (existing) throw new TRPCError({ code: "CONFLICT", message: `Empresa já cadastrada: ${existing.name}` });
      return register(ctx.user.id, input.document, input.name, input.externalCode || null);
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number().int(),
        name: z.string().trim().min(2).max(255).optional(),
        externalCode: z.string().trim().max(40).nullable().optional(),
        active: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const company = await getClientCompany(input.id, ctx.user.id);
      if (!company) throw new TRPCError({ code: "NOT_FOUND", message: "Empresa não encontrada" });
      const { id, ...patch } = input;
      await updateClientCompany(id, ctx.user.id, { ...patch, externalCode: patch.externalCode === "" ? null : patch.externalCode });
      return { ok: true };
    }),

  /** One company per line: "CNPJ;Razão social;Código" (separator ; , or tab; código optional). */
  bulkImport: protectedProcedure
    .input(z.object({ text: z.string().max(200_000) }))
    .mutation(async ({ ctx, input }) => {
      const created: string[] = [];
      const skipped: { line: number; text: string; reason: string }[] = [];
      let routed = 0;
      let approved = 0;
      const lines = input.text.split(/\r?\n/);
      for (const [i, raw] of lines.entries()) {
        const line = raw.trim();
        if (!line) continue;
        const parsed = parseCompanyLine(line);
        if (!parsed.ok) {
          // Header rows ("CNPJ;Nome") are skipped silently
          if (!(i === 0 && parsed.header)) skipped.push({ line: i + 1, text: line.slice(0, 80), reason: parsed.reason });
          continue;
        }
        const { document, name: nameRaw, externalCode } = parsed;
        if (await findClientCompanyByDocument(ctx.user.id, document)) {
          skipped.push({ line: i + 1, text: line.slice(0, 80), reason: "Já cadastrada" });
          continue;
        }
        const r = await register(ctx.user.id, document, nameRaw, externalCode);
        routed += r.routed;
        approved += r.approved;
        created.push(nameRaw);
      }
      return { created: created.length, skipped, routed, approved };
    }),
});
