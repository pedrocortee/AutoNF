import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { createRule, deleteRule, getClientCompany, getRule, listRules, updateRule } from "../clientCompaniesDb";
import { DOC_TYPES } from "../_core/inbound/schemas";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null));

const ruleInput = z
  .object({
    name: z.string().trim().min(2).max(120),
    companyId: z.number().int().nullable().default(null),
    matchIssuerDocument: optionalText(18).transform((v) => (v ? v.replace(/[^0-9A-Za-z]/g, "").toUpperCase() : null)),
    matchDocType: z.enum(DOC_TYPES).nullable().default(null),
    matchKeyword: optionalText(120),
    account: z.string().trim().min(1).max(40),
    costCenter: optionalText(40),
    historyTemplate: optionalText(255),
    priority: z.number().int().min(0).max(1000).default(100),
    active: z.boolean().default(true),
  })
  .refine((r) => r.matchIssuerDocument || r.matchDocType || r.matchKeyword, {
    message: "Informe pelo menos um critério: emitente, tipo de documento ou palavra-chave",
  });

async function assertCompany(userId: number, companyId: number | null) {
  if (companyId !== null && !(await getClientCompany(companyId, userId))) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Empresa não encontrada" });
  }
}

export const rulesRouter = router({
  list: protectedProcedure.query(({ ctx }) => listRules(ctx.user.id)),

  create: protectedProcedure.input(ruleInput).mutation(async ({ ctx, input }) => {
    await assertCompany(ctx.user.id, input.companyId);
    const id = await createRule({ ...input, userId: ctx.user.id });
    return { id };
  }),

  update: protectedProcedure
    .input(z.object({ id: z.number().int(), rule: ruleInput }))
    .mutation(async ({ ctx, input }) => {
      if (!(await getRule(input.id, ctx.user.id))) throw new TRPCError({ code: "NOT_FOUND", message: "Regra não encontrada" });
      await assertCompany(ctx.user.id, input.rule.companyId);
      await updateRule(input.id, ctx.user.id, input.rule);
      return { ok: true };
    }),

  delete: protectedProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
    await deleteRule(input.id, ctx.user.id);
    return { ok: true };
  }),
});
