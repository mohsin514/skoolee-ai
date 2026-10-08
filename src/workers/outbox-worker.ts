import { reportDeliveryWorkflow } from "../lib/queue/report-delivery";
import { PrismaClient } from "@prisma/client";
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { consume, dispatch, type Reference } from "../lib/queue/outbox";
import { reportWorkflow } from "../lib/queue/report-workflow";

// Dedicated service process: no request session, no inherited tenant, no dotenv loading.
const db = new PrismaClient();
const connection = new IORedis(process.env.REDIS_URL || "redis://127.0.0.1:6379", { maxRetriesPerRequest: null });
const producerConnection = new IORedis(process.env.REDIS_URL || "redis://127.0.0.1:6379", { maxRetriesPerRequest: 1, enableOfflineQueue: false });
const queue = new Queue<Reference>("durable-workflows", { connection: producerConnection });
const worker = new Worker<Reference>("durable-workflows", job => consume(db, job.data, ctx => ctx.kind === "REPORT_DELIVERY" ? reportDeliveryWorkflow(ctx) : reportWorkflow(ctx, async notices => {
  await Promise.all(notices.map(notice => producerConnection.publish(`notif:${notice.userId}`, JSON.stringify(notice))));
})), { connection, concurrency: 5 });
worker.on("error", () => console.error(JSON.stringify({ component: "workflow-worker", reason: "TRANSPORT_FAILURE" })));
let closing = false;
async function pump() {
  while (!closing) {
    try {
      await dispatch(db, (ref, jobId) => queue.add("reference", ref, { jobId, attempts: 1, removeOnComplete: true, removeOnFail: 100 }));
    } catch {
      console.error(JSON.stringify({ component: "outbox-dispatcher", reason: "DISPATCH_UNAVAILABLE" }));
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}
const running = pump();
async function shutdown() {
  closing = true;
  await running;
  await worker.close();
  await queue.close();
  await connection.quit();
  await producerConnection.quit();
  await db.$disconnect();
}
process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());
