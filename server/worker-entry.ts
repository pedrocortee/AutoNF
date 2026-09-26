import { startNFSeWorker } from "./_core/worker";
import { startInboundWorker } from "./_core/inbound/queue";
import { startDfeSync } from "./_core/sefaz/dfeRunner";

const worker = startNFSeWorker();
const inboundWorker = startInboundWorker();
const dfeWorker = startDfeSync();
console.log("[NFSeWorker] Started (standalone mode)");

async function shutdown() {
  console.log("[NFSeWorker] Shutting down...");
  await Promise.all([worker.close(), inboundWorker.close(), dfeWorker.then((w) => w?.close())]);
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
