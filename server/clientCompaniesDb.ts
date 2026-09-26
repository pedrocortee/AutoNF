import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { getCompanyConfig, getDb } from "./db";
import {
  clientCompanies,
  inboundDocuments,
  mappingRules,
  type ClientCompany,
  type InsertClientCompany,
  type InsertMappingRule,
  type MappingRule,
} from "../drizzle/inboundSchema";

async function db() {
  const d = await getDb();
  if (!d) throw new Error("Database not available");
  return d;
}

// ─── Client companies ────────────────────────────────────────────────────────

export async function listClientCompanies(userId: number, opts: { includeInactive?: boolean } = {}): Promise<ClientCompany[]> {
  const where = opts.includeInactive
    ? eq(clientCompanies.userId, userId)
    : and(eq(clientCompanies.userId, userId), eq(clientCompanies.active, true));
  return (await db()).select().from(clientCompanies).where(where).orderBy(asc(clientCompanies.name));
}

export async function getClientCompany(id: number, userId: number): Promise<ClientCompany | undefined> {
  const rows = await (await db())
    .select()
    .from(clientCompanies)
    .where(and(eq(clientCompanies.id, id), eq(clientCompanies.userId, userId)))
    .limit(1);
  return rows[0];
}

export async function findClientCompanyByDocument(userId: number, document: string): Promise<ClientCompany | undefined> {
  const rows = await (await db())
    .select()
    .from(clientCompanies)
    .where(and(eq(clientCompanies.userId, userId), eq(clientCompanies.document, document)))
    .limit(1);
  return rows[0];
}

export async function createClientCompany(c: InsertClientCompany): Promise<number> {
  const result = await (await db()).insert(clientCompanies).values(c);
  return (result as any)[0].insertId as number;
}

export async function updateClientCompany(id: number, userId: number, patch: Partial<InsertClientCompany>): Promise<void> {
  await (await db())
    .update(clientCompanies)
    .set(patch)
    .where(and(eq(clientCompanies.id, id), eq(clientCompanies.userId, userId)));
}

/**
 * Companies a document can be routed to. Accounts that have not registered any client
 * company fall back to their own issuing company (single-company users keep working).
 */
export async function routingTargets(userId: number): Promise<{ companyId: number | null; document: string }[]> {
  const companies = await listClientCompanies(userId);
  if (companies.length > 0) return companies.map((c) => ({ companyId: c.id, document: c.document }));
  const own = await getCompanyConfig(userId);
  return own ? [{ companyId: null, document: own.cnpj }] : [];
}

/** Pending work per company, for the companies page and the inbox filter. */
export async function pendingByCompany(userId: number): Promise<Map<number | null, { revisao: number; aprovado: number; total: number }>> {
  const rows = await (await db())
    .select({
      companyId: inboundDocuments.companyId,
      revisao: sql<number>`sum(case when ${inboundDocuments.status} = 'revisao' then 1 else 0 end)`,
      aprovado: sql<number>`sum(case when ${inboundDocuments.status} = 'aprovado' then 1 else 0 end)`,
      total: sql<number>`sum(case when ${inboundDocuments.status} <> 'descartado' then 1 else 0 end)`,
    })
    .from(inboundDocuments)
    .where(eq(inboundDocuments.userId, userId))
    .groupBy(inboundDocuments.companyId);
  return new Map(rows.map((r) => [r.companyId, { revisao: Number(r.revisao), aprovado: Number(r.aprovado), total: Number(r.total) }]));
}

/** Assigns unrouted documents whose recipient matches a (new) company. Returns how many moved. */
export async function routeOrphanDocuments(userId: number, companyId: number, document: string): Promise<number> {
  const result = await (await db())
    .update(inboundDocuments)
    .set({ companyId })
    .where(
      and(
        eq(inboundDocuments.userId, userId),
        isNull(inboundDocuments.companyId),
        eq(inboundDocuments.recipientDocument, document)
      )
    );
  return (result as any)[0].affectedRows ?? 0;
}

// ─── Mapping rules ───────────────────────────────────────────────────────────

export async function listRules(userId: number): Promise<MappingRule[]> {
  return (await db()).select().from(mappingRules).where(eq(mappingRules.userId, userId)).orderBy(asc(mappingRules.priority), asc(mappingRules.id));
}

/** Active rules that can apply to a company (its own + global ones). */
export async function rulesForCompany(userId: number, companyId: number | null): Promise<MappingRule[]> {
  const scope = companyId === null ? isNull(mappingRules.companyId) : or(isNull(mappingRules.companyId), eq(mappingRules.companyId, companyId));
  return (await db())
    .select()
    .from(mappingRules)
    .where(and(eq(mappingRules.userId, userId), eq(mappingRules.active, true), scope));
}

export async function rulesForCompanies(userId: number): Promise<MappingRule[]> {
  return (await db()).select().from(mappingRules).where(and(eq(mappingRules.userId, userId), eq(mappingRules.active, true)));
}

export async function getRule(id: number, userId: number): Promise<MappingRule | undefined> {
  const rows = await (await db()).select().from(mappingRules).where(and(eq(mappingRules.id, id), eq(mappingRules.userId, userId))).limit(1);
  return rows[0];
}

export async function createRule(r: InsertMappingRule): Promise<number> {
  const result = await (await db()).insert(mappingRules).values(r);
  return (result as any)[0].insertId as number;
}

export async function updateRule(id: number, userId: number, patch: Partial<InsertMappingRule>): Promise<void> {
  await (await db()).update(mappingRules).set(patch).where(and(eq(mappingRules.id, id), eq(mappingRules.userId, userId)));
}

export async function deleteRule(id: number, userId: number): Promise<void> {
  await (await db()).delete(mappingRules).where(and(eq(mappingRules.id, id), eq(mappingRules.userId, userId)));
}

export async function companiesByIds(userId: number, ids: number[]): Promise<Map<number, ClientCompany>> {
  if (ids.length === 0) return new Map();
  const rows = await (await db())
    .select()
    .from(clientCompanies)
    .where(and(eq(clientCompanies.userId, userId), inArray(clientCompanies.id, ids)));
  return new Map(rows.map((c) => [c.id, c]));
}
