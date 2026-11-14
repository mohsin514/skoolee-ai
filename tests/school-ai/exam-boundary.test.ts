import assert from "node:assert/strict";
import { test } from "node:test";
import { allowedDuringCandidateExam, canonicalExamPath } from "../../src/lib/school-ai/exam-boundary";
import { integrityEventSchema, integrityReviewSchema } from "../../src/lib/school-ai/exam-integrity";
import { ProctorPolicySchema } from "../../src/lib/school-ai/exam-proctor";
import { candidateExamBoundaryForSession } from "../../src/lib/school-ai/exam-boundary-service";
import { hashSessionToken } from "../../src/lib/auth/session-cookie";
import type { AuthUser } from "../../src/lib/auth";

test("active exam admits only its exact delivery endpoints and safe methods", () => {
  const id = "exam-a", base = `/api/school-ai/exams/${id}`;
  for (const [path, method] of [[`/ai/exams/${id}`, "GET"], [base, "GET"], [`${base}/attempt`, "PATCH"], [`${base}/attempt`, "POST"], [`${base}/proctor`, "PATCH"], [`${base}/proctor/sessions/s1/clips`, "POST"], [`${base}/integrity`, "POST"], [`${base}/clarifications`, "GET"], [`${base}/clarifications`, "POST"], ["/api/auth/session", "GET"], ["/api/auth/logout", "POST"]]) assert.equal(allowedDuringCandidateExam(path, method, id), true, `${method} ${path}`);
  for (const [path, method] of [["/student", "GET"], ["/api/ai/insights", "POST"], ["/api/chat/threads", "GET"], [`${base}/results`, "GET"], [`${base}/integrity`, "GET"], [`${base}/integrity`, "PATCH"], [`${base}/proctor/policy`, "PATCH"], ["/api/school-ai/exams/exam-b/attempt", "POST"], [`${base}/attempt`, "DELETE"], [`${base}/remedies`, "POST"], [`${base}/clarifications`, "PATCH"], ["/api/auth/session", "POST"]]) assert.equal(allowedDuringCandidateExam(path, method, id), false, `${method} ${path}`);
});
test("encoded paths, prefix tricks, dotted APIs and malformed encodings cannot escape the boundary", () => {
  assert.equal(canonicalExamPath("/api/school-ai/exams/exam-a/../exam-b/attempt"), "/api/school-ai/exams/exam-b/attempt");
  for (const path of ["/api/ai/insights.json", "/ai/exams/exam-a-evil", "/api/school-ai/exams/exam-a/%2e%2e/exam-b/attempt", "/api/school-ai/exams/exam-a/attempt%3fother=1", "/api/school-ai/exams/exam-a/%25252e%25252e/exam-b/attempt", "/api/%zz", "/_next/server/private"]) assert.equal(allowedDuringCandidateExam(path, "GET", "exam-a"), false, path);
  assert.equal(allowedDuringCandidateExam("/_next/static/chunks/app.js", "GET", "exam-a"), true);
});
test("observation payload refuses arbitrary browsing data and automatic misconduct decisions", () => {
  const valid = { attemptId: "attempt", clientEventId: "01234567-89ab-4cde-8fab-0123456789ab", kind: "PAGE_HIDDEN", observedAt: "2026-10-15T09:00:00.000Z", details: {} };
  assert.equal(integrityEventSchema.safeParse(valid).success, true);
  for (const details of [{ url: "https://private.invalid" }, { reason: "cheating" }, { rawVideo: "data" }]) assert.equal(integrityEventSchema.safeParse({ ...valid, details }).success, false);
  assert.equal(integrityReviewSchema.safeParse({ eventId: "event", version: 1, decision: "CHEATING", reason: "automatic decision" }).success, false);
  assert.equal(ProctorPolicySchema.safeParse({ requireCamera: true, enabled: false, camera: true }).success, false);
  assert.equal(ProctorPolicySchema.parse({ enabled: true, camera: true }).requireCamera, false);
});

const claims = { userId: "learner", schoolId: "school", role: "STUDENT" as const, accessVersion: 7, mfaVerified: true };
const principal: AuthUser = { ...claims, email: "synthetic@example.invalid", campusId: "current-campus" };
const active = { attemptId: "attempt", assignmentId: "exam", deadlineAt: new Date("2026-10-15T12:00:00.000Z") };

test("a revoked or absent server session cannot read or reveal an active exam", async () => {
  const result = await candidateExamBoundaryForSession("signed-cookie", claims, {
    isRevoked: async (hash) => { assert.equal(hash, hashSessionToken("signed-cookie")); return true; },
    resolvePrincipal: async () => { assert.fail("revoked sessions cannot resolve an account"); },
    lookupBoundary: async () => { assert.fail("revoked sessions cannot query attempts"); },
  });
  assert.deepEqual(result, { authenticated: false });
});

test("stale account authority cannot read or reveal an active exam", async () => {
  for (const current of [null, { ...principal, role: "TEACHER" as const }]) {
    const result = await candidateExamBoundaryForSession("signed-cookie", claims, {
      isRevoked: async () => false,
      resolvePrincipal: async (received) => { assert.deepEqual(received, claims); return current; },
      lookupBoundary: async () => { assert.fail("invalid current authority cannot query attempts"); },
    });
    assert.deepEqual(result, { authenticated: false });
  }
});

