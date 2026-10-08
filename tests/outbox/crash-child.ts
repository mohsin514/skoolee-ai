import { PrismaClient } from "@prisma/client";
import { appendEvent, consume } from "../../src/lib/queue/outbox";
const db = new PrismaClient();
async function main() {
if (process.env.CRASH_MODE === "commit") {
  const eventId = await db.$transaction(async tx => {
    await tx.$executeRaw`UPDATE marks SET marks_obtained=84 WHERE id='rehearsal-mark'`;
    return appendEvent(tx, { schoolId: "rehearsal-school", actorId: "role-PRINCIPAL", referenceId: "rehearsal-exam", kind: "REPORT_PUBLISHED", version: 1, identity: "crash-commit" });
  });
  console.log(eventId);
} else {
  await consume(db, { schoolId: "rehearsal-school", eventId: process.env.EVENT_ID! }, async ctx => {
    await ctx.effect("first", async tx => { await tx.$executeRaw`UPDATE marks SET marks_obtained=marks_obtained+1 WHERE id='rehearsal-mark'`; });
    console.log("checkpoint-committed");
    await new Promise(() => {});
  });
}
setInterval(() => {}, 1000);
}
void main();
