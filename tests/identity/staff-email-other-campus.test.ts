import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-2118: a staff row whose email belongs to another campus must preview as CONFLICT, and a failed apply never exposes raw ORM text.
let unscoped = false;
const fakePrisma = {
  identityConnection: { findFirst: async () => ({ id: "conn", schoolId: "s", roleMap: { "s2-teachers": "TEACHER" }, fieldOwnership: {} }) },
  campus: { findFirst: async () => ({ id: "main" }) },
  rosterBatch: { findUnique: async () => null, create: async () => ({ id: "b1" }), update: async () => ({}) },
  rosterExternalId: { findUnique: async () => null },
  // The campus guard hides the North pupil from the Main admin: scoped lookups return null.
  user: { findFirst: async () => (unscoped ? { id: "north-staff" } : null) },
  class: { findFirst: async () => ({ id: "cls" }) },
};
mock.module("@/lib/db/prisma", { namedExports: { prisma: fakePrisma } });
mock.module("@/lib/db/tenant-context", { namedExports: { runUnscoped: async (_l: string, fn: () => unknown) => { unscoped = true; try { return await fn(); } finally { unscoped = false; } }, runWithTenantContext: async (_c: unknown, fn: () => unknown) => fn() } });
mock.module("@/lib/api/scope", { namedExports: { ApiError: class ApiError extends Error { constructor(m: string, public status = 400) { super(m); } } } });
mock.module("@/lib/auth/institution", { namedExports: { authorityRoleFor: () => "PRINCIPAL", isCampusOperator: () => true, isInstitutionAuthority: () => false, kindFor: () => "GROUP" } });
mock.module("@/lib/auth/mfa-crypto", { namedExports: { protectSecret: (s: string) => s, revealSecret: (s: string) => s } });
mock.module("@/lib/students/enrollment", { namedExports: { applyEnrollment: async () => ({}), applyWithdrawal: async () => ({}), dateOnly: (v: unknown) => v } });
mock.module("@/lib/identity/oidc", { namedExports: { discover: async () => ({}), exchange: async () => ({}), pkce: () => ({}), readStateCookie: () => null, stateCookie: () => "", verifyIdToken: async () => ({}) } });

test("campus admin staff row reusing another campus's email previews as CONFLICT", async () => {
  const updates: unknown[] = [];
  (fakePrisma.rosterBatch as { update: unknown }).update = async (a: unknown) => { updates.push(a); return {}; };
  const { submitBatch } = await import("@/lib/identity/service");
  await submitBatch({ userId: "u", role: "CAMPUS_ADMIN", schoolId: "s", campusId: "main", kind: "GROUP" } as never, { connectionId: "conn", campusId: "main", externalBatchId: "B", rows: [{ kind: "staff", externalId: "X3", fullName: "Dup mail", email: "North1@Example.test", group: "s2-teachers" }] } as never);
  const preview = (updates[0] as { data: { preview: { action: string; note: string }[] } }).data.preview;
  assert.equal(preview[0].action, "CONFLICT");
  assert.match(preview[0].note, /already exists/);
});

test("rowFailureMessage hides Prisma internals", async () => {
  const { Prisma } = await import("@prisma/client");
  const { rowFailureMessage } = await import("@/lib/identity/service");
  const unique = new Prisma.PrismaClientKnownRequestError("Invalid prisma.user.create() invocation: Unique constraint failed on the fields: (school_id, email)", { code: "P2002", clientVersion: "x" });
  assert.match(rowFailureMessage(unique), /already exists/);
  assert.doesNotMatch(rowFailureMessage(unique), /prisma|constraint/i);
  const other = new Prisma.PrismaClientKnownRequestError("Invalid prisma.user.create() invocation: boom", { code: "P2003", clientVersion: "x" });
  assert.doesNotMatch(rowFailureMessage(other), /prisma/i);
  assert.equal(rowFailureMessage(new Error("Placement refused.")), "Placement refused.");
});
