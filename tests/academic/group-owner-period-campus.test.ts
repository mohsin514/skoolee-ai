import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mock, test } from "node:test";

// SKAI-1764: Year Setup sends the selected campus only on the URL (?campusId=), but period POST read it only
// from the JSON body. A group owner (SUPER_ADMIN, no account campus) therefore got 400 "campusId required".
const campuses = [{ id: "campus-a1", schoolId: "school-a" }, { id: "campus-a2", schoolId: "school-a" }, { id: "campus-b1", schoolId: "school-b" }];
mock.module("@/lib/db/prisma", { namedExports: { prisma: { campus: { findFirst: async ({ where }: { where: { id: string; schoolId: string } }) => campuses.find(c => c.id === where.id && c.schoolId === where.schoolId) ?? null } } } });
mock.module("@/lib/auth", { namedExports: { getAuthUser: async () => null } });
mock.module("@/lib/auth/session-revocation", { namedExports: { isCurrentSessionRevoked: async () => false } });
mock.module("@/lib/db/tenant-context", { namedExports: { enterUnscoped: () => {}, runUnscoped: async (fn: () => unknown) => fn() } });
mock.module("@/lib/roles", { namedExports: { isCampusAdminRole: (r: string) => r === "CAMPUS_ADMIN" } });
mock.module("@/lib/billing/entitlements", { namedExports: { assertSchoolOperational: async () => {}, BillingAccessError: class extends Error {} } });
mock.module("@/lib/auth/institution", { namedExports: { authorityRoleFor: () => null, canOwnSubscription: () => false, isCampusOperator: (u: { role: string }) => u.role === "CAMPUS_ADMIN", isInstitutionAuthority: () => false, kindFor: () => null } });
mock.module("@/lib/auth/seats", { namedExports: { getCampusSeats: async () => ({}) } });
mock.module("@/lib/permissions", { namedExports: { assertPermission: async () => {}, moduleFlags: {} } });
mock.module("next/headers", { namedExports: { cookies: async () => ({ get: () => undefined }) } });

const owner = { role: "SUPER_ADMIN", schoolId: "school-a", campusId: null, userId: "u1" };
const req = (q = "") => new Request(`http://x/api/academic/periods${q}`, { method: "POST" });
const resolve = async (user: object, r: Request, body: Record<string, unknown>) => {
  const { requestedCampusId, resolveCampusId } = await import("../../src/lib/api/scope");
  return resolveCampusId(user as never, requestedCampusId(r, body));
};
const status = (p: Promise<unknown>) => p.then(() => 200, (e: { status?: number }) => e.status ?? 500);

test("bug case: a group owner with no account campus targets the campus selected on the URL", async () => {
  assert.equal(await resolve(owner, req("?campusId=campus-a2"), { periodNumber: 1 }), "campus-a2");
});

test("normal path: a body campusId still wins and a matching URL value is fine", async () => {
  assert.equal(await resolve(owner, req(), { campusId: "campus-a1" }), "campus-a1");
  assert.equal(await resolve(owner, req("?campusId=campus-a1"), { campusId: "campus-a1" }), "campus-a1");
  assert.equal(await status(resolve(owner, req("?campusId=campus-a1"), { campusId: "campus-a2" })), 400);
  assert.equal(await status(resolve(owner, req(), {})), 400);
});

test("two schools stay isolated: a group owner cannot target another school's campus", async () => {
  assert.equal(await status(resolve(owner, req("?campusId=campus-b1"), {})), 403);
  assert.equal(await resolve({ ...owner, schoolId: "school-b" }, req("?campusId=campus-b1"), {}), "campus-b1");
});

test("denied: a campus-bound admin cannot reach a second campus through the URL", async () => {
  const admin = { role: "CAMPUS_ADMIN", schoolId: "school-a", campusId: "campus-a1", userId: "u2" };
  assert.equal(await resolve(admin, req(), {}), "campus-a1");
  assert.equal(await status(resolve(admin, req("?campusId=campus-a2"), {})), 403);
});

test("period POST resolves the campus from body or URL", () => {
  const src = readFileSync("src/app/api/academic/periods/route.ts", "utf8");
  assert.equal(src.match(/resolveCampusId\(user, requestedCampusId\(req, body\)\)/gu)?.length, 1);
});
