import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-2116: a source id mapped to a pupil at another campus must preview as ERROR, never ADD.
let unscoped = false;
const fakePrisma = {
  identityConnection: { findFirst: async () => ({ id: "conn", schoolId: "s", roleMap: {}, fieldOwnership: {} }) },
  campus: { findFirst: async () => ({ id: "main" }) },
  rosterBatch: { findUnique: async () => null, create: async () => ({ id: "b1" }), update: async () => ({}) },
  rosterExternalId: { findUnique: async () => ({ localId: "north-pupil", synced: {} }) },
  // The campus guard hides the North pupil from the Main admin: scoped lookups return null.
  student: { findFirst: async () => (unscoped ? { id: "north-pupil" } : null) },
  class: { findFirst: async () => ({ id: "cls" }) },
};
mock.module("@/lib/db/prisma", { namedExports: { prisma: fakePrisma } });
mock.module("@/lib/db/tenant-context", { namedExports: { runUnscoped: async (_l: string, fn: () => unknown) => { unscoped = true; try { return await fn(); } finally { unscoped = false; } }, runWithTenantContext: async (_c: unknown, fn: () => unknown) => fn() } });
mock.module("@/lib/api/scope", { namedExports: { ApiError: class ApiError extends Error { constructor(m: string, public status = 400) { super(m); } } } });
mock.module("@/lib/auth/institution", { namedExports: { authorityRoleFor: () => "PRINCIPAL", isCampusOperator: () => true, isInstitutionAuthority: () => false, kindFor: () => "GROUP" } });
mock.module("@/lib/auth/mfa-crypto", { namedExports: { protectSecret: (s: string) => s, revealSecret: (s: string) => s } });
mock.module("@/lib/students/enrollment", { namedExports: { applyEnrollment: async () => ({}), applyWithdrawal: async () => ({}), dateOnly: (v: unknown) => v } });
mock.module("@/lib/identity/oidc", { namedExports: { discover: async () => ({}), exchange: async () => ({}), pkce: () => ({}), readStateCookie: () => null, stateCookie: () => "", verifyIdToken: async () => ({}) } });

test("campus admin row reusing an id mapped to another campus's pupil previews as ERROR", async () => {
  const updates: unknown[] = [];
  (fakePrisma.rosterBatch as { update: unknown }).update = async (a: unknown) => { updates.push(a); return {}; };
  const { submitBatch } = await import("@/lib/identity/service");
  await submitBatch({ userId: "u", role: "CAMPUS_ADMIN", schoolId: "s", campusId: "main", kind: "GROUP" } as never, { connectionId: "conn", campusId: "main", externalBatchId: "B", rows: [{ kind: "student", externalId: "X1", fullName: "Dup", className: "G9", section: "A" }] } as never);
  const preview = (updates[0] as { data: { preview: { action: string; note: string }[] } }).data.preview;
  assert.equal(preview[0].action, "ERROR");
  assert.match(preview[0].note, /another campus/);
});
