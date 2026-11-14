/**
 * SKAI-1973: under TENANT_RLS the last_login write keeps the guarded updateMany (it sets the tenant for the policy),
 * scoped to the user's own id and school, with no automatic audit row and no raw statement.
 */
import assert from "node:assert/strict";
import { mock, test } from "node:test";

let optedOut = false;
const updates: Array<{ where: unknown; optedOut: boolean; data: Record<string, unknown> }> = [];

mock.module("@/lib/db/prisma", {
  namedExports: {
    RLS_ENABLED: true,
    prisma: {
      user: { updateMany: async ({ where, data }: { where: unknown; data: Record<string, unknown> }) => { updates.push({ where, data, optedOut }); return { count: 1 }; } },
      $executeRaw: async () => { throw new Error("no raw last_login write under RLS"); },
    },
  },
});
mock.module("@/lib/db/audit-trail", {
  namedExports: { withoutAutoAudit: async <T>(fn: () => PromiseLike<T>) => { optedOut = true; try { return await fn(); } finally { optedOut = false; } } },
});
mock.module("@/lib/auth/principal-cache", { namedExports: { invalidationTargets: () => null, invalidateAfterWrite: async () => undefined } });
mock.module("@/lib/audit", { namedExports: { recordLoginSession: async () => undefined, hashToken: () => "hash", logSuperAdminAction: async () => undefined } });

test("RLS mode writes last_login through the guarded client, per school", async () => {
  const { issueSession } = await import("../../src/lib/auth/issue-session");
  for (const schoolId of ["school-a", "school-b"]) {
    updates.length = 0;
    const user = { id: `u-${schoolId}`, schoolId, campusId: null, email: "u@example.invalid", fullName: "Synthetic", role: "TEACHER", accessVersion: 0, onboardingComplete: true, mustChangePassword: false };
    await issueSession(user as any, 1, false, new Request("http://localhost/api/auth/login"), undefined, { name: "S", slug: schoolId, status: "ACTIVE" });
    assert.equal(updates.length, 1);
    assert.deepEqual(updates[0].where, { id: `u-${schoolId}`, schoolId });
    assert.ok(updates[0].data.lastLogin instanceof Date);
    assert.equal(updates[0].optedOut, true);
  }
});
