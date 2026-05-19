import { eq, sql, and, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, invoices, invoiceHistory, InsertInvoice, companyConfigs, digitalCertificates, InsertCompanyConfig, InsertDigitalCertificate, CompanyConfig, DigitalCertificate, plans, subscriptions, invoiceUsage, Plan, Subscription, InvoiceUsage, asaasCustomers, AsaasCustomer, InsertAsaasCustomer, billingInvoices, BillingInvoice, InsertBillingInvoice, type InsertInvoiceHistory, webhookEndpoints, webhookDeliveries, WebhookEndpoint, WebhookDelivery, InsertWebhookEndpoint, InsertWebhookDelivery, notificationPrefs, NotificationPrefs } from "../drizzle/schema";
import { ENV } from './_core/env';
import { encryptData, decryptData } from './_core/crypto';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

/**
 * Get all invoices for a user with optional filters
 */
export async function getUserInvoices(
  userId: number,
  filters?: {
    status?: string;
    clientName?: string;
    competenceMonth?: string;
    limit?: number;
    offset?: number;
  }
) {
  const db = await getDb();
  if (!db) return [];

  const conditions: any[] = [eq(invoices.userId, userId)];

  if (filters?.status) {
    conditions.push(eq(invoices.status, filters.status as any));
  }

  if (filters?.clientName) {
    conditions.push(sql`${invoices.clientName} LIKE ${"%" + filters.clientName + "%"}`);
  }

  if (filters?.competenceMonth) {
    conditions.push(eq(invoices.competenceMonth, filters.competenceMonth));
  }

  const limit = filters?.limit || 50;
  const offset = filters?.offset || 0;

  const query = db
    .select()
    .from(invoices)
    .where(conditions.length > 1 ? and(...conditions) : conditions[0]);

  return query.limit(limit).offset(offset);
}

/**
 * Get invoice by ID
 */
export async function getInvoiceById(invoiceId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

/**
 * Create a new invoice
 */
export async function createInvoice(invoice: InsertInvoice) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(invoices).values(invoice);
  return result;
}

/**
 * Update invoice status
 */
/**
 * Save the NFS-e number returned by the prefecture after successful emission
 */
export async function saveNFSeNumber(invoiceId: number, nfseNumber: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(invoices)
    .set({ nfseNumber })
    .where(eq(invoices.id, invoiceId));
}

export async function updateInvoiceStatus(
  invoiceId: number,
  status: "Pendente" | "Processando" | "Processado" | "Erro" | "Cancelado",
  errorMessage?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updateData: any = {
    status,
    updatedAt: new Date(),
  };

  if (status === "Processado") {
    updateData.processedAt = new Date();
  }

  if (errorMessage) {
    updateData.errorMessage = errorMessage;
  }

  await db
    .update(invoices)
    .set(updateData)
    .where(eq(invoices.id, invoiceId));
}

/**
 * Get invoice metrics for a user
 */
export async function getInvoiceMetrics(userId: number) {
  const db = await getDb();
  if (!db) return { total: 0, pending: 0, processed: 0, error: 0 };

  const allInvoices = await db
    .select()
    .from(invoices)
    .where(eq(invoices.userId, userId));

  return {
    total: allInvoices.length,
    pending: allInvoices.filter((i) => i.status === "Pendente").length,
    processed: allInvoices.filter((i) => i.status === "Processado").length,
    error: allInvoices.filter((i) => i.status === "Erro").length,
  };
}

/**
 * Get invoice history
 */
export async function getInvoiceHistory(invoiceId: number) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(invoiceHistory)
    .where(eq(invoiceHistory.invoiceId, invoiceId));
}

/**
 * Add invoice history entry
 */
export async function setInvoiceJob(invoiceId: number, jobId: string, idempotencyKey: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(invoices)
    .set({ jobId, rpsIdempotencyKey: idempotencyKey, status: "Processando" })
    .where(eq(invoices.id, invoiceId));
}

