import { Queue, Worker, type Job } from "bullmq";
import { redisConnection } from "../queue";
import { processInboundDocument, RetryableProcessingError } from "./processor";
import { transitionInbound } from "../../inboundDb";

export const INBOUND_QUEUE_NAME = "inbound-docs";

export interface InboundJobData {
  documentId: number;
}

export const inboundQueue = new Queue<InboundJobData>(INBOUND_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 4,
    backoff: { type: "exponential", delay: 15_000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});

export async function enqueueInbound(documentId: number): Promise<void> {
  // jobId dedupes concurrent enqueues; a finished job with the same id would silently
  // swallow a new add (e.g. "reprocessar"), so it is removed first.
  const jobId = `inbound-${documentId}`;
  const previous = await inboundQueue.getJob(jobId);
  if (previous && ((await previous.isFailed()) || (await previous.isCompleted()))) await previous.remove();
  await inboundQueue.add("process", { documentId }, { jobId });
}

export function startInboundWorker(): Worker<InboundJobData> {
  const worker = new Worker<InboundJobData>(
    INBOUND_QUEUE_NAME,
    async (job: Job<InboundJobData>) => processInboundDocument(job.data.documentId),
    { connection: redisConnection, concurrency: Number(process.env.INBOUND_CONCURRENCY ?? 3) }
  );

  worker.on("failed", async (job, err) => {
    if (!job) return;
    const exhausted = job.attemptsMade >= (job.opts.attempts ?? 1);
    const message = err instanceof RetryableProcessingError ? err.message : `Erro inesperado: ${err.message}`;
    console.error(`[InboundWorker] document ${job.data.documentId} attempt ${job.attemptsMade} failed: ${message}`);
    if (exhausted) {
      await transitionInbound(job.data.documentId, "erro", { note: message, patch: { errorMessage: message } }).catch(
        (e) => console.error("[InboundWorker] could not mark document as erro:", e)
      );
    }
  });

  return worker;
}
