import { PrismaClient } from "@prisma/client";
import { consume } from "../../src/lib/queue/outbox";
import { processingWorkflow } from "../../src/lib/jobs/processing";
if (process.env.DATABASE_URL !== `postgresql://${process.env.QA_DB_USER || "postgres"}@127.0.0.1:${process.env.QA_DB_PORT || "55423"}/${process.env.QA_DB_NAME || "sko223"}`)
  throw new Error("Local synthetic database only");
const db = new PrismaClient();
void consume(db, JSON.parse(process.argv[2]), async (ctx) => {
  await processingWorkflow(ctx);
  process.send?.("checkpoint");
  await new Promise(() => setInterval(() => {}, 1000));
});
