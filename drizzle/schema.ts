import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal } from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  /** LGPD: timestamp when the user accepted the privacy policy */
  privacyConsentedAt: timestamp("privacyConsentedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Invoices (Notas Fiscais) table
 * Stores information about fiscal notes issued by the system
 */
export const invoices = mysqlTable("invoices", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  /** Client/Tomador name */
  clientName: varchar("clientName", { length: 255 }).notNull(),
  /** Service description */
  serviceDescription: text("serviceDescription").notNull(),
  /** Invoice value in cents (stored as integer for precision) */
  value: int("value").notNull(),
  /** Competence month (YYYY-MM format) */
  competenceMonth: varchar("competenceMonth", { length: 7 }).notNull(),
  /** Status: Pendente, Processando, Processado, Erro, Cancelado */
  status: mysqlEnum("status", ["Pendente", "Processando", "Processado", "Erro", "Cancelado"]).default("Pendente").notNull(),
  /** NFS-e number returned by the prefecture after successful emission */
  nfseNumber: varchar("nfseNumber", { length: 50 }),
  /** Error message if status is Erro */
  errorMessage: text("errorMessage"),
  /** BullMQ job ID for async processing tracking */
  jobId: varchar("jobId", { length: 100 }),
  /** Idempotency key to prevent duplicate RPS submissions to the prefecture */
  rpsIdempotencyKey: varchar("rpsIdempotencyKey", { length: 100 }).unique(),
  /** Filesystem path to the generated PDF for this invoice */
  pdfPath: varchar("pdfPath", { length: 500 }),
  /** Per-invoice tomador email (overrides defaultTomadorEmail from notificationPrefs) */
  tomadorEmail: varchar("tomadorEmail", { length: 320 }),
  /** Tax retentions in cents (optional, for PJ tomadores) */
  retIRPJ: int("retIRPJ").default(0),
  retCSLL: int("retCSLL").default(0),
  retCOFINS: int("retCOFINS").default(0),
  retPIS: int("retPIS").default(0),
  retINSS: int("retINSS").default(0),
  /** ISS retention in cents (calculated from issRate × value) */
  retISS: int("retISS").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  processedAt: timestamp("processedAt"),
});

export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = typeof invoices.$inferInsert;

/**
 * Invoice History table
 * Tracks status transitions for each invoice
 */
