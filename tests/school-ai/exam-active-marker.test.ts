import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { test } from "node:test";
import { candidateMayBeInExam, examMarkerKey, markCandidateExamActive, markCandidatesExamActive, EXAM_MARKER_GRACE_MS, type ExamMarkerClient } from "../../src/lib/school-ai/exam-active-marker";
import { candidateExamBoundaryForSession } from "../../src/lib/school-ai/exam-boundary-service";
import { PUBLIC_STATIC_FILES, isPublicStaticFileRequest } from "../../src/lib/school-ai/exam-boundary";
import type { AuthUser } from "../../src/lib/auth";

// SKAI-1840: synthetic ids only.
const gateOn = { REDIS_URL: "redis://redis.test:6379", EXAM_BOUNDARY_REDIS_GATE: "1" };
const writesOnly = { REDIS_URL: "redis://redis.test:6379" };
const redisOff = { REDIS_ENABLED: "false", REDIS_URL: "redis://redis.test:6379", EXAM_BOUNDARY_REDIS_GATE: "1" };

/** In-memory stand-in for the extend-only marker script and GET. */
function fakeRedis(clock = () => Date.now()) {
  const expiry = new Map<string, number>();
  const calls: string[] = [];
  const client: ExamMarkerClient = {
    async get(key) { calls.push(`get ${key}`); const at = expiry.get(key); return at !== undefined && at > clock() ? "1" : null; },
    async eval(_script, _n, key, ttl) { calls.push(`eval ${key} ${ttl}`); const at = clock() + Number(ttl); if ((expiry.get(String(key)) ?? 0) < at) expiry.set(String(key), at); return 1; },
  };
  return { client, calls, expiry };
}
const failing: ExamMarkerClient = { get: async () => { throw new Error("ECONNREFUSED"); }, eval: async () => { throw new Error("ECONNREFUSED"); } };
const hanging: ExamMarkerClient = { get: () => new Promise(() => {}), eval: () => new Promise(() => {}) };

test("without the gate, Redis disabled, or Redis failing, every student request runs the full database check", async () => {
  const { client, calls } = fakeRedis();
  assert.equal(await candidateMayBeInExam("student-user-a", { env: writesOnly, client }), true);
  assert.equal(await candidateMayBeInExam("student-user-a", { env: redisOff, client }), true);
  assert.deepEqual(calls, [], "no Redis read unless the gate is on");
  assert.equal(await candidateMayBeInExam("student-user-a", { env: gateOn, client: failing }), true);
  assert.equal(await candidateMayBeInExam("student-user-a", { env: gateOn, client: hanging, timeoutMs: 5 }), true);
  // A reconnecting client is not asked at all: proxy reads must not pile up in its offline queue.
  assert.equal(await candidateMayBeInExam("student-user-a", { env: gateOn, client: { ...client, status: "reconnecting" } }), true);
  assert.deepEqual(calls, [], "no Redis read while the connection is not ready");
});

test("a student with no marker skips the database; starting an exam confines the very next request", async () => {
  const { client } = fakeRedis();
  assert.equal(await candidateMayBeInExam("student-user-a", { env: gateOn, client }), false);
  await markCandidateExamActive("student-user-a", new Date(Date.now() + 60 * 60_000), { env: gateOn, client });
  assert.equal(await candidateMayBeInExam("student-user-a", { env: gateOn, client }), true);
  // Another learner (same or another school) is unaffected: markers are per account.
  assert.equal(await candidateMayBeInExam("student-user-b", { env: gateOn, client }), false);
  assert.notEqual(examMarkerKey("student-user-a"), examMarkerKey("student-user-b"));
  assert.ok(!examMarkerKey("student-user-a").includes("student-user-a"), "raw ids never reach Redis");
  // Redis going down after the start still confines: absence is trusted only when Redis answered.
  assert.equal(await candidateMayBeInExam("student-user-a", { env: gateOn, client: failing }), true);
});

