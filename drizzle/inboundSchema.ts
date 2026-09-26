/**
 * Inbound documents (módulo AutoNF Entrada): documents received by a company —
 * supplier NF-e, NFS-e, boletos — captured, extracted, validated and exported.
 */

import { bigint, decimal, index, int, json, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import type { ExtractedDocument, ValidationIssue } from "../server/_core/inbound/schemas";

export const INBOUND_SOURCES = ["upload", "sefaz_dfe", "adn_nfse", "email"] as const;
export const INBOUND_STATUSES = ["recebido", "processando", "revisao", "aprovado", "exportado", "erro", "descartado"] as const;
export type InboundStatus = (typeof INBOUND_STATUSES)[number];

export const inboundDocuments = mysqlTable(
  "inboundDocuments",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    source: mysqlEnum("source", INBOUND_SOURCES).default("upload").notNull(),
    status: mysqlEnum("status", INBOUND_STATUSES).default("recebido").notNull(),
    /** Null until classified */
    docType: mysqlEnum("docType", ["nfe", "cte", "nfse", "boleto", "extrato", "recibo", "outro"]),

    originalFilename: varchar("originalFilename", { length: 255 }).notNull(),
    mediaType: varchar("mediaType", { length: 100 }).notNull(),
    storageKey: varchar("storageKey", { length: 500 }).notNull(),
    sizeBytes: int("sizeBytes").notNull(),
    /** Content hash — the same file uploaded twice is stored once */
    sha256: varchar("sha256", { length: 64 }).notNull(),

    // Denormalized from `extracted` for listing, filtering and duplicate detection
    accessKey: varchar("accessKey", { length: 50 }),
    issuerDocument: varchar("issuerDocument", { length: 14 }),
    issuerName: varchar("issuerName", { length: 255 }),
    recipientDocument: varchar("recipientDocument", { length: 14 }),
    issueDate: varchar("issueDate", { length: 10 }),
    dueDate: varchar("dueDate", { length: 10 }),
    totalCents: bigint("totalCents", { mode: "number" }),

    extracted: json("extracted").$type<ExtractedDocument>(),
    /** Snapshot of the machine extraction before any human edit (audit + prompt examples) */
    originalExtracted: json("originalExtracted").$type<ExtractedDocument>(),
    issues: json("issues").$type<ValidationIssue[]>(),
    reviewReasons: json("reviewReasons").$type<string[]>(),
    confidence: decimal("confidence", { precision: 3, scale: 2 }),
    method: mysqlEnum("method", ["xml", "llm"]),
    llmCostMicros: int("llmCostMicros").default(0).notNull(),
    errorMessage: text("errorMessage"),
    /** Id of the document this one duplicates (same access key) */
    duplicateOfId: int("duplicateOfId"),

    reviewedBy: int("reviewedBy"),
    reviewedAt: timestamp("reviewedAt"),
    exportedAt: timestamp("exportedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    userShaIdx: uniqueIndex("inbound_user_sha_idx").on(t.userId, t.sha256),
    userStatusIdx: index("inbound_user_status_idx").on(t.userId, t.status),
    userKeyIdx: index("inbound_user_key_idx").on(t.userId, t.accessKey),
  })
);

export type InboundDocument = typeof inboundDocuments.$inferSelect;
export type InsertInboundDocument = typeof inboundDocuments.$inferInsert;

export const inboundDocumentEvents = mysqlTable(
  "inboundDocumentEvents",
  {
    id: int("id").autoincrement().primaryKey(),
    documentId: int("documentId").notNull(),
    fromStatus: mysqlEnum("fromStatus", INBOUND_STATUSES),
    toStatus: mysqlEnum("toStatus", INBOUND_STATUSES).notNull(),
    /** Null for system transitions */
    actorUserId: int("actorUserId"),
    note: text("note"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({
    documentIdx: index("inbound_events_document_idx").on(t.documentId),
  })
);

export type InboundDocumentEvent = typeof inboundDocumentEvents.$inferSelect;
