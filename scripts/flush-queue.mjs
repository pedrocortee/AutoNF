/**
 * Limpa completamente a fila BullMQ nfse-emission no Redis.
 * source .env && node scripts/flush-queue.mjs
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { Queue } = require("bullmq");
const IORedis = require("ioredis");

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

async function main() {
  const redis = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
  const queue = new Queue("nfse-emission", { connection: redis });

  await queue.obliterate({ force: true });
  console.log("✓ Fila nfse-emission limpa (todos os jobs removidos)");

  await redis.quit();
}
main().catch(console.error);
