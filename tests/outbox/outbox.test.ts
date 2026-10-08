import assert from "node:assert/strict";
import { after, test } from "node:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { appendEvent, consume, dispatch, cancel, reconcile, type Reference, type Sql } from "../../src/lib/queue/outbox";
import { reportWorkflow } from "../../src/lib/queue/report-workflow";
import { operateWorkflow, requireWorkflowOperator } from "../../src/lib/queue/operations";
import { getTenantContext } from "../../src/lib/db/tenant-context";

const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55420" || url.pathname !== "/sko220_test") throw new Error("Disposable local sko220_test database required");
if (process.env.REDIS_URL !== "redis://127.0.0.1:56420") throw new Error("Disposable local Redis required");
const db = new PrismaClient();
const schoolId = "rehearsal-school";
async function event(kind = "TEST", identity = randomUUID(), school = schoolId) {
  const eventId = await db.$transaction(tx => appendEvent(tx, { schoolId: school, actorId: "role-PRINCIPAL", referenceId: "rehearsal-exam", kind, version: 1, identity }));
  return { eventId, schoolId: school };
}
async function job(ref: Reference) { return (await db.$queryRaw<{ state: string; checkpoint: number; reason: string; attempts: number }[]>`SELECT state,checkpoint,reason,attempts FROM workflow_jobs WHERE id=${ref.eventId}`)[0]; }
async function ready(ref: Reference) {
  await db.$executeRaw`UPDATE workflow_jobs SET lease_until=now()-interval '1 second',next_attempt_at=now()-interval '1 second' WHERE id=${ref.eventId}`;
  await db.$executeRaw`UPDATE workflow_events SET available_at=now()-interval '1 second',lease_until=NULL WHERE id=${ref.eventId}`;
}
async function increment(tx: Sql) {
  await tx.$executeRaw`UPDATE marks SET marks_obtained=marks_obtained+1 WHERE id='rehearsal-mark' AND school_id=${schoolId}`;
}
async function marks() { return (await db.$queryRaw<{ value: number }[]>`SELECT marks_obtained AS value FROM marks WHERE id='rehearsal-mark'`)[0].value; }
async function crash(mode: string, eventId?: string) {
  const child = spawn(process.execPath, ["--import", "tsx", "tests/outbox/crash-child.ts"], { env: { NODE_ENV: "test", PATH: process.env.PATH, DATABASE_URL: process.env.DATABASE_URL, CRASH_MODE: mode, EVENT_ID: eventId }, stdio: ["ignore", "pipe", "pipe"] });
  let errors = "";
  child.stderr.on("data", data => errors += data);
  const marker = await Promise.race([
    once(child.stdout, "data").then(([data]) => String(data).trim()),
    once(child, "exit").then(() => { throw new Error(errors || "Child exited before crash marker"); }),
  ]);
  child.kill("SIGKILL");
  await once(child, "exit");
  return marker;
}
after(async () => db.$disconnect());

test("transaction rollback removes both domain mutation and event", async () => {
  const before = await marks();
  await assert.rejects(db.$transaction(async tx => {
    await increment(tx);
    await appendEvent(tx, { schoolId, actorId: "role-PRINCIPAL", referenceId: "rehearsal-exam", kind: "TEST", version: 1, identity: "rollback" });
    throw new Error("injected crash before commit");
  }));
  assert.equal(await marks(), before);
  assert.equal((await db.$queryRaw<unknown[]>`SELECT id FROM workflow_events WHERE identity='rollback'`).length, 0);
});

