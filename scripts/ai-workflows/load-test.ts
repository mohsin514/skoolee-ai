/**
 * AI Workflows load test (design-slices §11): N synthetic schools × M jobs through the real runtime
 * (start → plan → run → sweep), with a stub model so it measures the engine, not the provider.
 * Gate: every job finishes, no step writes twice, and throughput stays above the floor.
 *
 *   DATABASE_URL=postgresql://$USER@127.0.0.1:55438/ai_workflows_test DIRECT_URL=$DATABASE_URL \
 *     node --import ./tests/support/server-only.mjs --import tsx scripts/ai-workflows/load-test.ts --schools 200 --jobs 30
 *
 * Runs only against the disposable AI Workflows databases (same guard as the DB tests).
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../../src/lib/db/prisma";
import { redis } from "../../src/lib/queue/connection";
import type { AuthUser } from "../../src/lib/auth";
import type { generateAIDraft } from "../../src/lib/ai/openai";
import { startJob, advanceJob } from "../../src/lib/ai-workflows/jobs/job-service";
import { sweepWorkflowJobs } from "../../src/lib/ai-workflows/jobs/worker";
import { aiWorkflowsDestination } from "../../tests/ai-workflows/support/destination.mjs";

aiWorkflowsDestination();
const arg = (name: string, fallback: number) => { const at = process.argv.indexOf(`--${name}`); return at > 0 ? Number(process.argv[at + 1]) : fallback; };
const SCHOOLS = arg("schools", 20), JOBS = arg("jobs", 10), CONCURRENCY = arg("concurrency", 16), FLOOR = arg("floor", 5);
const db = new PrismaClient();
const plan: typeof generateAIDraft = async () => ({ text: JSON.stringify({ kind: "plan", steps: [{ key: "s1", capability: "personal.save_plan", input: { title: "Load test plan", goal: "Exercise the engine", steps: [{ title: "Step one", detail: "", dueDate: null }] }, evidence: [] }] }), model: "synthetic:load", tokensUsed: 0, promptVersion: "load" });

async function tenant(index: number): Promise<{ user: AuthUser; schoolId: string }> {
  const schoolId = `load-${index}-${randomUUID().slice(0, 8)}`, campusId = randomUUID(), userId = randomUUID();
  await db.school.create({ data: { id: schoolId, slug: schoolId, regId: schoolId, name: `Synthetic load school ${index}`, contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, regId: campusId, name: "Main", city: "Lahore" } });
  await db.user.create({ data: { id: userId, schoolId, campusId, email: `${userId}@example.invalid`, fullName: "Synthetic teacher", role: "TEACHER", isActive: true } });
  return { schoolId, user: { schoolId, campusId, userId, role: "TEACHER", email: `${userId}@example.invalid`, accessVersion: 0 } };
}

async function pool<T>(items: T[], size: number, work: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => { while (next < items.length) await work(items[next++]); }));
}

async function main() {
  const started = Date.now();
  const tenants = await Promise.all(Array.from({ length: SCHOOLS }, (_, index) => tenant(index)));
  const work = tenants.flatMap(({ user }) => Array.from({ length: JOBS }, (_, n) => ({ user, n })));
  const latencies: number[] = [], errors: string[] = [];
  const runStart = Date.now();
  await pool(work, CONCURRENCY, async ({ user, n }) => {
    const t0 = Date.now();
    try {
      const job = await startJob(user, { message: `Load test request ${n}`, language: "en", idempotencyKey: `load-${user.userId}-${n}` });
      await advanceJob(user, job.id, "request", plan);
      latencies.push(Date.now() - t0);
    } catch (error) { errors.push((error as { code?: string }).code ?? (error as Error).message); }
  });
  for (let sweep = 0; sweep < 5; sweep++) await sweepWorkflowJobs(db);
  const runMs = Date.now() - runStart;
  const ids = tenants.map(row => row.schoolId);
  // Steps that ended badly count as failures too (a step records its own error instead of throwing).
  const failedSteps = await db.aiWorkflowStep.count({ where: { schoolId: { in: ids }, status: { in: ["FAILED", "UNCERTAIN", "FAILED_UNVERIFIED"] } } });
  const [completed, total, doubles] = await Promise.all([
    db.aiWorkflowJob.count({ where: { schoolId: { in: ids }, status: "COMPLETED" } }),
    db.aiWorkflowJob.count({ where: { schoolId: { in: ids } } }),
    db.$queryRaw<Array<{ n: bigint }>>`SELECT count(*)::bigint AS n FROM (SELECT idempotency_key FROM ai_workflow_intents WHERE school_id = ANY(${ids}) GROUP BY school_id, actor_id, idempotency_key HAVING count(*) > 1) d`,
  ]);
  const byStatus = Object.fromEntries((await db.aiWorkflowJob.groupBy({ by: ["status"], where: { schoolId: { in: ids } }, _count: true })).map(row => [row.status, row._count]));
  const stepStatus = Object.fromEntries((await db.aiWorkflowStep.groupBy({ by: ["status"], where: { schoolId: { in: ids } }, _count: true })).map(row => [row.status, row._count]));
  const sorted = [...latencies].sort((a, b) => a - b), at = (p: number) => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] ?? null;
  const report = { schools: SCHOOLS, jobsPerSchool: JOBS, concurrency: CONCURRENCY, total, completed, errors: errors.length, failedSteps, byStatus, stepStatus, errorCodes: [...new Set(errors)].slice(0, 10), doubleWrites: Number(doubles[0]?.n ?? 0), jobsPerSecond: Math.round((total / (runMs / 1000)) * 10) / 10, p50Ms: at(0.5), p95Ms: at(0.95), setupMs: runStart - started, runMs };
  const gates = { allCompleted: completed === SCHOOLS * JOBS, noErrors: errors.length === 0 && failedSteps === 0, noDoubleWrites: report.doubleWrites === 0, throughput: report.jobsPerSecond >= FLOOR };
  mkdirSync("test-results/ai-workflows/load", { recursive: true });
  writeFileSync("test-results/ai-workflows/load/report.json", JSON.stringify({ report, gates }, null, 2));
  console.log(JSON.stringify({ report, gates }, null, 2));
  await db.school.deleteMany({ where: { id: { in: ids } } });
  if (!Object.values(gates).every(Boolean)) process.exitCode = 1;
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await db.$disconnect(); await prisma.$disconnect(); redis.disconnect(); });