export async function getInvoiceByIdempotencyKey(key: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(invoices)
    .where(eq(invoices.rpsIdempotencyKey, key))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function addInvoiceHistory(
  invoiceId: number,
  fromStatus: string,
  toStatus: "Pendente" | "Processando" | "Processado" | "Erro" | "Cancelado",
  reason?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(invoiceHistory).values({
    invoiceId,
    fromStatus: fromStatus as any,
    toStatus,
    reason,
  });
}

/**
 * Company Configuration functions
 */
export async function upsertCompanyConfig(config: InsertCompanyConfig) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db
    .select()
    .from(companyConfigs)
    .where(eq(companyConfigs.userId, config.userId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(companyConfigs)
      .set(config)
      .where(eq(companyConfigs.userId, config.userId));
  } else {
    await db.insert(companyConfigs).values(config);
  }
}

export async function getCompanyConfig(userId: number): Promise<CompanyConfig | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(companyConfigs)
    .where(eq(companyConfigs.userId, userId))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

/**
 * Digital Certificate functions
 */
export async function uploadDigitalCertificate(cert: InsertDigitalCertificate) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Encrypt certificate data and password
  const encryptedCertData = encryptData(cert.certificateData);
  const encryptedPassword = encryptData(cert.encryptedPassword);

  // Deactivate other certificates for this user
  await db
    .update(digitalCertificates)
    .set({ isActive: "false" })
    .where(eq(digitalCertificates.userId, cert.userId));

  // Insert new certificate with encrypted data
  const result = await db.insert(digitalCertificates).values({
    ...cert,
    certificateData: encryptedCertData,
    encryptedPassword: encryptedPassword,
  });
  return result;
}

export async function getActiveCertificate(userId: number): Promise<DigitalCertificate | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(digitalCertificates)
    .where(and(eq(digitalCertificates.userId, userId), eq(digitalCertificates.isActive, "true")))
    .limit(1);

  if (result.length === 0) return undefined;

  const cert = result[0];
  // Decrypt sensitive data before returning
  try {
    return {
      ...cert,
      certificateData: decryptData(cert.certificateData),
      encryptedPassword: decryptData(cert.encryptedPassword),
    };
  } catch (error) {
    console.error("Failed to decrypt certificate:", error);
    return undefined;
  }
}

export async function getCertificateById(certificateId: number): Promise<DigitalCertificate | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(digitalCertificates)
    .where(eq(digitalCertificates.id, certificateId))
    .limit(1);

  if (result.length === 0) return undefined;

  const cert = result[0];
  // Decrypt sensitive data before returning
  try {
    return {
      ...cert,
      certificateData: decryptData(cert.certificateData),
      encryptedPassword: decryptData(cert.encryptedPassword),
    };
  } catch (error) {
    console.error("Failed to decrypt certificate:", error);
    return undefined;
  }
}

export async function listCertificates(userId: number): Promise<DigitalCertificate[]> {
  const db = await getDb();
  if (!db) return [];

  const certs = await db
    .select()
    .from(digitalCertificates)
    .where(eq(digitalCertificates.userId, userId));

  // Decrypt sensitive data before returning
  return certs.map((cert) => {
    try {
      return {
        ...cert,
        certificateData: decryptData(cert.certificateData),
        encryptedPassword: decryptData(cert.encryptedPassword),
      };
    } catch (error) {
      console.error("Failed to decrypt certificate:", error);
      return cert;
    }
  });
}

/**
 * Plans functions
 */
export async function getAllPlans(): Promise<Plan[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(plans)
    .orderBy(plans.displayOrder);
}

export async function getPlanByName(name: string): Promise<Plan | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(plans)
    .where(eq(plans.name, name))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

/**
 * Subscription functions
 */
export async function getUserSubscription(userId: number): Promise<(Subscription & { plan: Plan }) | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select({
      subscription: subscriptions,
      plan: plans,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(subscriptions.planId, plans.id))
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")))
    .limit(1);

  if (result.length === 0) return undefined;

  return {
    ...result[0].subscription,
    plan: result[0].plan,
  } as any;
}

