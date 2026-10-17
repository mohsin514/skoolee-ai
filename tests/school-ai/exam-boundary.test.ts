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