test("SIGKILL after commit survives publish outage and real Redis duplicate delivery", async () => {
  await db.$executeRaw`UPDATE exams SET status='PUBLISHED' WHERE id='rehearsal-exam'`;
  const ref = { schoolId, eventId: await crash("commit") };
  assert.equal((await job(ref)).state, "queued");
  await dispatch(db, async () => { throw new Error("Redis outage"); });
  assert.equal((await job(ref)).state, "queued");
  await ready(ref);
  const connection = new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
  const name = `outbox-test-${randomUUID()}`;
  const queue = new Queue<Reference>(name, { connection });
  let completed = 0;
  const worker = new Worker<Reference>(name, async j => { await consume(db, j.data, reportWorkflow); completed++; }, { connection, concurrency: 2 });
  try {
    await dispatch(db, async (data, jobId) => {
      await queue.add("ref", data, { jobId });
      await queue.add("duplicate", data, { jobId: `${jobId}-duplicate` });
    });
    for (let i = 0; i < 100 && completed < 2; i++) await new Promise(r => setTimeout(r, 50));
    assert.equal(completed, 2);
    assert.equal((await job(ref)).state, "completed");
    const receipts = await db.$queryRaw<unknown[]>`SELECT id FROM workflow_effects WHERE job_id=${ref.eventId}`;
    assert.equal(receipts.length, 1);
    const dupes = await db.$queryRaw<unknown[]>`SELECT user_id FROM notifications WHERE type='REPORT_CARDS_PUBLISHED' GROUP BY user_id HAVING count(*)>1`;
    assert.equal(dupes.length, 0);
  } finally { await worker.close(); await queue.obliterate({ force: true }); await queue.close(); await connection.quit(); }
});

test("competing dispatchers lease each event once; lost delivery lease recovers", async () => {
  const ref = await event();
  let published = 0;
  await Promise.all([dispatch(db, async () => { published++; }), dispatch(db, async () => { published++; })]);
  assert.equal(published, 1);
  await ready(ref);
  await dispatch(db, async () => { published++; });
  assert.equal(published, 2);
  await cancel(db, ref);
});

test("concurrent consumers commit one domain effect; failed effect rolls back", async () => {
  const ref = await event();
  const before = await marks();
  const handler: Parameters<typeof consume>[2] = async ctx => { await ctx.effect("approved-output", increment); };
  await Promise.all(Array.from({ length: 8 }, () => consume(db, ref, handler)));
  assert.equal(await marks(), before + 1);
  assert.equal((await job(ref)).checkpoint, 1);
  const failing = await event();
  await consume(db, failing, async ctx => { await ctx.effect("rollback", async tx => { await increment(tx); throw new Error("private student content must not be logged"); }); });
  assert.equal(await marks(), before + 1);
  assert.equal((await job(failing)).reason, "WORKER_FAILURE");
  await cancel(db, failing);
});

test("killed mid-batch resumes checkpoint after a different tenant; no context leakage", async () => {
  await db.$executeRaw`INSERT INTO schools (id,name,slug,city,reg_id,contact_email) VALUES ('outbox-school-b','Synthetic B','outbox-b','Test','outbox-b','b@example.invalid') ON CONFLICT DO NOTHING`;
  const ref = await event();
  const before = await marks();
  await crash("batch", ref.eventId);
  assert.equal((await job(ref)).checkpoint, 1);
  const other = await event("TEST", randomUUID(), "outbox-school-b");
  await consume(db, other, async ctx => {
    assert.equal(getTenantContext()?.schoolId, "outbox-school-b");
    assert.equal(ctx.schoolId, "outbox-school-b");
    throw new Error("tenant B failed");
  });
  assert.equal(getTenantContext(), undefined);
  await consume(db, { ...ref, schoolId: "outbox-school-b" }, async () => { assert.fail("cross-school claim"); });
  await ready(ref);
  await consume(db, ref, async ctx => {
    assert.equal(getTenantContext()?.schoolId, schoolId);
    assert.equal(ctx.checkpoint, 1);
    await ctx.effect("first", increment);
    await ctx.effect("second", increment);
  });
  assert.equal(await marks(), before + 2);
  assert.equal((await job(ref)).checkpoint, 2);
  await cancel(db, other);
});

