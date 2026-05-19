import { startNFSeWorker } from "./_core/worker";

const worker = startNFSeWorker();
console.log("[NFSeWorker] Started (standalone mode)");

async function shutdown() {
  console.log("[NFSeWorker] Shutting down...");
  await worker.close();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
