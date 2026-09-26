import { and, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { getDb } from "./db";
import {
  clientCompanies,
  clientCompanyCertificates,
  dfeSummaries,
  dfeSyncState,
  type ClientCompanyCertificate,
  type DfeSyncState,
} from "../drizzle/inboundSchema";

async function db() {
  const d = await getDb();
  if (!d) throw new Error("Database not available");
  return d;
}

// ─── Certificates ────────────────────────────────────────────────────────────

export async function getCompanyCertificate(companyId: number, userId?: number): Promise<ClientCompanyCertificate | undefined> {
  const where = userId === undefined
    ? eq(clientCompanyCertificates.companyId, companyId)
    : and(eq(clientCompanyCertificates.companyId, companyId), eq(clientCompanyCertificates.userId, userId));
  const rows = await (await db()).select().from(clientCompanyCertificates).where(where).limit(1);
  return rows[0];
}

/** Certificate metadata (no secrets) per company, for listings. */
export async function certificateStatusByCompany(userId: number) {
  const rows = await (await db())
    .select({
      companyId: clientCompanyCertificates.companyId,
      subject: clientCompanyCertificates.subject,
      holderDocument: clientCompanyCertificates.holderDocument,
      validUntil: clientCompanyCertificates.validUntil,
    })
    .from(clientCompanyCertificates)
    .where(eq(clientCompanyCertificates.userId, userId));
  return new Map(rows.map((r) => [r.companyId, r]));
}

export async function saveCompanyCertificate(
  c: Omit<ClientCompanyCertificate, "id" | "createdAt" | "updatedAt">
): Promise<void> {
  const d = await db();
  const existing = await getCompanyCertificate(c.companyId, c.userId);
  if (existing) await d.update(clientCompanyCertificates).set(c).where(eq(clientCompanyCertificates.id, existing.id));
  else await d.insert(clientCompanyCertificates).values(c);
}

export async function deleteCompanyCertificate(companyId: number, userId: number): Promise<void> {
  await (await db())
    .delete(clientCompanyCertificates)
    .where(and(eq(clientCompanyCertificates.companyId, companyId), eq(clientCompanyCertificates.userId, userId)));
}

// ─── Sync state ──────────────────────────────────────────────────────────────

export async function getSyncState(companyId: number, service: "nfe" | "cte" = "nfe"): Promise<DfeSyncState | undefined> {
  const rows = await (await db())
    .select()
    .from(dfeSyncState)
    .where(and(eq(dfeSyncState.companyId, companyId), eq(dfeSyncState.service, service)))
    .limit(1);
  return rows[0];
}

export async function syncStateByCompany(userId: number): Promise<Map<number, DfeSyncState>> {
  const rows = await (await db())
    .select()
    .from(dfeSyncState)
    .where(and(eq(dfeSyncState.userId, userId), eq(dfeSyncState.service, "nfe")));
  return new Map(rows.map((r) => [r.companyId, r]));
}

export async function saveSyncState(
  s: Pick<DfeSyncState, "userId" | "companyId" | "service"> & Partial<Omit<DfeSyncState, "id" | "updatedAt">>
): Promise<void> {
  const d = await db();
  const existing = await getSyncState(s.companyId, s.service);
  if (existing) await d.update(dfeSyncState).set(s).where(eq(dfeSyncState.id, existing.id));
  else await d.insert(dfeSyncState).values(s);
}

/** Active companies with a certificate whose next NF-e sync is due. */
export async function companiesDueForSync(now: Date): Promise<{ userId: number; companyId: number }[]> {
  const rows = await (await db())
    .select({ userId: clientCompanyCertificates.userId, companyId: clientCompanyCertificates.companyId })
    .from(clientCompanyCertificates)
    .innerJoin(clientCompanies, eq(clientCompanies.id, clientCompanyCertificates.companyId))
    .leftJoin(dfeSyncState, and(eq(dfeSyncState.companyId, clientCompanyCertificates.companyId), eq(dfeSyncState.service, "nfe")))
    .where(
      and(
        eq(clientCompanies.active, true),
        or(isNull(dfeSyncState.nextAllowedAt), lte(dfeSyncState.nextAllowedAt, now))
      )
    );
  return rows;
}

// ─── Summaries (resNFe) ──────────────────────────────────────────────────────

export async function upsertSummary(s: typeof dfeSummaries.$inferInsert): Promise<void> {
  await (await db())
    .insert(dfeSummaries)
    .values(s)
    .onDuplicateKeyUpdate({ set: { nsu: s.nsu } });
}

export async function markSummariesFull(companyId: number, accessKeys: string[]): Promise<void> {
  if (accessKeys.length === 0) return;
  await (await db())
    .update(dfeSummaries)
    .set({ fullXmlAt: new Date() })
    .where(and(eq(dfeSummaries.companyId, companyId), inArray(dfeSummaries.accessKey, accessKeys)));
}
