/** Providerless post-restore smoke. Only the harness's disposable restored DB is allowed. */
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { PrismaClient } from "@prisma/client";
import { appendEvent, consume, reconcile, type Reference } from "../../src/lib/queue/outbox";
import { getTenantContext } from "../../src/lib/db/tenant-context";

async function main() {
  const url = new URL(process.env.DATABASE_URL || "http://invalid");
  assert.equal(url.hostname, "127.0.0.1");
  assert.match(url.pathname, /^\/rehearsal_[0-9a-f]{12}_restored$/);
  assert.ok(url.port);
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  const started = performance.now();
  const checks: { name: string; passed: true }[] = [];
  const check = (name: string, condition: unknown) => { assert.ok(condition, name); checks.push({ name, passed: true }); };
  const schoolA = "rehearsal-school", schoolB = "rehearsal-school-b";
  const event = async (schoolId: string, identity: string): Promise<Reference> => {
    const eventId = await db.$transaction(tx => appendEvent(tx, { schoolId, actorId: "role-PRINCIPAL", referenceId: "synthetic-smoke", kind: "RECOVERY_SMOKE", version: 1, identity }));
    await db.$executeRaw`UPDATE workflow_jobs SET next_attempt_at=now()-interval '1 second' WHERE id=${eventId} AND school_id=${schoolId}`;
    return { schoolId, eventId };
  };
  const read = async (ref: Reference) => (await db.$queryRaw<{ state: string; reason: string | null; attempts: number }[]>`SELECT state,reason,attempts FROM workflow_jobs WHERE id=${ref.eventId} AND school_id=${ref.schoolId}`)[0];
  try {
    await db.$executeRaw`CREATE TABLE recovery_smoke_effects(event_id text PRIMARY KEY, school_id text NOT NULL)`;
    const retry = await event(schoolA, "smoke-retry");
    await consume(db, retry, async () => { throw new Error("synthetic private failure must never be logged"); });
    const first = await read(retry);
    check("failure-recorded-with-sanitized-reason", first.state === "retrying" && first.reason === "WORKER_FAILURE" && first.attempts === 1);
    await db.$executeRaw`UPDATE workflow_jobs SET next_attempt_at=now()-interval '1 second' WHERE id=${retry.eventId}`;
    const complete = async (ref: Reference) => consume(db, ref, async ctx => {
      assert.equal(getTenantContext()?.schoolId, ref.schoolId);
      await ctx.effect("synthetic-once", async tx => {
        await tx.$executeRaw`INSERT INTO recovery_smoke_effects(event_id,school_id) VALUES (${ref.eventId},${ref.schoolId})`;
      });
    });
    await complete(retry);
    await complete(retry);
    check("retry-and-duplicate-preserve-one-effect", (await read(retry)).state === "completed" && (await read(retry)).attempts === 2);
    const wrong = await event(schoolA, "smoke-wrong-scope");
    let invoked = false;
    await consume(db, { ...wrong, schoolId: schoolB }, async () => { invoked = true; });
    check("cross-tenant-reference-cannot-run", !invoked && (await read(wrong)).attempts === 0);
    await complete(wrong);
    const uncertain = await event(schoolB, "smoke-uncertain");
    let sinkCalls = 0;
    const lostReceipt = () => consume(db, uncertain, async ctx => ctx.external("local-sink-only", async () => {}, async () => { sinkCalls++; throw new Error("Synthetic local sink response lost"); }));
    await lostReceipt(); await lostReceipt();
    check("uncertain-external-outcome-is-not-replayed", sinkCalls === 1 && (await read(uncertain)).state === "failed" && (await read(uncertain)).reason === "EXTERNAL_OUTCOME_UNCERTAIN");

    // This is a bounded recovery smoke budget, not a production capacity/SLA.
    const threshold = { totalJobs: 32, noisyTenantJobs: 28, quietTenantJobs: 4, concurrency: 4, maxPerJobMs: 5000, maxTotalMs: 30000 };
    const refs: Reference[] = [];
    for (let index = 0; index < threshold.totalJobs; index++) refs.push(await event(index % 8 === 0 ? schoolB : schoolA, `smoke-load-${index}`));
    const elapsed: Record<string, number[]> = { A: [], B: [] };
    const loadStarted = performance.now();
    for (let index = 0; index < refs.length; index += threshold.concurrency) {
      await Promise.all(refs.slice(index, index + threshold.concurrency).map(async ref => {
        const start = performance.now(); await complete(ref);
        elapsed[ref.schoolId === schoolA ? "A" : "B"].push(performance.now() - start);
      }));
    }
    const loadMs = performance.now() - loadStarted;
    const effects = await db.$queryRaw<{ school_id: string; count: number }[]>`SELECT school_id,count(*)::int AS count FROM recovery_smoke_effects GROUP BY school_id`;
    check("bounded-two-tenant-load-completes-without-cross-effects", effects.find(row => row.school_id === schoolA)?.count === 30 && effects.find(row => row.school_id === schoolB)?.count === 4 && getTenantContext() === undefined);
    check("declared-local-recovery-smoke-budget", loadMs <= threshold.maxTotalMs && Object.values(elapsed).flat().every(value => value <= threshold.maxPerJobMs));
    const observed = await reconcile(db, schoolB) as { id: string; state: string; reconciliation: string; reason: string | null; uncertain_effects: number }[];
    const bIds = new Set([...refs.filter(ref => ref.schoolId === schoolB).map(ref => ref.eventId), uncertain.eventId]);
    check("reconciliation-exposes-failure-and-tenant-scoped-correlations", observed.length === 5 && observed.every(row => bIds.has(row.id)) && observed.some(row => row.id === uncertain.eventId && row.reconciliation === "dead-letter" && row.uncertain_effects === 1));
    const percentile = (values: number[]) => +[...values].sort((a, b) => a - b)[Math.ceil(values.length * .95) - 1].toFixed(3);
    const report = { formatVersion: 1, dataClass: "synthetic", environment: "isolated-synthetic-staging", status: "passed", checks,
      load: { threshold, elapsedMs: +loadMs.toFixed(3), tenantA: { jobs: 28, p95Ms: percentile(elapsed.A) }, tenantB: { jobs: 4, p95Ms: percentile(elapsed.B) } },
      localSinkCalls: sinkCalls, actualProviderCalls: 0, elapsedMs: +(performance.now() - started).toFixed(3),
      correlations: { retryEventId: retry.eventId, uncertainEventId: uncertain.eventId },
      limitations: ["In-process providerless handlers against the restored PostgreSQL database. No Redis, app server, worker entry point, live provider or scheduler fairness/capacity claim.", "Thresholds are checked-in development regression budgets, not an agreed customer SLA or production RPO/RTO."] };
    await writeFile("job-smoke.json", JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
    console.log("Synthetic post-restore job smoke passed; redacted counts, timings and correlation IDs recorded.");
  } finally { await db.$disconnect(); }
}
main().catch(() => { console.error("Synthetic post-restore job smoke failed; inspect the isolated database and stage log."); process.exitCode = 1; });
