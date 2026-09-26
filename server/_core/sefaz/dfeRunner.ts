/**
 * Wires a capture run to the real world: decrypts the company's A1, calls SEFAZ, ingests the
 * NF-e XMLs through the same pipeline as uploads, and schedules the periodic `dfe-sync` job.
 *
 * Disabled unless SEFAZ_DFE_ENV is "homologacao" or "producao".
 */

import { Queue, Worker } from "bullmq";
import { redisConnection } from "../queue";
import { decryptData } from "../crypto";
import { ingestFile } from "../inbound/ingest";
import { enqueueInbound } from "../inbound/queue";
import { getClientCompany } from "../../clientCompaniesDb";
import { companiesDueForSync, getCompanyCertificate, getSyncState, markSummariesFull, saveSyncState, upsertSummary } from "../../dfeDb";
import { readA1Certificate } from "./certificate";
import { distributeByNsu, ZERO_NSU, type SefazEnv } from "./dfeDistribution";
import { syncCompany, type SyncOutcome } from "./dfeSync";

export function sefazEnv(): SefazEnv | null {
  const v = process.env.SEFAZ_DFE_ENV;
  return v === "homologacao" || v === "producao" ? v : null;
}

export async function runCompanySync(userId: number, companyId: number, opts: { force?: boolean } = {}): Promise<SyncOutcome> {
  const env = sefazEnv();
  if (!env) throw new Error("Captura SEFAZ desligada (defina SEFAZ_DFE_ENV=homologacao ou producao)");
  const company = await getClientCompany(companyId, userId);
  if (!company) throw new Error("Empresa não encontrada");
  const cert = await getCompanyCertificate(companyId, userId);
  if (!cert) throw new Error("Empresa sem certificado A1");
  if (cert.validUntil < new Date()) throw new Error("Certificado A1 vencido");

  const a1 = readA1Certificate(decryptData(cert.encryptedPfx), decryptData(cert.encryptedPassword));
  const identity = { keyPem: a1.keyPem, certChainPem: a1.certChainPem };
  const state = await getSyncState(companyId, "nfe");
  const fullKeys: string[] = [];

  const outcome = await syncCompany(
    {
      env,
      ufCode: cert.ufCode,
      document: company.document,
      lastNsu: state?.lastNsu ?? ZERO_NSU,
      // "Sincronizar agora" only skips the pause after a local failure (network, TLS, config);
      // after any SEFAZ answer the 1h wait stands, or SEFAZ blocks the CNPJ (656)
      nextAllowedAt: opts.force && state?.lastStatusCode === "erro" ? null : (state?.nextAllowedAt ?? null),
    },
    {
      // SEFAZ_DFE_URL: local SEFAZ simulator for development only
      distribute: (req) => distributeByNsu(req, identity, { url: process.env.SEFAZ_DFE_URL || undefined }),
      ingestNfe: async (doc) => {
        const key = doc.xml.match(/Id="NFe(\d{44})"/)?.[1];
        if (key) fullKeys.push(key);
        const r = await ingestFile(userId, { filename: `${key ? `NFe${key}` : `NSU${doc.nsu}`}.xml`, buffer: Buffer.from(doc.xml, "utf8") }, "sefaz_dfe");
        if (r.status === "criado" && r.documentId) await enqueueInbound(r.documentId);
        return r.status;
      },
      saveSummary: (s, nsu) => upsertSummary({ userId, companyId, nsu, ...s }),
      now: () => new Date(),
    }
  );

  await markSummariesFull(companyId, fullKeys);
  if (outcome.ran) {
    await saveSyncState({
      userId,
      companyId,
      service: "nfe",
      lastNsu: outcome.lastNsu,
      ...(outcome.maxNsu ? { maxNsu: outcome.maxNsu } : {}),
      lastSyncAt: new Date(),
      nextAllowedAt: outcome.nextAllowedAt,
      lastStatusCode: outcome.statusCode,
      lastStatusMessage: outcome.statusMessage,
      lastReceived: outcome.received,
    });
  }
  return outcome;
}

const DFE_QUEUE_NAME = "dfe-sync";

/** Every 15 minutes: sync the companies whose pause has elapsed (one at a time, per SEFAZ etiquette). */
export async function startDfeSync(): Promise<Worker | null> {
  if (!sefazEnv()) {
    console.log("[DfeSync] SEFAZ_DFE_ENV not set — capture disabled");
    return null;
  }
  const queue = new Queue(DFE_QUEUE_NAME, { connection: redisConnection });
  await queue.add("tick", {}, { repeat: { pattern: "*/15 * * * *" }, removeOnComplete: 10, removeOnFail: 50 });

  const worker = new Worker(
    DFE_QUEUE_NAME,
    async () => {
      const due = await companiesDueForSync(new Date());
      for (const { userId, companyId } of due) {
        try {
          const o = await runCompanySync(userId, companyId);
          console.log(`[DfeSync] company ${companyId}: cStat ${o.statusCode} — ${o.received} nova(s), ${o.summaries} resumo(s)`);
        } catch (err) {
          console.error(`[DfeSync] company ${companyId} failed:`, (err as Error).message);
          await saveSyncState({
            userId,
            companyId,
            service: "nfe",
            nextAllowedAt: new Date(Date.now() + 60 * 60 * 1000),
            lastStatusCode: "erro",
            lastStatusMessage: (err as Error).message.slice(0, 500),
          }).catch(() => undefined);
        }
      }
    },
    { connection: redisConnection, concurrency: 1 }
  );
  worker.on("error", (err) => console.error("[DfeSync] worker error:", err));
  console.log(`[DfeSync] Capture scheduled every 15 min (${sefazEnv()})`);
  return worker;
}
