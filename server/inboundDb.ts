import { and, desc, eq, inArray, isNull, like, ne, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "./db";
import {
  inboundDocumentEvents,
  inboundDocuments,
  type InboundDocument,
  type InboundDocumentEvent,
  type InboundStatus,
  type InsertInboundDocument,
} from "../drizzle/inboundSchema";

async function db() {
  const d = await getDb();
  if (!d) throw new Error("Database not available");
  return d;
}

export async function findInboundBySha(userId: number, sha256: string): Promise<InboundDocument | undefined> {
  const rows = await (await db())
    .select()
    .from(inboundDocuments)
    .where(and(eq(inboundDocuments.userId, userId), eq(inboundDocuments.sha256, sha256)))
    .limit(1);
  return rows[0];
}

export async function createInboundDocument(doc: InsertInboundDocument): Promise<number> {
  const result = await (await db()).insert(inboundDocuments).values(doc);
  return (result as any)[0].insertId as number;
}

export async function getInboundDocument(id: number, userId?: number): Promise<InboundDocument | undefined> {
  const where = userId === undefined
    ? eq(inboundDocuments.id, id)
    : and(eq(inboundDocuments.id, id), eq(inboundDocuments.userId, userId));
  const rows = await (await db()).select().from(inboundDocuments).where(where).limit(1);
  return rows[0];
}

export async function updateInboundDocument(id: number, patch: Partial<InsertInboundDocument>): Promise<void> {
  await (await db()).update(inboundDocuments).set(patch).where(eq(inboundDocuments.id, id));
}

/** Updates status (plus any extra fields) and records the transition. */
export async function transitionInbound(
  id: number,
  toStatus: InboundStatus,
  opts: { actorUserId?: number | null; note?: string | null; patch?: Partial<InsertInboundDocument> } = {}
): Promise<void> {
  const current = await getInboundDocument(id);
  if (!current) throw new Error(`Inbound document ${id} not found`);
  await updateInboundDocument(id, { ...opts.patch, status: toStatus });
  await (await db()).insert(inboundDocumentEvents).values({
    documentId: id,
    fromStatus: current.status,
    toStatus,
    actorUserId: opts.actorUserId ?? null,
    note: opts.note ?? null,
  });
}

export async function recordInboundCreated(id: number, note: string): Promise<void> {
  await (await db()).insert(inboundDocumentEvents).values({ documentId: id, fromStatus: null, toStatus: "recebido", note });
}

export async function listInboundEvents(documentId: number): Promise<InboundDocumentEvent[]> {
  return (await db())
    .select()
    .from(inboundDocumentEvents)
    .where(eq(inboundDocumentEvents.documentId, documentId))
    .orderBy(inboundDocumentEvents.id);
}

/** An earlier, non-discarded document with the same access key (duplicate detection). */
export async function findActiveByAccessKey(userId: number, accessKey: string, excludeId: number): Promise<InboundDocument | undefined> {
  const rows = await (await db())
    .select()
    .from(inboundDocuments)
    .where(
      and(
        eq(inboundDocuments.userId, userId),
        eq(inboundDocuments.accessKey, accessKey),
        ne(inboundDocuments.id, excludeId),
        ne(inboundDocuments.status, "descartado")
      )
    )
    .orderBy(inboundDocuments.id)
    .limit(1);
  return rows[0];
}

/**
 * Candidates for a duplicate when there is no access key (municipal NFS-e PDFs, boletos):
 * same type, issuer, issue date and amount. Number matching is done by the caller.
 */
export async function findDuplicateCandidates(
  userId: number,
  m: { docType: NonNullable<InboundDocument["docType"]>; issuerDocument: string; issueDate: string; totalCents: number },
  excludeId: number
): Promise<InboundDocument[]> {
  return (await db())
    .select()
    .from(inboundDocuments)
    .where(
      and(
        eq(inboundDocuments.userId, userId),
        eq(inboundDocuments.docType, m.docType),
        eq(inboundDocuments.issuerDocument, m.issuerDocument),
        eq(inboundDocuments.issueDate, m.issueDate),
        eq(inboundDocuments.totalCents, m.totalCents),
        ne(inboundDocuments.id, excludeId),
        ne(inboundDocuments.status, "descartado")
      )
    )
    .orderBy(inboundDocuments.id)
    .limit(5);
}

/** undefined = all companies, null = documents not routed to any company */
export type CompanyFilter = number | null | undefined;

function companyCond(companyId: CompanyFilter): SQL | undefined {
  if (companyId === undefined) return undefined;
  return companyId === null ? isNull(inboundDocuments.companyId) : eq(inboundDocuments.companyId, companyId);
}

export interface InboundListFilters {
  status?: InboundStatus;
  docType?: NonNullable<InboundDocument["docType"]>;
  companyId?: CompanyFilter;
  search?: string;
  limit: number;
  offset: number;
}

export async function listInboundDocuments(userId: number, f: InboundListFilters) {
  const conds = [eq(inboundDocuments.userId, userId)];
  if (f.status) conds.push(eq(inboundDocuments.status, f.status));
  if (f.docType) conds.push(eq(inboundDocuments.docType, f.docType));
  const cc = companyCond(f.companyId);
  if (cc) conds.push(cc);
  if (f.search) {
    const q = `%${f.search}%`;
    conds.push(
      or(
        like(inboundDocuments.issuerName, q),
        like(inboundDocuments.issuerDocument, q),
        like(inboundDocuments.originalFilename, q),
        like(inboundDocuments.accessKey, q)
      )!
    );
  }
  const where = and(...conds);
  const d = await db();
  const [items, [{ total }]] = await Promise.all([
    d
      .select({
        id: inboundDocuments.id,
        companyId: inboundDocuments.companyId,
        status: inboundDocuments.status,
        docType: inboundDocuments.docType,
        source: inboundDocuments.source,
        originalFilename: inboundDocuments.originalFilename,
        issuerName: inboundDocuments.issuerName,
        issuerDocument: inboundDocuments.issuerDocument,
        issueDate: inboundDocuments.issueDate,
        dueDate: inboundDocuments.dueDate,
        totalCents: inboundDocuments.totalCents,
        confidence: inboundDocuments.confidence,
        method: inboundDocuments.method,
        createdAt: inboundDocuments.createdAt,
      })
      .from(inboundDocuments)
      .where(where)
      .orderBy(desc(inboundDocuments.id))
      .limit(f.limit)
      .offset(f.offset),
    d.select({ total: sql<number>`count(*)` }).from(inboundDocuments).where(where),
  ]);
  return { items, total: Number(total) };
}

export async function countInboundByStatus(userId: number, companyId?: CompanyFilter): Promise<Record<InboundStatus, number>> {
  const rows = await (await db())
    .select({ status: inboundDocuments.status, n: sql<number>`count(*)` })
    .from(inboundDocuments)
    .where(and(eq(inboundDocuments.userId, userId), companyCond(companyId)))
    .groupBy(inboundDocuments.status);
  const out = { recebido: 0, processando: 0, revisao: 0, aprovado: 0, exportado: 0, erro: 0, descartado: 0 };
  for (const r of rows) out[r.status] = Number(r.n);
  return out;
}

export async function getInboundForExport(userId: number, ids?: number[], companyId?: CompanyFilter): Promise<InboundDocument[]> {
  const conds = [eq(inboundDocuments.userId, userId)];
  conds.push(ids?.length ? inArray(inboundDocuments.id, ids) : eq(inboundDocuments.status, "aprovado"));
  const cc = companyCond(companyId);
  if (cc) conds.push(cc);
  return (await db()).select().from(inboundDocuments).where(and(...conds)).orderBy(inboundDocuments.id);
}

export async function markInboundExported(ids: number[], actorUserId: number): Promise<void> {
  const now = new Date();
  for (const id of ids) {
    await transitionInbound(id, "exportado", { actorUserId, patch: { exportedAt: now } });
  }
}

/** Aggregates for the savings panel. Month filter is on createdAt (YYYY-MM). */
export async function inboundStats(userId: number, month?: string, companyId?: CompanyFilter) {
  const conds = [eq(inboundDocuments.userId, userId), ne(inboundDocuments.status, "descartado")];
  const cc = companyCond(companyId);
  if (cc) conds.push(cc);
  if (month) conds.push(sql`DATE_FORMAT(${inboundDocuments.createdAt}, '%Y-%m') = ${month}`);
  const [row] = await (await db())
    .select({
      total: sql<number>`count(*)`,
      done: sql<number>`sum(case when ${inboundDocuments.status} in ('aprovado','exportado') then 1 else 0 end)`,
      autoApproved: sql<number>`sum(case when ${inboundDocuments.status} in ('aprovado','exportado') and ${inboundDocuments.reviewedBy} is null then 1 else 0 end)`,
      pendingReview: sql<number>`sum(case when ${inboundDocuments.status} = 'revisao' then 1 else 0 end)`,
      llmCostMicros: sql<number>`coalesce(sum(${inboundDocuments.llmCostMicros}), 0)`,
    })
    .from(inboundDocuments)
    .where(and(...conds));
  return {
    total: Number(row?.total ?? 0),
    done: Number(row?.done ?? 0),
    autoApproved: Number(row?.autoApproved ?? 0),
    pendingReview: Number(row?.pendingReview ?? 0),
    llmCostMicros: Number(row?.llmCostMicros ?? 0),
  };
}

/** Documents of a company still waiting for review (used to re-validate after routing changes). */
export async function listInReviewForCompany(userId: number, companyId: number): Promise<InboundDocument[]> {
  return (await db())
    .select()
    .from(inboundDocuments)
    .where(and(eq(inboundDocuments.userId, userId), eq(inboundDocuments.companyId, companyId), eq(inboundDocuments.status, "revisao")));
}
