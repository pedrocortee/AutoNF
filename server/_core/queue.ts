import { Queue, QueueEvents } from "bullmq";
import IORedis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// Shared Redis connection for BullMQ (maxRetriesPerRequest=null is required by BullMQ)
export const redisConnection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export const NFSE_QUEUE_NAME = "nfse-emission";

export const nfseQueue = new Queue<NFSeJobData>(NFSE_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

export const nfseQueueEvents = new QueueEvents(NFSE_QUEUE_NAME, {
  connection: new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  }),
});

export interface NFSeJobData {
  invoiceId: number;
  userId: number;
  idempotencyKey: string;
}