test("retry budget, dead letter, current operator roles, audited retry and cancellation", async () => {
  const ref = await event();
  for (let i = 0; i < 5; i++) { await ready(ref); await consume(db, ref, async () => { throw new Error("injected failure"); }); }
  assert.equal((await job(ref)).state, "failed");
  assert.equal((await job(ref)).attempts, 5);
  const roles = await db.$queryRaw<{ id: string; role: string }[]>`SELECT id,role::text AS role FROM users WHERE school_id=${schoolId}`;
  for (const role of roles) {
    if (role.role === "APP_OWNER") await db.$transaction(tx => requireWorkflowOperator(tx, role.id, schoolId));
    else await assert.rejects(db.$transaction(tx => requireWorkflowOperator(tx, role.id, schoolId)), /OPERATOR_REQUIRED/);
  }
  await db.$transaction(async tx => { await requireWorkflowOperator(tx, "role-APP_OWNER", schoolId); await operateWorkflow(tx, ref, "role-APP_OWNER", "retry"); });
  assert.equal((await job(ref)).state, "queued");
  const before = await marks();
  await consume(db, ref, async ctx => { await ctx.effect("before-cancel", increment); await cancel(db, ref); await ctx.effect("after-cancel", increment); });
  assert.equal(await marks(), before + 1);
  assert.equal((await job(ref)).state, "cancelled");
  assert.equal((await job(ref)).checkpoint, 1);
});

test("uncertain provider effect is preserved and cannot be automatically or manually replayed", async () => {
  const ref = await event();
  let calls = 0;
  const handler: Parameters<typeof consume>[2] = async ctx => { await ctx.external("provider-send", async () => {}, async () => { calls++; throw new Error("response lost after simulated provider acceptance"); }); };
  await consume(db, ref, handler);
  await ready(ref);
  await consume(db, ref, handler);
  assert.equal(calls, 1);
  assert.equal((await job(ref)).state, "failed");
  await assert.rejects(db.$transaction(tx => operateWorkflow(tx, ref, "role-APP_OWNER", "retry")), /RECONCILE_EXTERNAL_OUTCOME_FIRST/);
  await cancel(db, ref);
  const effects = await db.$queryRaw<{ state: string }[]>`SELECT state FROM workflow_effects WHERE job_id=${ref.eventId}`;
  assert.equal(effects[0].state, "uncertain");
});

test("execution rechecks current publication and actor, report exposes no student content", async () => {
  const ref = await event("REPORT_PUBLISHED");
  await db.$executeRaw`UPDATE exams SET status='PRINCIPAL_REVIEWED' WHERE id='rehearsal-exam'`;
  await consume(db, ref, reportWorkflow);
  assert.equal((await job(ref)).reason, "AUTHORIZATION_OR_PUBLICATION_REVOKED");
  const revoked = await event("REPORT_PUBLISHED");
  await db.$executeRaw`UPDATE exams SET status='PUBLISHED' WHERE id='rehearsal-exam'`;
  await db.$executeRaw`UPDATE users SET is_active=false WHERE id='role-PRINCIPAL'`;
  await consume(db, revoked, reportWorkflow);
  assert.equal((await job(revoked)).reason, "AUTHORIZATION_OR_PUBLICATION_REVOKED");
  await db.$executeRaw`UPDATE users SET is_active=true WHERE id='role-PRINCIPAL'`;
  const deniedPermission = await event("REPORT_PUBLISHED");
  await db.$executeRaw`INSERT INTO role_permissions (id,school_id,role,module,can_edit,updated_at)
    VALUES ('outbox-denied',${schoolId},'PRINCIPAL','reports',false,now()) ON CONFLICT (school_id,role,module) DO UPDATE SET can_edit=false`;
  await consume(db, deniedPermission, reportWorkflow);
  assert.equal((await job(deniedPermission)).reason, "AUTHORIZATION_OR_PUBLICATION_REVOKED");
  await db.$executeRaw`DELETE FROM role_permissions WHERE id='outbox-denied'`;
  const report = JSON.stringify(await reconcile(db, schoolId));
  assert.match(report, /dead-letter/);
  assert.doesNotMatch(report, /Synthetic pupil|example.invalid|outbox-school-b|marks_obtained/);
});

test("expired worker token cannot commit after another worker recovers the job", async () => {
  const ref = await event();
  const before = await marks();
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const entered = new Promise<void>(resolve => { started = resolve; });
  const stale = consume(db, ref, async ctx => { started(); await gate; await ctx.effect("stale-effect", increment); });
  await entered;
  await ready(ref);
  await consume(db, ref, async ctx => { await ctx.effect("recovered-effect", increment); });
  release();
  await stale;
  assert.equal(await marks(), before + 1);
  assert.equal((await job(ref)).state, "completed");
  assert.equal((await job(ref)).checkpoint, 1);
});