export async function createSubscription(userId: number, planId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Cancel existing active subscription
  await db
    .update(subscriptions)
    .set({ status: "cancelled", cancellationDate: new Date() })
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")));

  // Create new subscription
  const renewalDate = new Date();
  renewalDate.setMonth(renewalDate.getMonth() + 1);

  await db.insert(subscriptions).values({
    userId,
    planId,
    status: "active",
    startDate: new Date(),
    renewalDate,
  });
}

/**
 * Invoice Usage functions
 */
export async function getInvoiceUsageThisMonth(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const now = new Date();
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  const result = await db
    .select()
    .from(invoiceUsage)
    .where(and(eq(invoiceUsage.userId, userId), eq(invoiceUsage.month, month)))
    .limit(1);

  return result.length > 0 ? result[0].invoiceCount : 0;
}

export async function incrementInvoiceUsage(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const now = new Date();
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  const existing = await db
    .select()
    .from(invoiceUsage)
    .where(and(eq(invoiceUsage.userId, userId), eq(invoiceUsage.month, month)))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(invoiceUsage)
      .set({ invoiceCount: existing[0].invoiceCount + 1 })
      .where(eq(invoiceUsage.id, existing[0].id));
  } else {
    await db.insert(invoiceUsage).values({
      userId,
      month,
      invoiceCount: 1,
    });
  }
}

// TODO: add feature queries here as your schema grows.

/**
 * Asaas Customer functions
 */
export async function upsertAsaasCustomer(userId: number, asaasCustomerId: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db
    .select()
    .from(asaasCustomers)
    .where(eq(asaasCustomers.userId, userId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(asaasCustomers)
      .set({ asaasCustomerId })
      .where(eq(asaasCustomers.userId, userId));
  } else {
    await db.insert(asaasCustomers).values({ userId, asaasCustomerId });
  }
}

export async function getAsaasCustomerByUserId(userId: number): Promise<AsaasCustomer | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(asaasCustomers)
    .where(eq(asaasCustomers.userId, userId))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

/**
 * Billing Invoice functions
 */
export async function createBillingInvoice(data: InsertBillingInvoice): Promise<{ insertId: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(billingInvoices).values(data);
  return result as any;
}

export async function updateBillingInvoice(
  id: number,
  data: Partial<Pick<BillingInvoice, "status" | "paymentMethod" | "paymentUrl" | "asaasPaymentId" | "nfseEmitted">>
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(billingInvoices)
    .set(data)
    .where(eq(billingInvoices.id, id));
}

export async function updateBillingInvoiceByAsaasPaymentId(
  asaasPaymentId: string,
  data: Partial<Pick<BillingInvoice, "status" | "paymentMethod" | "nfseEmitted">>
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(billingInvoices)
    .set(data)
    .where(eq(billingInvoices.asaasPaymentId, asaasPaymentId));
}

export async function getBillingInvoiceByAsaasPaymentId(
  asaasPaymentId: string
): Promise<BillingInvoice | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(billingInvoices)
    .where(eq(billingInvoices.asaasPaymentId, asaasPaymentId))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function listBillingInvoices(userId: number): Promise<BillingInvoice[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(billingInvoices)
    .where(eq(billingInvoices.userId, userId))
    .orderBy(desc(billingInvoices.createdAt))
    .limit(50);
}

export async function updateSubscriptionByUserId(
  userId: number,
  data: { status?: "active" | "paused" | "cancelled"; asaasSubscriptionId?: string }
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updateData: Record<string, unknown> = {};
  if (data.status) updateData.status = data.status;

  if (Object.keys(updateData).length === 0) return;

  await db
    .update(subscriptions)
    .set(updateData)
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")));
}

export async function setPrivacyConsent(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(users)
    .set({ privacyConsentedAt: new Date() })
    .where(eq(users.id, userId));
}

export async function deleteUserAndData(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Delete in dependency order
  await db.delete(invoiceHistory).where(
    sql`${invoiceHistory.invoiceId} IN (SELECT id FROM invoices WHERE userId = ${userId})`
  );
  await db.delete(invoices).where(eq(invoices.userId, userId));
  await db.delete(digitalCertificates).where(eq(digitalCertificates.userId, userId));
  await db.delete(companyConfigs).where(eq(companyConfigs.userId, userId));
  await db.delete(subscriptions).where(eq(subscriptions.userId, userId));
  await db.delete(invoiceUsage).where(eq(invoiceUsage.userId, userId));
  await db.delete(asaasCustomers).where(eq(asaasCustomers.userId, userId));
  await db.delete(billingInvoices).where(eq(billingInvoices.userId, userId));
  // Cascade webhook deliveries before endpoints
  await db.delete(webhookDeliveries).where(
    sql`${webhookDeliveries.webhookEndpointId} IN (SELECT id FROM webhookEndpoints WHERE userId = ${userId})`
  );
  await db.delete(webhookEndpoints).where(eq(webhookEndpoints.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
}

export async function getUserByIdFromDb(userId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getBillingInvoicesByAsaasSubscriptionId(
  asaasSubscriptionId: string
): Promise<BillingInvoice[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(billingInvoices)
    .where(eq(billingInvoices.asaasSubscriptionId, asaasSubscriptionId));
}

// ---------------------------------------------------------------------------
// Webhook Endpoints
// ---------------------------------------------------------------------------

export async function listWebhookEndpoints(userId: number): Promise<WebhookEndpoint[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.userId, userId))
    .orderBy(desc(webhookEndpoints.createdAt));
}

export async function getWebhookEndpointById(id: number, userId: number): Promise<WebhookEndpoint | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(webhookEndpoints)
    .where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.userId, userId)))
    .limit(1);

  return result[0];
}

