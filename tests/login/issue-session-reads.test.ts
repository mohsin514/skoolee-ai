/**
 * SKAI-1973: a password sign-in reuses the school it already loaded, writes last_login as one statement scoped to the
 * user's own id and school (no full-row pre-read, no RETURNING, no automatic users audit row, and no updateMany, whose
 * BEGIN/COMMIT costs two more round trips), and still bumps the principal cache for that user.
 */
import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";

const calls: string[] = [];
const raw: Array<{ sql: string; values: unknown[] }> = [];
const sessions: Array<{ userId: string; schoolId: string }> = [];
const bumps: unknown[] = [];

mock.module("@/lib/db/prisma", {
  namedExports: {
    RLS_ENABLED: false,
    prisma: {
      school: { findUniqueOrThrow: async ({ where }: { where: { id: string } }) => { calls.push(`school:${where.id}`); return { name: `School ${where.id}`, slug: where.id, status: "ACTIVE" }; } },
      user: {
        update: async () => { throw new Error("issueSession must not use user.update (returns every column, audited)"); },
        updateMany: async () => { throw new Error("issueSession must not use user.updateMany outside RLS mode (BEGIN/COMMIT)"); },
      },
      $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => { raw.push({ sql: strings.join("?").replace(/\s+/g, " "), values }); return 1; },
    },
  },
});
mock.module("@/lib/db/audit-trail", { namedExports: { withoutAutoAudit: async <T>(fn: () => PromiseLike<T>) => await fn() } });
mock.module("@/lib/auth/principal-cache", {
  namedExports: {
    invalidationTargets: (model: string, operation: string, args: { where: { id: string } }) => ({ model, operation, users: [args.where.id] }),
    invalidateAfterWrite: async (targets: unknown) => { bumps.push(targets); },
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

beforeEach(() => { calls.length = 0; raw.length = 0; sessions.length = 0; bumps.length = 0; console.warn = () => undefined; });

test("a sign-in that passes the loaded school does not read it again, per school", async () => {
  for (const schoolId of ["school-a", "school-b"]) {
    calls.length = 0; raw.length = 0; sessions.length = 0; bumps.length = 0;
    const before = Date.now();
    const body = await (await issue(schoolId, { name: `Loaded ${schoolId}`, slug: schoolId, status: "ACTIVE" })).json();
    assert.deepEqual(calls, [], "no second schools read");
    assert.equal(body.user.schoolName, `Loaded ${schoolId}`);
    assert.equal(body.user.schoolId, schoolId);
    assert.deepEqual(sessions.map((s) => s.schoolId), [schoolId], "the login_sessions row is still written");
    assert.equal(raw.length, 1, "last_login is one statement");
    assert.equal(raw[0].sql, 'UPDATE "users" SET "last_login" = ?::timestamp(3) WHERE "id" = ? AND "school_id" = ?');
    const [at, id, scope] = raw[0].values as [string, string, string];
    assert.deepEqual([id, scope], [`teacher-${schoolId}`, schoolId], "pinned to the user's own id and school");
    assert.match(at, /Z$/, "UTC, as Prisma stores DateTime");
    assert.ok(Date.parse(at) >= before && Date.parse(at) <= Date.now());
    assert.deepEqual(bumps, [{ model: "User", operation: "updateMany", users: [`teacher-${schoolId}`] }], "principal cache bumped as before");
  }
});

test("callers that pass no school (OTP, SSO, 2FA change) still read it", async () => {
  const body = await (await issue("school-b")).json();
  assert.deepEqual(calls, ["school:school-b"]);
  assert.equal(body.user.schoolName, "School school-b");
  assert.equal(raw.length, 1);
});