export const invoiceHistory = mysqlTable("invoiceHistory", {
  id: int("id").autoincrement().primaryKey(),
  invoiceId: int("invoiceId").notNull(),
  /** Previous status */
  fromStatus: mysqlEnum("fromStatus", ["Pendente", "Processando", "Processado", "Erro", "Criado", "Cancelado"]).notNull(),
  /** New status */
  toStatus: mysqlEnum("toStatus", ["Pendente", "Processando", "Processado", "Erro", "Cancelado"]).notNull(),
  /** Reason for transition */
  reason: text("reason"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type InvoiceHistory = typeof invoiceHistory.$inferSelect;
export type InsertInvoiceHistory = typeof invoiceHistory.$inferInsert;

/**
 * Relations
 */
export const usersRelations = relations(users, ({ many }) => ({
  invoices: many(invoices),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  user: one(users, {
    fields: [invoices.userId],
    references: [users.id],
  }),
  history: many(invoiceHistory),
}));

export const invoiceHistoryRelations = relations(invoiceHistory, ({ one }) => ({
  invoice: one(invoices, {
    fields: [invoiceHistory.invoiceId],
    references: [invoices.id],
  }),
}));

/**
 * Company Configuration table
 * Stores company/enterprise data for NFS-e emission
 */
export const companyConfigs = mysqlTable("companyConfigs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  /** CNPJ da empresa */
  cnpj: varchar("cnpj", { length: 14 }).notNull(),
  /** Inscrição Municipal (ISS) */
  municipalRegistration: varchar("municipalRegistration", { length: 20 }).notNull(),
  /** Razão Social */
  companyName: varchar("companyName", { length: 255 }).notNull(),
  /** Endereço */
  address: text("address").notNull(),
  /** Município (para identificar qual API usar) */
  municipality: varchar("municipality", { length: 100 }).notNull(),
  /** UF (estado) */
  state: varchar("state", { length: 2 }).notNull(),
  /** ISS rate as percentage (e.g., 5.00 = 5%). Varies by municipality: 2–5% */
  issRate: decimal("issRate", { precision: 5, scale: 2 }).default("5.00").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CompanyConfig = typeof companyConfigs.$inferSelect;
export type InsertCompanyConfig = typeof companyConfigs.$inferInsert;

/**
 * Digital Certificate table
 * Stores encrypted A1 certificates for NFS-e signing
 */
export const digitalCertificates = mysqlTable("digitalCertificates", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  /** Certificate filename */
  filename: varchar("filename", { length: 255 }).notNull(),
  /** Encrypted PFX/P12 file content (base64) */
  certificateData: text("certificateData").notNull(),
  /** Encrypted password */
  encryptedPassword: text("encryptedPassword").notNull(),
  /** Certificate subject/CN */
  subject: varchar("subject", { length: 255 }),
  /** Certificate issuer */
  issuer: varchar("issuer", { length: 255 }),
  /** Certificate validity start */
  validFrom: timestamp("validFrom"),
  /** Certificate validity end */
  validUntil: timestamp("validUntil"),
  /** Is this the active certificate? */
  isActive: mysqlEnum("isActive", ["true", "false"]).default("true").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DigitalCertificate = typeof digitalCertificates.$inferSelect;
export type InsertDigitalCertificate = typeof digitalCertificates.$inferInsert;

/**
 * Relations for new tables
 */
export const companyConfigsRelations = relations(companyConfigs, ({ one }) => ({
  user: one(users, {
    fields: [companyConfigs.userId],
    references: [users.id],
  }),
}));

export const digitalCertificatesRelations = relations(digitalCertificates, ({ one }) => ({
  user: one(users, {
    fields: [digitalCertificates.userId],
    references: [users.id],
  }),
}));

export const usersRelationsExtended = relations(users, ({ many }) => ({
  invoices: many(invoices),
  companyConfigs: many(companyConfigs),
  digitalCertificates: many(digitalCertificates),
}));


/**
 * Plans table
 * Defines available subscription plans
 */
export const plans = mysqlTable("plans", {
  id: int("id").autoincrement().primaryKey(),
  /** Plan name: Starter, Professional, Enterprise */
  name: varchar("name", { length: 50 }).notNull().unique(),
  /** Plan description */
  description: text("description"),
  /** Monthly price in cents */
  pricePerMonth: int("pricePerMonth").notNull(),
  /** Maximum invoices per month */
  maxInvoicesPerMonth: int("maxInvoicesPerMonth").notNull(),
  /** Features included (JSON) */
  features: text("features"),
  /** Display order */
  displayOrder: int("displayOrder").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Plan = typeof plans.$inferSelect;
export type InsertPlan = typeof plans.$inferInsert;

/**
 * Subscriptions table
 * Tracks user subscriptions to plans
 */
export const subscriptions = mysqlTable("subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  planId: int("planId").notNull(),
  /** Subscription status: active, paused, cancelled */
  status: mysqlEnum("status", ["active", "paused", "cancelled"]).default("active").notNull(),
  /** Start date of subscription */
  startDate: timestamp("startDate").defaultNow().notNull(),
  /** Renewal date (next billing cycle) */
  renewalDate: timestamp("renewalDate"),
  /** Cancellation date */
  cancellationDate: timestamp("cancellationDate"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = typeof subscriptions.$inferInsert;

/**
 * Invoice Usage table
 * Tracks invoice count per user per month for billing
 */
export const invoiceUsage = mysqlTable("invoiceUsage", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  /** Month in YYYY-MM format */
  month: varchar("month", { length: 7 }).notNull(),
  /** Number of invoices issued in this month */
  invoiceCount: int("invoiceCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type InvoiceUsage = typeof invoiceUsage.$inferSelect;
export type InsertInvoiceUsage = typeof invoiceUsage.$inferInsert;

/**
 * Relations for plans and subscriptions
 */
export const plansRelations = relations(plans, ({ many }) => ({
  subscriptions: many(subscriptions),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  user: one(users, {
    fields: [subscriptions.userId],
    references: [users.id],
  }),
  plan: one(plans, {
    fields: [subscriptions.planId],
    references: [plans.id],
  }),
}));

export const invoiceUsageRelations = relations(invoiceUsage, ({ one }) => ({
  user: one(users, {
    fields: [invoiceUsage.userId],
    references: [users.id],
  }),
}));

/**
 * Asaas Customers table
 * Maps internal users to Asaas customer IDs
 */
export const asaasCustomers = mysqlTable("asaasCustomers", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  asaasCustomerId: varchar("asaasCustomerId", { length: 100 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AsaasCustomer = typeof asaasCustomers.$inferSelect;
export type InsertAsaasCustomer = typeof asaasCustomers.$inferInsert;

/**
 * Billing Invoices table
 * Stores SaaS billing invoices issued to clients
 */
export const billingInvoices = mysqlTable("billingInvoices", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  subscriptionId: int("subscriptionId"),
  asaasPaymentId: varchar("asaasPaymentId", { length: 100 }),
  asaasSubscriptionId: varchar("asaasSubscriptionId", { length: 100 }),
  planName: varchar("planName", { length: 50 }).notNull(),
  /** Amount in cents */
  amount: int("amount").notNull(),
  dueDate: varchar("dueDate", { length: 10 }).notNull(),
  status: mysqlEnum("status", ["pending", "confirmed", "overdue", "cancelled"]).default("pending").notNull(),
  paymentMethod: varchar("paymentMethod", { length: 50 }),
  paymentUrl: text("paymentUrl"),
  /** Whether the NFS-e was auto-emitted for this billing invoice */
  nfseEmitted: mysqlEnum("nfseEmitted", ["true", "false"]).default("false").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type BillingInvoice = typeof billingInvoices.$inferSelect;
export type InsertBillingInvoice = typeof billingInvoices.$inferInsert;

export const asaasCustomersRelations = relations(asaasCustomers, ({ one }) => ({
  user: one(users, {
    fields: [asaasCustomers.userId],
    references: [users.id],
  }),
}));

export const billingInvoicesRelations = relations(billingInvoices, ({ one }) => ({
  user: one(users, {
    fields: [billingInvoices.userId],
    references: [users.id],
  }),
}));

/**
 * Webhook Endpoints table
 * Outbound webhooks configured by users to receive NFS-e events
 */
export const webhookEndpoints = mysqlTable("webhookEndpoints", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  url: varchar("url", { length: 500 }).notNull(),
  /** HMAC-SHA256 signing secret — stored plaintext (not a private key, just an HMAC token) */
  secret: varchar("secret", { length: 64 }).notNull(),
  /** JSON array: ["invoice.created","invoice.processed","invoice.error","invoice.cancelled"] */
  events: text("events").notNull(),
  description: varchar("description", { length: 255 }),
  isActive: mysqlEnum("isActive", ["true", "false"]).default("true").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type WebhookEndpoint = typeof webhookEndpoints.$inferSelect;
export type InsertWebhookEndpoint = typeof webhookEndpoints.$inferInsert;

/**
 * Webhook Deliveries table
 * Append-only log of every dispatch attempt (success or failure)
 */
export const webhookDeliveries = mysqlTable("webhookDeliveries", {
  id: int("id").autoincrement().primaryKey(),
  webhookEndpointId: int("webhookEndpointId").notNull(),
  event: varchar("event", { length: 100 }).notNull(),
  payload: text("payload").notNull(),
  responseStatus: int("responseStatus"),
  responseBody: text("responseBody"),
  attempts: int("attempts").default(1).notNull(),
  success: mysqlEnum("success", ["true", "false"]).default("false").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type InsertWebhookDelivery = typeof webhookDeliveries.$inferInsert;

/**
 * Notification Preferences table
 * Per-user email notification settings for invoice events
 */
export const notificationPrefs = mysqlTable("notificationPrefs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  /** Send PDF to tomador after successful NFS-e emission */
  emailTomadorOnSuccess: mysqlEnum("emailTomadorOnSuccess", ["true", "false"]).default("true").notNull(),
  /** Send error alert to the prestador (account owner) when emission fails */
  emailPrestadorOnError: mysqlEnum("emailPrestadorOnError", ["true", "false"]).default("true").notNull(),
  /**
   * Default tomador email address (used when the invoice doesn't carry an email).
   * Operators can override per-invoice; this is the fallback.
   */
  defaultTomadorEmail: varchar("defaultTomadorEmail", { length: 320 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type NotificationPrefs = typeof notificationPrefs.$inferSelect;
export type InsertNotificationPrefs = typeof notificationPrefs.$inferInsert;