export async function createWebhookEndpoint(data: InsertWebhookEndpoint): Promise<{ insertId: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(webhookEndpoints).values(data);
  return result as any;
}

export async function updateWebhookEndpoint(
  id: number,
  userId: number,
  data: Partial<Pick<WebhookEndpoint, "url" | "description" | "events" | "isActive">>
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(webhookEndpoints)
    .set(data)
    .where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.userId, userId)));
}

export async function deleteWebhookEndpoint(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .delete(webhookDeliveries)
    .where(eq(webhookDeliveries.webhookEndpointId, id));

  await db
    .delete(webhookEndpoints)
    .where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.userId, userId)));
}

export async function getActiveWebhookEndpointsForUser(userId: number): Promise<WebhookEndpoint[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(webhookEndpoints)
    .where(and(eq(webhookEndpoints.userId, userId), eq(webhookEndpoints.isActive, "true")));
}

// ---------------------------------------------------------------------------
// Webhook Deliveries
// ---------------------------------------------------------------------------

export async function createWebhookDelivery(data: InsertWebhookDelivery): Promise<{ insertId: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(webhookDeliveries).values(data);
  return result as any;
}

export async function updateWebhookDelivery(
  id: number,
  data: Partial<Pick<WebhookDelivery, "responseStatus" | "responseBody" | "attempts" | "success">>
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(webhookDeliveries)
    .set(data)
    .where(eq(webhookDeliveries.id, id));
}

export async function listWebhookDeliveries(endpointId: number, limit = 50): Promise<WebhookDelivery[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.webhookEndpointId, endpointId))
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(limit);
}

// ---------------------------------------------------------------------------
// PDF Storage
// ---------------------------------------------------------------------------

export async function savePdfPath(invoiceId: number, pdfPath: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(invoices)
    .set({ pdfPath })
    .where(eq(invoices.id, invoiceId));
}

// ---------------------------------------------------------------------------
// Notification Preferences
// ---------------------------------------------------------------------------

export async function getNotificationPrefs(userId: number): Promise<NotificationPrefs | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(notificationPrefs)
    .where(eq(notificationPrefs.userId, userId))
    .limit(1);

  return result[0];
}

export async function upsertNotificationPrefs(
  userId: number,
  data: Partial<Pick<NotificationPrefs, "emailTomadorOnSuccess" | "emailPrestadorOnError" | "defaultTomadorEmail">>
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db
    .select()
    .from(notificationPrefs)
    .where(eq(notificationPrefs.userId, userId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(notificationPrefs)
      .set(data)
      .where(eq(notificationPrefs.userId, userId));
  } else {
    await db.insert(notificationPrefs).values({ userId, ...data } as any);
  }
}
