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
import { encryptData } from "../_core/crypto";
import { readA1Certificate } from "../_core/sefaz/certificate";
import { runCompanySync, sefazEnv } from "../_core/sefaz/dfeRunner";
import { certificateStatusByCompany, deleteCompanyCertificate, saveCompanyCertificate, syncStateByCompany } from "../dfeDb";

/** IBGE state codes accepted as cUFAutor */
const UF_CODES = new Set([11, 12, 13, 14, 15, 16, 17, 21, 22, 23, 24, 25, 26, 27, 28, 29, 31, 32, 33, 35, 41, 42, 43, 50, 51, 52, 53]);

async function ownedCompany(id: number, userId: number) {
  const company = await getClientCompany(id, userId);
  if (!company) throw new TRPCError({ code: "NOT_FOUND", message: "Empresa não encontrada" });
  return company;
}

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
      const [companies, pending, certs, syncs] = await Promise.all([
        listClientCompanies(ctx.user.id, { includeInactive: input?.includeInactive }),
        pendingByCompany(ctx.user.id),
        certificateStatusByCompany(ctx.user.id),
        syncStateByCompany(ctx.user.id),
      ]);
      const empty = { revisao: 0, aprovado: 0, total: 0 };
      return {
        companies: companies.map((c) => {
          const cert = certs.get(c.id);
          const sync = syncs.get(c.id);
          return {
            ...c,
            pending: pending.get(c.id) ?? empty,
            certificate: cert ? { validUntil: cert.validUntil, holderDocument: cert.holderDocument } : null,
            capture: sync
              ? { lastSyncAt: sync.lastSyncAt, nextAllowedAt: sync.nextAllowedAt, statusCode: sync.lastStatusCode, statusMessage: sync.lastStatusMessage, lastReceived: sync.lastReceived }
              : null,
          };
        }),
        unassigned: pending.get(null) ?? empty,
        captureEnv: sefazEnv(),
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

  /** A1 certificate (PFX in base64) used to capture the company's NF-e from SEFAZ. */
  uploadCertificate: protectedProcedure
    .input(
      z.object({
        companyId: z.number().int(),
        pfxBase64: z.string().min(100).max(90_000),
        password: z.string().min(1).max(200),
        ufCode: z.number().int().refine((n) => UF_CODES.has(n), "UF inválida"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const company = await ownedCompany(input.companyId, ctx.user.id);
      let a1;
      try {
        a1 = readA1Certificate(input.pfxBase64, input.password);
      } catch (err) {
        throw new TRPCError({ code: "BAD_REQUEST", message: (err as Error).message });
      }
      const now = new Date();
      if (a1.validUntil < now) throw new TRPCError({ code: "BAD_REQUEST", message: `Certificado vencido em ${a1.validUntil.toLocaleDateString("pt-BR")}` });
      // SEFAZ only answers for the certificate's own CNPJ root (first 8 digits)
      if (a1.holderDocument && a1.holderDocument.slice(0, 8) !== company.document.slice(0, 8)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `O certificado é de outro CNPJ (${a1.holderDocument})` });
      }
      await saveCompanyCertificate({
        userId: ctx.user.id,
        companyId: company.id,
        encryptedPfx: encryptData(input.pfxBase64.replace(/^data:[^,]*,/, "")),
        encryptedPassword: encryptData(input.password),
        ufCode: input.ufCode,
        subject: a1.subject.slice(0, 500),
        issuer: a1.issuer.slice(0, 500),
        holderDocument: a1.holderDocument,
        validFrom: a1.validFrom,
        validUntil: a1.validUntil,
        thumbprint: a1.thumbprint,
      });
      return { validUntil: a1.validUntil, holderDocument: a1.holderDocument, subject: a1.subject };
    }),

  removeCertificate: protectedProcedure.input(z.object({ companyId: z.number().int() })).mutation(async ({ ctx, input }) => {
    await ownedCompany(input.companyId, ctx.user.id);
    await deleteCompanyCertificate(input.companyId, ctx.user.id);
    return { ok: true };
  }),

  syncNow: protectedProcedure.input(z.object({ companyId: z.number().int() })).mutation(async ({ ctx, input }) => {
    await ownedCompany(input.companyId, ctx.user.id);
    try {
      return await runCompanySync(ctx.user.id, input.companyId, { force: true });
    } catch (err) {
      throw new TRPCError({ code: "BAD_REQUEST", message: (err as Error).message });
    }
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