test("the marker lives until the deadline plus grace and is never shortened", async () => {
  const now = new Date("2026-11-13T09:00:00Z");
  const { client, calls } = fakeRedis(() => now.getTime());
  await markCandidateExamActive("student-user-a", new Date(now.getTime() + 90 * 60_000), { env: gateOn, client, now });
  await markCandidateExamActive("student-user-a", new Date(now.getTime() + 30 * 60_000), { env: gateOn, client, now });
  const key = examMarkerKey("student-user-a");
  assert.deepEqual(calls, [`eval ${key} ${90 * 60_000 + EXAM_MARKER_GRACE_MS}`, `eval ${key} ${30 * 60_000 + EXAM_MARKER_GRACE_MS}`]);
});

test("a failed marker write aborts the start while the gate is on, and is harmless otherwise", async () => {
  const deadline = new Date(Date.now() + 60_000);
  await assert.rejects(markCandidateExamActive("student-user-a", deadline, { env: gateOn, client: failing }), (error: Error & { status?: number; code?: string }) => error.status === 503 && error.code === "EXAM_SESSION_UNAVAILABLE");
  await assert.rejects(markCandidateExamActive("student-user-a", deadline, { env: gateOn, client: hanging, timeoutMs: 5 }), /unavailable/);
  await markCandidateExamActive("student-user-a", deadline, { env: writesOnly, client: failing });
  const { client, calls } = fakeRedis();
  await markCandidateExamActive("student-user-a", deadline, { env: redisOff, client });
  assert.deepEqual(calls, []);
});

const claims = { userId: "student-user-a", schoolId: "qa-school-a", role: "STUDENT" as const, accessVersion: 1, mfaVerified: false };
const principal = { userId: "student-user-a", schoolId: "qa-school-a", campusId: "qa-campus-a", role: "STUDENT" } as AuthUser;

test("no marker: the proxy check runs no session, account or attempt query", async () => {
  for (const schoolId of ["qa-school-a", "qa-school-b"]) {
    const result = await candidateExamBoundaryForSession("signed-cookie", { ...claims, schoolId }, {
      mayBeInExam: async (userId) => { assert.equal(userId, "student-user-a"); return false; },
      isRevoked: async () => assert.fail("no session lookup without a marker"),
      resolvePrincipal: async () => assert.fail("no account lookup without a marker"),
      lookupBoundary: async () => assert.fail("no attempt lookup without a marker"),
    });
    assert.deepEqual(result, { authenticated: true, active: null });
  }
});

test("a marker keeps the full revocation, current-authority and attempt checks", async () => {
  const active = { attemptId: "attempt-a", assignmentId: "exam-a", deadlineAt: new Date("2026-11-13T10:00:00Z") };
  const calls: string[] = [];
  const result = await candidateExamBoundaryForSession("signed-cookie", claims, {
    mayBeInExam: async () => { calls.push("marker"); return true; },
    isRevoked: async () => { calls.push("session"); return false; },
    resolvePrincipal: async () => { calls.push("principal"); return principal; },
    lookupBoundary: async () => { calls.push("boundary"); return active; },
  });
  assert.deepEqual(calls, ["marker", "session", "principal", "boundary"]);
  assert.deepEqual(result, { authenticated: true, active });
  const revoked = await candidateExamBoundaryForSession("signed-cookie", claims, { mayBeInExam: async () => true, isRevoked: async () => true, resolvePrincipal: async () => assert.fail(), lookupBoundary: async () => assert.fail() });
  assert.deepEqual(revoked, { authenticated: false });
});

test("only real public/ files skip the boundary, and only for reads", () => {
  const root = join(process.cwd(), "public");
  const walk = (dir: string): string[] => readdirSync(dir).flatMap(name => statSync(join(dir, name)).isDirectory() ? walk(join(dir, name)) : [`/${relative(root, join(dir, name)).split(sep).join("/")}`]);
  assert.deepEqual([...PUBLIC_STATIC_FILES].sort(), walk(root).sort(), "keep PUBLIC_STATIC_FILES in step with public/");
  assert.equal(isPublicStaticFileRequest("/login.svg", "GET"), true);
  assert.equal(isPublicStaticFileRequest("/fonts/NotoNaskhArabic-Bold.ttf", "HEAD"), true);
  for (const [path, method] of [["/login.svg", "POST"], ["/api/ai/insights.json", "GET"], ["/api/reports/download/report.pdf", "GET"], ["/student", "GET"], ["/fonts/other.ttf", "GET"]]) assert.equal(isPublicStaticFileRequest(path, method), false, `${method} ${path}`);
});

