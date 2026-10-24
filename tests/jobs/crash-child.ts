import { PrismaClient } from "@prisma/client";
import { consume } from "../../src/lib/queue/outbox";
import { processingWorkflow } from "../../src/lib/jobs/processing";
if (process.env.DATABASE_URL !== "postgresql://postgres@127.0.0.1:55423/sko223")
  throw new Error("Local synthetic database only");
const db = new PrismaClient();
void consume(db, JSON.parse(process.argv[2]), async (ctx) => {
  await processingWorkflow(ctx);
  process.send?.("checkpoint");
  await new Promise(() => setInterval(() => {}, 1000));
});
