/**
 * Enfileira a última invoice pendente diretamente no BullMQ.
 * Use quando quiser testar sem precisar do browser/auth.
 *
 *   source .env && npx tsx scripts/dispatch-test-invoice.mjs
 */

import { createRequire } from "module";
const require = createRequire(import.meta.url);

const mysql = require("mysql2/promise");
const { Queue } = require("bullmq");
const IORedis = require("ioredis");

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

if (!DATABASE_URL) {
  console.error("DATABASE_URL não configurado. Rode: source .env && node scripts/dispatch-test-invoice.mjs");
  process.exit(1);
}

async function main() {
  const conn = await mysql.createConnection(DATABASE_URL);
  const [rows] = await conn.execute(
    "SELECT id, userId, status, clientName FROM invoices WHERE status='Pendente' ORDER BY id DESC LIMIT 1"
  );

  if (rows.length === 0) {
    console.log("Nenhuma invoice Pendente encontrada. Rode primeiro: npm run seed:test");
    await conn.end();
    return;
  }

  const inv = rows[0];
  console.log(`Invoice #${inv.id} — "${inv.clientName}" (userId=${inv.userId})`);

  // Marca como Processando no banco
  await conn.execute(
    "UPDATE invoices SET status='Processando', updatedAt=NOW() WHERE id=?",
    [inv.id]
  );

  const redis = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
  const queue = new Queue("nfse-emission", { connection: redis });

  const idempotencyKey = `test-${inv.id}-${Date.now()}`;
  const job = await queue.add(
    "process-invoice",
    { invoiceId: inv.id, userId: inv.userId, idempotencyKey },
    { attempts: 1 }
  );

  console.log(`✓ Job #${job.id} enfileirado`);
  console.log("  Aguarde 5-10s e verifique:");
  console.log("  • cat /tmp/autonf-worker.log");
  console.log("  • ou http://localhost:5173 → Dashboard");

  await conn.end();
  await redis.quit();
}

main().catch((err) => {
  console.error("Erro:", err.message);
  process.exit(1);
});
