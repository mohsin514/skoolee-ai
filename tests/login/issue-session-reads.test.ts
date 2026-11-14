/**
 * SKAI-1973: a password sign-in reuses the school it already loaded, writes last_login without a full-row pre-read,
 * RETURNING or automatic users audit row (login_sessions is the record), and keeps the update inside the caller's school.
 */
import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";

const calls: string[] = [];
let inAuditOptOut = false;
const updates: Array<{ where: unknown; optedOut: boolean }> = [];
const sessions: Array<{ userId: string; schoolId: string }> = [];

mock.module("@/lib/db/prisma", {
  namedExports: {
    prisma: {
      school: { findUniqueOrThrow: async ({ where }: { where: { id: string } }) => { calls.push(`school:${where.id}`); return { name: `School ${where.id}`, slug: where.id, status: "ACTIVE" }; } },
      user: {
        update: async () => { throw new Error("issueSession must not use user.update (returns every column, audited)"); },
        updateMany: async ({ where }: { where: unknown }) => { updates.push({ where, optedOut: inAuditOptOut }); return { count: 1 }; },
      },
    },
  },
});
mock.module("@/lib/db/audit-trail", {
  namedExports: {
    withoutAutoAudit: async <T>(fn: () => PromiseLike<T>) => { inAuditOptOut = true; try { return await fn(); } finally { inAuditOptOut = false; } },
  },
});
mock.module("@/lib/audit", {
  namedExports: {
    recordLoginSession: async (row: { userId: string; schoolId: string }) => { sessions.push(row); },
    hashToken: (token: string) => `hash-${token.length}`,
    logSuperAdminAction: async () => undefined,
  },
});

const user = (schoolId: string) => ({
  id: `teacher-${schoolId}`, schoolId, campusId: `campus-${schoolId}`, email: "teacher@example.invalid", fullName: "Synthetic Teacher",
  role: "TEACHER", accessVersion: 0, onboardingComplete: true, mustChangePassword: false,
});
const issue = async (schoolId: string, loaded?: { name: string; slug: string; status: string }) => {
  const { issueSession } = await import("../../src/lib/auth/issue-session");
  return issueSession(user(schoolId) as any, 1, false, new Request("http://localhost/api/auth/login"), undefined, loaded);
};

beforeEach(() => { calls.length = 0; updates.length = 0; sessions.length = 0; console.warn = () => undefined; });

test("a sign-in that passes the loaded school does not read it again, per school", async () => {
  for (const schoolId of ["school-a", "school-b"]) {
    calls.length = 0; updates.length = 0; sessions.length = 0;
    const body = await (await issue(schoolId, { name: `Loaded ${schoolId}`, slug: schoolId, status: "ACTIVE" })).json();
    assert.deepEqual(calls, [], "no second schools read");
    assert.equal(body.user.schoolName, `Loaded ${schoolId}`);
    assert.equal(body.user.schoolId, schoolId);
    assert.deepEqual(sessions.map((s) => s.schoolId), [schoolId], "the login_sessions row is still written");
    assert.deepEqual(updates, [{ where: { id: `teacher-${schoolId}`, schoolId }, optedOut: true }], "last_login stays in the caller's school, with no automatic audit row");
  }
});

test("callers that pass no school (MFA, OTP, SSO, 2FA change) still read it", async () => {
  const body = await (await issue("school-b")).json();
  assert.deepEqual(calls, ["school:school-b"]);
  assert.equal(body.user.schoolName, "School school-b");
  assert.equal(updates.length, 1);
});