// SKAI-1982: a room-wide extend or resume writes every marker in one pipelined round trip, inside the transaction.
function pipelinedRedis(results?: (writes: number) => Array<[Error | null, unknown]> | null) {
  const { client, calls, expiry } = fakeRedis();
  let roundTrips = 0;
  const pipelined: ExamMarkerClient = { ...client, status: "ready", pipeline() {
    const queued: Array<[string, number]> = [];
    return {
      eval(_script, _n, key, ttl) { queued.push([String(key), Number(ttl)]); return this; },
      async exec() {
        roundTrips++;
        if (results) return results(queued.length);
        return Promise.all(queued.map(async ([key, ttl]) => [null, await client.eval("", 1, key, ttl)] as [null, unknown]));
      },
    };
  } };
  return { client: pipelined, calls, expiry, roundTrips: () => roundTrips };
}

test("500 markers cost one Redis round trip, keep the latest deadline per account, and confine every candidate", async () => {
  const now = new Date("2026-11-13T09:00:00Z");
  const redis = pipelinedRedis();
  const entries = Array.from({ length: 500 }, (_, i) => ({ userId: `student-user-${i}`, deadlineAt: new Date(now.getTime() + 30 * 60_000) }));
  entries.push({ userId: "student-user-0", deadlineAt: new Date(now.getTime() + 90 * 60_000) });
  await markCandidatesExamActive(entries, { env: gateOn, client: redis.client, now });
  assert.equal(redis.roundTrips(), 1);
  assert.equal(redis.calls.length, 500, "one write per account");
  assert.ok(redis.calls.includes(`eval ${examMarkerKey("student-user-0")} ${90 * 60_000 + EXAM_MARKER_GRACE_MS}`));
  assert.equal(await candidateMayBeInExam("student-user-499", { env: gateOn, client: redis.client }), true);
  await markCandidatesExamActive([], { env: gateOn, client: { ...redis.client, pipeline: () => assert.fail("no round trip for nothing") } });
});

test("a disconnected client fails the batch at once: logged with the gate off, aborting with the gate on", async () => {
  const deadline = new Date(Date.now() + 60_000);
  const entries = [{ userId: "student-user-a", deadlineAt: deadline }, { userId: "student-user-b", deadlineAt: deadline }];
  const offline = { ...pipelinedRedis().client, status: "reconnecting", pipeline: () => assert.fail("never queue commands while disconnected") };
  const started = Date.now();
  await markCandidatesExamActive(entries, { env: writesOnly, client: offline });
  assert.ok(Date.now() - started < 200, "gate off returns without waiting for a timeout");
  await assert.rejects(markCandidatesExamActive(entries, { env: gateOn, client: offline }), (error: Error & { code?: string }) => error.code === "EXAM_SESSION_UNAVAILABLE");
  // One failed key in the pipeline, or a pipeline that hangs, still aborts the transaction while the gate is on.
  const oneFailed = pipelinedRedis(writes => Array.from({ length: writes }, (_, i) => [i === 1 ? new Error("OOM") : null, 1] as [Error | null, unknown]));
  await assert.rejects(markCandidatesExamActive(entries, { env: gateOn, client: oneFailed.client }), /unavailable/);
  const stuck: ExamMarkerClient = { ...hanging, pipeline: () => ({ eval() { return this; }, exec: () => new Promise(() => {}) }) };
  await assert.rejects(markCandidatesExamActive(entries, { env: gateOn, client: stuck, timeoutMs: 5 }), /unavailable/);
  await markCandidatesExamActive(entries, { env: writesOnly, client: stuck, timeoutMs: 5 });
});
