import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { getDb } from "../db";
import { digitalCertificates } from "../../drizzle/schema";
import { and, lte, eq } from "drizzle-orm";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const CERT_EXPIRY_QUEUE = "cert-expiry-check";

const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export const certExpiryQueue = new Queue(CERT_EXPIRY_QUEUE, { connection });

/** Returns active certificates expiring within `days` days from now. */
export async function getCertificatesExpiringSoon(days: number) {
  const db = await getDb();
  if (!db) return [];

  const threshold = new Date();
  threshold.setDate(threshold.getDate() + days);

  return db
    .select()
    .from(digitalCertificates)
    .where(
      and(
        eq(digitalCertificates.isActive, "true"),
        lte(digitalCertificates.validUntil, threshold)
      )
    );
}

/** Schedule a daily repeatable check. Call once on server startup. */
export async function scheduleCertExpiryJob(): Promise<void> {
  await certExpiryQueue.add(
    "daily-check",
    {},
    {
      repeat: { pattern: "0 8 * * *" }, // every day at 08:00
      removeOnComplete: 1,
      removeOnFail: 3,
    }
  );
  console.log("[CertExpiry] Daily check scheduled (08:00)");
}

export function startCertExpiryWorker(): Worker {
  const worker = new Worker(
    CERT_EXPIRY_QUEUE,
    async () => {
      const THRESHOLDS = [30, 15, 7, 1];
      for (const days of THRESHOLDS) {
        const expiring = await getCertificatesExpiringSoon(days);
        if (expiring.length > 0) {
          console.warn(
            `[CertExpiry] ${expiring.length} certificate(s) expiring within ${days} day(s):`,
            expiring.map((c) => `userId=${c.userId} file=${c.filename} until=${c.validUntil}`)
          );
          // Email sending would hook here (Fase 16). For now, log is sufficient.
        }
      }
    },
    {
      connection: new IORedis(REDIS_URL, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      }),
    }
  );

  worker.on("error", (err) => console.error("[CertExpiry] Worker error:", err));
  return worker;
}
