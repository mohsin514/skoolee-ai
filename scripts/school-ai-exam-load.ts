/** Bounded synthetic acceptance harness. Never loads .env and never targets a configurable remote URL. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/db/prisma";
import { examProctorFixture, removeProctorFixture, type ProctorFixture } from "../tests/school-ai/exam-proctor-fixture";

const isolated = "postgresql://angular_dev_15@127.0.0.1:55438/postgres", origin = "http://localhost:3106", pupilCount = 32, concurrency = 8, durationMs = 30000;
if (process.env.DATABASE_URL !== isolated || process.env.DIRECT_URL !== isolated) throw new Error("This harness only runs against isolated PostgreSQL127.0.0.1:55438/postgres and localhost:3106. It never reads .env.");
const db = new PrismaClient();
type Attempt = { id: string; deadlineAt: string; status: string; sequence: number; responses: Record<string, string>; submittedAt: string | null };
type Pupil = { userId: string; studentId: string; email: string; cookie: string; attempt: Attempt | null; responses: Record<string, string>; sequence: number };
type Sample = { phase: string; status: number; elapsedMs: number };
const samples: Sample[] = []; let inFlight = 0, peakInFlight = 0, fixture: ProctorFixture | null = null;
async function pool<T>(items: T[], work: (item: T, index: number) => Promise<void>) { let next = 0; const results = await Promise.allSettled(Array.from({ length: Math.min(concurrency, items.length) }, async () => { for (;;) { const index = next++; if (index >= items.length) return; await work(items[index], index); } })); const failed = results.find(result => result.status === "rejected"); if (failed?.status === "rejected") throw failed.reason; }
async function request(phase: string, path: string, pupil: Pupil, method = "GET", body?: unknown) {
  const started = performance.now(); inFlight++; peakInFlight = Math.max(peakInFlight, inFlight);
  try { const response = await fetch(`${origin}${path}`, { method, headers: { Origin: origin, "Content-Type": "application/json", ...(pupil.cookie ? { Cookie: pupil.cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: "error", signal: AbortSignal.timeout(15000) }); samples.push({ phase, status: response.status, elapsedMs: Math.round((performance.now() - started) * 100) / 100 }); return { response, payload: await response.json() }; }
  finally { inFlight--; }
}
function candidateOnly(value: unknown) { assert(!/correctOptionId|modelAnswer|paperSnapshot|scoreProposal/.test(JSON.stringify(value)), "candidate response disclosed a marking key"); }
async function main() {
  const started = Date.now(), password = `Synthetic-only-${randomUUID()}`, hash = await bcrypt.hash(password, 10); let result: Record<string, unknown> = {}, failure: unknown;
  try {
    fixture = await examProctorFixture(db, { start: false, enabled: false });
    const pupils: Pupil[] = [];
    for (let index = 0; index < pupilCount; index++) {
      if (index < 2) { const user = index === 0 ? fixture.learner : fixture.other; await db.user.update({ where: { id: user.userId }, data: { password: hash, mfaEnabled: false, mustChangePassword: false } }); pupils.push({ userId: user.userId, studentId: fixture.students[index].id, email: user.email, cookie: "", attempt: null, responses: {}, sequence: 0 }); }
      else { const id = randomUUID(), email = `${id}@example.invalid`; await db.user.create({ data: { id, schoolId: fixture.schoolId, campusId: fixture.campusId, role: "STUDENT", fullName: `Synthetic load pupil ${index}`, email, password: hash, onboardingComplete: true, isActive: true } }); const student = await db.student.create({ data: { schoolId: fixture.schoolId, campusId: fixture.campusId, classId: fixture.classId, fullName: `Synthetic load pupil ${index}`, rollNo: String(index + 1), gender: "OTHER", status: "active", studentUserId: id } }); pupils.push({ userId: id, studentId: student.id, email, cookie: "", attempt: null, responses: {}, sequence: 0 }); }
    }
    await db.schoolAiExamAssignment.update({ where: { id: fixture.assignment.id }, data: { studentIds: pupils.map(pupil => pupil.studentId) } });
    const endpoint = `/api/school-ai/exams/${fixture.assignment.id}`;
    await pool(pupils, async pupil => {
      const login = await request("login", "/api/auth/login", pupil, "POST", { email: pupil.email, password, schoolId: fixture!.schoolId, rememberMe: false }); assert.equal(login.response.status, 200, "synthetic sign-in failed"); assert.equal(login.payload.user.id, pupil.userId);
      pupil.cookie = login.response.headers.getSetCookie().find(cookie => cookie.startsWith("skoolee_token="))?.split(";")[0] ?? ""; assert(pupil.cookie, "real HTTP sign-in did not set a session cookie");
      let metadata = await request("metadata", endpoint, pupil); assert.equal(metadata.response.status, 200); candidateOnly(metadata.payload);
      let start = await request("start", `${endpoint}/attempt`, pupil, "POST", { version: metadata.payload.exam.version });
      for (let retry = 0; start.response.status === 409 && retry < 3; retry++) { await delay(200 * (retry + 1)); metadata = await request("readiness-refresh", endpoint, pupil); assert.equal(metadata.response.status, 200); start = await request("start-retry", `${endpoint}/attempt`, pupil, "POST", { version: metadata.payload.exam.version }); }
      assert.equal(start.response.status, 200, `start did not complete after bounded retry: ${start.payload.error ?? start.response.status}`); candidateOnly(start.payload); pupil.attempt = start.payload.attempt; assert(pupil.attempt?.id);
    });
    assert.equal(new Set(pupils.map(pupil => pupil.attempt!.id)).size, pupilCount, "pupils received another pupil's attempt");
    const exerciseStarted = Date.now();
    for (let round = 1; round <= 4; round++) {
      await pool(pupils, async (pupil, index) => {
        const responses = { q1: index % 2 ? "a2" : "a1", q3: `Synthetic pupil ${index}: answer revision ${round}.` }, body = { sequence: pupil.sequence + 1, responses, submit: false };
        const saved = await request("autosave", `${endpoint}/attempt`, pupil, "PATCH", body); assert.equal(saved.response.status, 200); candidateOnly(saved.payload); assert.deepEqual(saved.payload.attempt.responses, responses); assert.equal(saved.payload.attempt.id, pupil.attempt!.id); assert.equal(saved.payload.attempt.deadlineAt, pupil.attempt!.deadlineAt); pupil.responses = responses; pupil.sequence = body.sequence;
        if (index < 8) { const replay = await request("autosave-replay", `${endpoint}/attempt`, pupil, "PATCH", body); assert.equal(replay.response.status, 200); assert.deepEqual(replay.payload.attempt.responses, responses); assert.equal(replay.payload.attempt.sequence, pupil.sequence); }
      });
      await delay(Math.max(0, exerciseStarted + round * 6500 - Date.now()));
    }
    await pool(pupils.slice(0, 8), async pupil => { const stale = await request("intentional-stale-save", `${endpoint}/attempt`, pupil, "PATCH", { sequence: pupil.sequence - 1, responses: { q3: "Synthetic stale write must not win" }, submit: false }); assert.equal(stale.response.status, 409); });
    await delay(Math.max(0, started + durationMs - Date.now()));
    await pool(pupils, async pupil => {
      const body = { sequence: pupil.sequence + 1, responses: pupil.responses, submit: true }, submitted = await request("submit", `${endpoint}/attempt`, pupil, "PATCH", body); assert.equal(submitted.response.status, 200); assert.equal(submitted.payload.attempt.status, "SUBMITTED"); assert.deepEqual(submitted.payload.attempt.responses, pupil.responses); assert.equal(submitted.payload.attempt.id, pupil.attempt!.id); assert.equal(submitted.payload.attempt.deadlineAt, pupil.attempt!.deadlineAt);
      const replay = await request("submit-replay", `${endpoint}/attempt`, pupil, "PATCH", body); assert.equal(replay.response.status, 200); assert.deepEqual(replay.payload.attempt.responses, pupil.responses); assert.equal(replay.payload.attempt.submittedAt, submitted.payload.attempt.submittedAt);
      const reopened = await request("receipt", `${endpoint}/attempt`, pupil); assert.equal(reopened.response.status, 200); candidateOnly(reopened.payload); assert.deepEqual(reopened.payload.attempt.responses, pupil.responses); assert.equal(reopened.payload.attempt.id, pupil.attempt!.id);
      const stored = await db.schoolAiExamAttempt.findUniqueOrThrow({ where: { id: pupil.attempt!.id } }); assert.equal(stored.userId, pupil.userId); assert.equal(stored.studentId, pupil.studentId); assert.equal(stored.status, "SUBMITTED"); assert.deepEqual(stored.responses, pupil.responses); assert.equal(stored.sequence, body.sequence);
    });
    assert.equal(await db.schoolAiExamAttempt.count({ where: { schoolId: fixture.schoolId, status: "SUBMITTED" } }), pupilCount); assert.equal(await db.mark.count({ where: { schoolId: fixture.schoolId } }), 0); assert.equal(await db.schoolAiProctorSession.count({ where: { schoolId: fixture.schoolId } }), 0);
    result = { integrity: "passed", pupilCount, submittedReceipts: pupilCount, noPeerDataOrDeadlineMix: true, noMarkingKeysExposed: true, realHttpSignIn: true };
  } catch (error) { failure = error; result = { integrity: "failed", error: error instanceof Error ? error.message : "Unknown error" }; }
  finally {
    const elapsedSeconds = (Date.now() - started) / 1000, sorted = samples.map(sample => sample.elapsedMs).sort((a, b) => a - b), percentile = (p: number) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] : null;
    const report = { ...result, scope: "Synthetic localhost development server only; shared machine timings are not a production SLO or real-school pilot result.", endpoint: origin, database: "isolated localhost:55438/postgres", concurrency, peakInFlight, elapsedSeconds, requests: samples.length, requestsPerSecond: Number((samples.length / elapsedSeconds).toFixed(2)), latencyMs: { p50: percentile(0.5), p95: percentile(0.95), p99: percentile(0.99), max: sorted.at(-1) ?? null }, statusCounts: Object.fromEntries([...new Set(samples.map(sample => sample.status))].sort().map(status => [status, samples.filter(sample => sample.status === status).length])), rateLimited429: samples.filter(sample => sample.status === 429).length, conflicts409: samples.filter(sample => sample.status === 409).length, intentionalStaleWrites: samples.filter(sample => sample.phase === "intentional-stale-save").length, phaseCounts: Object.fromEntries([...new Set(samples.map(sample => sample.phase))].map(phase => [phase, samples.filter(sample => sample.phase === phase).length])) };
    await mkdir("test-results/school-ai/load-completion", { recursive: true }); await writeFile("test-results/school-ai/load-completion/report.json", JSON.stringify(report, null, 2) + "\n"); console.log(JSON.stringify(report, null, 2));
    if (fixture) await removeProctorFixture(db, fixture.schoolId); await db.$disconnect(); await prisma.$disconnect();
  }
  if (failure) throw failure;
}
void main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
