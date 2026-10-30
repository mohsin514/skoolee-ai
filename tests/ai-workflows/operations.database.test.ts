import { redis } from "../../src/lib/queue/connection";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../../src/lib/db/prisma";
import type { AuthUser } from "../../src/lib/auth";
import type { generateAIDraft } from "../../src/lib/ai/openai";
import { startJob, advanceJob } from "../../src/lib/ai-workflows/jobs/job-service";
import { sweepWorkflowJobs } from "../../src/lib/ai-workflows/jobs/worker";
import { acquireProviderSlot, providerBackoffMs } from "../../src/lib/ai-workflows/jobs/provider-limit";
import { workflowMetrics } from "../../src/lib/ai-workflows/adapters/platform";
import { aiWorkflowsDestination } from "./support/destination.mjs";
aiWorkflowsDestination();
const db = new PrismaClient(), schools: string[] = [];
after(async () => { await db.school.deleteMany({ where: { id: { in: schools } } }); await db.$disconnect(); await prisma.$disconnect(); redis.disconnect(); });

async function admin() {
  const schoolId = `ops-${randomUUID()}`, campusId = randomUUID(), userId = randomUUID(); schools.push(schoolId);
  await db.school.create({ data: { id: schoolId, slug: schoolId, regId: schoolId, name: "Synthetic ops school", contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, regId: campusId, name: "Main", city: "Lahore" } });
  await db.user.create({ data: { id: userId, schoolId, campusId, email: `${userId}@example.invalid`, fullName: "Synthetic admin", role: "CAMPUS_ADMIN", isActive: true } });
  return { schoolId, campusId, userId, role: "CAMPUS_ADMIN", email: `${userId}@example.invalid`, accessVersion: 0 } as AuthUser;
}

test("the platform-wide limiter refuses calls over the per-second limit, and backoff grows then caps", async () => {
  const second = Date.now() + 10_000_000 + Math.floor(Math.random() * 1000) * 1000; // a fresh window
  await acquireProviderSlot(second, 2); await acquireProviderSlot(second, 2);
  await assert.rejects(acquireProviderSlot(second, 2), (error: { code?: string; params?: { reason?: string } }) => error.code === "PROVIDER_UNAVAILABLE" && error.params?.reason === "RATE_LIMITED");
  assert.deepEqual([1, 2, 3, 6].map(providerBackoffMs), [30_000, 60_000, 120_000, 480_000]);
});

test("a provider outage pauses the job with backoff, charges nothing, and the worker wakes it to plan again", async () => {
  const user = await admin();
  const job = await startJob(user, { message: "Add a holiday on 12 November", language: "en", idempotencyKey: `ops-${randomUUID()}` });
  const down: typeof generateAIDraft = async () => { throw new Error("503 from provider"); };
  const paused = await advanceJob(user, job.id, "request", down);
  assert.equal(paused.status, "PAUSED");
  assert.equal(paused.errorCode, "PROVIDER_UNAVAILABLE");
  assert.equal((paused.errorParams as { attempt: number }).attempt, 1);
  assert.ok(paused.nextWakeAt && paused.nextWakeAt.getTime() > Date.now());
  assert.equal(paused.creditsCharged, 0, "an attempt that never ran charges no credit");
  await sweepWorkflowJobs(db, new Date(Date.now() - 1000));
  assert.equal((await db.aiWorkflowJob.findUniqueOrThrow({ where: { id: job.id } })).status, "PAUSED", "not before its backoff");
  await db.aiWorkflowJob.update({ where: { id: job.id }, data: { nextWakeAt: new Date(Date.now() - 1000) } });
  const result = await sweepWorkflowJobs(db, new Date(), down);
  assert.ok(result.woke >= 1);
  // Woken, it planned again; with no provider in this test it pauses again on the next attempt.
  const again = await db.aiWorkflowJob.findUniqueOrThrow({ where: { id: job.id } });
  assert.equal((again.errorParams as { attempt: number }).attempt, 2, "the worker planned it again");
  assert.equal(again.creditsCharged, 0);
  // When the provider is back, the plan lands and the stale provider error is cleared.
  await db.aiWorkflowJob.update({ where: { id: job.id }, data: { status: "PLANNING", nextWakeAt: null } });
  const up: typeof generateAIDraft = async () => ({ text: JSON.stringify({ kind: "plan", steps: [{ key: "s1", capability: "personal.save_plan", input: { title: "Holiday note", goal: "Remember the holiday", steps: [{ title: "12 November", detail: "", dueDate: null }] }, evidence: [] }] }), model: "synthetic:test", tokensUsed: 0, promptVersion: "test" });
  const done = await advanceJob(user, job.id, "request", up);
  assert.equal(done.errorCode, null);
});

test("a hand-off nobody took within its 14 days expires, and its step says so", async () => {
  const user = await admin();
  const job = await db.aiWorkflowJob.create({ data: { schoolId: user.schoolId, campusId: user.campusId, actorId: user.userId, actorRole: user.role, accessVersion: 0, origin: "FREEFORM", language: "en", requestHash: "a".repeat(64), idempotencyKey: `exp-${randomUUID()}`, status: "WAITING_HANDOFF", budget: {}, expiresAt: new Date(Date.now() + 86_400_000) } });
  const step = await db.aiWorkflowStep.create({ data: { schoolId: user.schoolId, campusId: user.campusId, jobId: job.id, planVersion: 1, stepKey: "s1", capabilityKey: "setup.transfers", capabilityVersion: 1, staticClass: "C", effectiveClass: "C", status: "WAITING_HANDOFF", modelInput: {}, idempotencyKey: `st-${randomUUID()}` } });
  const handoff = await db.aiWorkflowHandoff.create({ data: { schoolId: user.schoolId, campusId: user.campusId, jobId: job.id, stepId: step.id, kind: "RECORD_APPROVAL", targetRoute: "/ai", targetRoles: ["ADMIN"], originRole: user.role, originUserId: user.userId, prefill: {}, idempotencyKey: `h-${randomUUID()}`, expiresAt: new Date(Date.now() - 1000) } });
  const result = await sweepWorkflowJobs(db);
  assert.ok(result.expired >= 1);
  assert.equal((await db.aiWorkflowHandoff.findUniqueOrThrow({ where: { id: handoff.id } })).status, "EXPIRED");
  const after = await db.aiWorkflowStep.findUniqueOrThrow({ where: { id: step.id } });
  assert.deepEqual([after.status, after.errorCode], ["FAILED", "EXPIRED"]);
});

test("operations metrics are for the platform owner only and return counts, never tenant text", async () => {
  const user = await admin();
  await assert.rejects(workflowMetrics(user), (error: { status?: number }) => error.status === 403);
  const owner = { ...user, role: "APP_OWNER", campusId: null } as AuthUser;
  const metrics = await workflowMetrics(owner, 24);
  assert.equal(typeof metrics.jobs, "number");
  assert.ok(!/@example|Synthetic/.test(JSON.stringify(metrics)), "no names or emails");
});