test("a live session uses current account scope and current attempt state", async () => {
  for (const boundary of [active, null]) {
    const calls: string[] = [];
    const result = await candidateExamBoundaryForSession("signed-cookie", claims, {
      isRevoked: async () => { calls.push("session"); return false; },
      resolvePrincipal: async (received) => { calls.push("principal"); assert.deepEqual(received, claims); return principal; },
      lookupBoundary: async (actor) => { calls.push("boundary"); assert.equal(actor, principal); return boundary; },
    });
    assert.deepEqual(calls, ["session", "principal", "boundary"]);
    assert.deepEqual(result, { authenticated: true, active: boundary });
  }
});

test("authority lookup failures stop before any attempt metadata is returned", async () => {
  await assert.rejects(candidateExamBoundaryForSession("signed-cookie", claims, {
    isRevoked: async () => false,
    resolvePrincipal: async () => { throw new Error("authority lookup unavailable"); },
    lookupBoundary: async () => { assert.fail("failed authority lookup cannot query attempts"); },
  }), /authority lookup unavailable/);
});

test("SKAI-1063: an unavailable session store is a retryable error, never a learner sign-out", async () => {
  await assert.rejects(candidateExamBoundaryForSession("signed-cookie", claims, {
    isRevoked: async () => { throw new Error("session store unavailable"); },
    resolvePrincipal: async () => { assert.fail("unknown session state cannot resolve an account"); },
    lookupBoundary: async () => { assert.fail("unknown session state cannot query attempts"); },
  }), /unavailable/);
});

// SKAI-1971: production reads session, account and attempt in one statement; the decisions on the rows are unchanged.
const account = { id: "learner", schoolId: "school", campusId: "current-campus", role: "STUDENT" as const, email: "synthetic@example.invalid", fullName: "Synthetic learner", onboardingComplete: true,
  mfaEnabled: false, isInstitutionOwner: false, canPurchaseSubscription: false, canManageMemberships: false, accessVersion: 7, campusSchoolId: "school", slug: "school", status: "ACTIVE",
  registrationKind: null, institutionType: null, subscriptionLifecycleState: "ACTIVE", graceEndsAt: null };
const live = { sessions: [{ isActive: true }], account, attempt: active };
const noLegacy = {
  isRevoked: async () => assert.fail("the one-read path makes no separate session read"),
  resolvePrincipal: async () => assert.fail("the one-read path makes no separate account read"),
  lookupBoundary: async () => assert.fail("the one-read path makes no separate attempt read"),
};

test("SKAI-1971: one read returns the active attempt only after session and account authority pass", async () => {
  let reads = 0;
  const result = await candidateExamBoundaryForSession("signed-cookie", claims, { ...noLegacy, readAll: async (hash, received) => { reads += 1; assert.equal(hash, hashSessionToken("signed-cookie")); assert.deepEqual(received, claims); return live; } });
  assert.equal(reads, 1);
  assert.deepEqual(result, { authenticated: true, active });
  assert.deepEqual(await candidateExamBoundaryForSession("signed-cookie", claims, { ...noLegacy, readAll: async () => ({ ...live, attempt: null }) }), { authenticated: true, active: null });
});

test("SKAI-1971: a revoked session or stale authority never reveals the attempt read in the same statement", async () => {
  const denied = [
    { ...live, sessions: [] },
    { ...live, sessions: [{ isActive: false }] },
    { ...live, account: null },
    { ...live, account: { ...account, role: "TEACHER" as const } },
    { ...live, account: { ...account, accessVersion: 8 } },
    { ...live, account: { ...account, status: "DELETED" } },
    { ...live, account: { ...account, campusSchoolId: "other-school" } },
    { ...live, account: { ...account, mfaEnabled: true } }, // an enrolled factor is challenged; claims.mfaVerified must be true
  ];
  for (const row of denied.slice(0, -1)) assert.deepEqual(await candidateExamBoundaryForSession("signed-cookie", claims, { ...noLegacy, readAll: async () => row }), { authenticated: false });
  const unverified = { ...claims, mfaVerified: false };
  assert.deepEqual(await candidateExamBoundaryForSession("signed-cookie", unverified, { ...noLegacy, readAll: async () => denied.at(-1)! }), { authenticated: false });
});

test("SKAI-1971: one retry for a dropped connection, none when the database is saturated; failures stay retryable", async () => {
  let reads = 0;
  const flaky = async () => { reads += 1; if (reads === 1) throw new Error("Connection terminated unexpectedly"); return live; };
  assert.deepEqual(await candidateExamBoundaryForSession("signed-cookie", claims, { ...noLegacy, readAll: flaky }), { authenticated: true, active });
  assert.equal(reads, 2);
  reads = 0;
  await assert.rejects(candidateExamBoundaryForSession("signed-cookie", claims, { ...noLegacy, readAll: async () => { reads += 1; throw Object.assign(new Error("Timed out fetching a new connection from the connection pool"), { code: "P2024" }); } }), /connection pool/);
  assert.equal(reads, 1);
});

test("SKAI-1971: an absent Redis marker still skips the read entirely when the gate says so", async () => {
  assert.deepEqual(await candidateExamBoundaryForSession("signed-cookie", claims, { ...noLegacy, readAll: async () => assert.fail("no read without a marker"), mayBeInExam: async () => false }), { authenticated: true, active: null });
});
