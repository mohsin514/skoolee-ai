import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthUser } from "../../src/lib/auth";
import type { TxClient } from "../../src/lib/db/prisma";
import { assertPermission, defaultFlagsForRole, loadPermissionMap, moduleFlags } from "../../src/lib/permissions";
import { ACCESS_DENIED, AccessDenied, campusScope, reportScope, studentScope } from "../../src/lib/auth/policy";
import { guardianRelationshipAuthorityWhere, guardianStudentWhere } from "../../src/lib/parent/guardian-query";
import { currentGuardianPermissions } from "../../src/lib/parent/guardian-permissions";
import { assertPermissionAdministration } from "../../src/lib/auth/permission-administration";

const user: AuthUser = { userId: "synthetic-account", schoolId: "school-a", campusId: "campus-a", role: "RECEPTIONIST", email: "synthetic@example.invalid" };
function permissionClient() {
  const state = { canEdit: true, fail: false, calls: [] as unknown[] };
  const db = { rolePermission: { findMany: async (args: unknown) => {
    state.calls.push(args);
    if (state.fail) throw new Error("synthetic database failure");
    return [{ module: "students", canView: true, canAdd: false, canEdit: state.canEdit, canDelete: false }];
  } } } as unknown as Pick<TxClient, "rolePermission">;
  return { db, state };
}

test("a navigation permission read cannot keep a revoked allow alive for the next mutation", async () => {
  const { db, state } = permissionClient();
  assert.equal((await loadPermissionMap(user.schoolId, user.role, db)).get("students")?.canEdit, true);
  await assertPermission(user, "students", "edit", db);
  state.canEdit = false;
  await assert.rejects(() => assertPermission(user, "students", "edit", db), { status: 403 });
  assert.equal(state.calls.length, 3, "each protected effect resolves current grants");
  state.canEdit = true; await assertPermission(user, "students", "edit", db);
});
test("permission lookup failure cannot fall back to a previously cached allow", async () => {
  const { db, state } = permissionClient();
  await assertPermission(user, "students", "edit", db); state.fail = true;
  await assert.rejects(() => assertPermission(user, "students", "edit", db), /synthetic database failure/);
  state.fail = false; state.canEdit = false;
  await assert.rejects(() => assertPermission(user, "students", "edit", db), { status: 403 });
});
test("delegation stays bound to its module/action and unknown roles never inherit teacher privileges", async () => {
  const { db, state } = permissionClient();
  await assertPermission(user, "students", "edit", db);
  await assert.rejects(() => assertPermission(user, "students", "delete", db), { status: 403 });
  await assert.rejects(() => assertPermission(user, "accounts", "edit", db), { status: 403 });
  for (const role of [undefined, null, "", "FUTURE_ROLE", "toString"]) assert.equal(defaultFlagsForRole(role, "students").canView, false);
  assert.equal(moduleFlags([{ module: "students", canView: true, canAdd: true, canEdit: true, canDelete: true }], "FUTURE_ROLE", "students").canEdit, false);
  assert.equal(moduleFlags([], "SUPER_ADMIN", "invented-module").canView, false);
  for (const call of state.calls) assert.deepEqual((call as { where: unknown }).where, { schoolId: user.schoolId, role: user.role });
});
test("delegated module access cannot grant permission-matrix administration", async () => {
  const db = { rolePermission: { findMany: async () => [{ module: "staff", canView: true, canAdd: true, canEdit: true, canDelete: true }] } } as unknown as Pick<TxClient, "rolePermission">;
  for (const role of ["PARENT", "STUDENT", "TEACHER", "RECEPTIONIST", "ACCOUNTANT", "LIBRARIAN", "APP_OWNER"] as const) {
    await assert.rejects(() => assertPermissionAdministration({ ...user, role }, "view", db), { message: ACCESS_DENIED });
    await assert.rejects(() => assertPermissionAdministration({ ...user, role }, "edit", db), { message: ACCESS_DENIED });
  }
  await assertPermissionAdministration({ ...user, role: "SUPER_ADMIN" }, "edit", db);
  for (const role of ["ADMIN", "CAMPUS_ADMIN", "PRINCIPAL"] as const) {
    await assertPermissionAdministration({ ...user, role }, "view", db);
    await assert.rejects(() => assertPermissionAdministration({ ...user, role, canManageMemberships: true }, "edit", db), { message: ACCESS_DENIED });
    await assertPermissionAdministration({ ...user, role, isInstitutionOwner: true }, "edit", db);
  }
  const revoked = { rolePermission: { findMany: async () => [{ module: "staff", canView: true, canAdd: false, canEdit: false, canDelete: false }] } } as unknown as Pick<TxClient, "rolePermission">;
  await assertPermissionAdministration({ ...user, role: "PRINCIPAL" }, "view", revoked);
  await assert.rejects(() => assertPermissionAdministration({ ...user, role: "PRINCIPAL", isInstitutionOwner: true }, "edit", revoked), { status: 403 });
});
test("relationship authority checks live guardian and child identity without name or legacy-parent fallback", () => {
  const at = new Date("2026-10-15T09:00:00.000Z");
  const where = guardianRelationshipAuthorityWhere("guardian-a", at, "school-a");
  assert.equal(where.schoolId, "school-a"); assert.equal(where.guardianUserId, "guardian-a");
  assert.deepEqual(where.guardian, { isActive: true, role: "PARENT", schoolId: "school-a" });
  assert.deepEqual(where.student, { schoolId: "school-a", archivedAt: null, consolidatedIntoId: null, status: { equals: "active", mode: "insensitive" }, campus: { schoolId: "school-a", archivedAt: null } });
  assert.equal(where.status, "ACTIVE"); assert.deepEqual(where.verifiedAt, { not: null });
  assert.deepEqual(where.validFrom, { lte: at }); assert.deepEqual(where.AND, [{ OR: [{ validUntil: null }, { validUntil: { gt: at } }] }]);
  assert.doesNotMatch(JSON.stringify(where), /fullName|email|phone|parentUserId|siblingGroupId/);
});
test("cross-campus siblings remain available only through each child's explicit permission", () => {
  const parent = { ...user, role: "PARENT" as const };
  const where = guardianStudentWhere(parent, "finances");
  assert.equal(where.schoolId, user.schoolId); assert.equal(where.campusId, undefined);
  const relation = (where.guardianRelationships as { some: { schoolId: string; guardianUserId: string; accessVersions: { some: { permissions: unknown } } } }).some;
  assert.equal(relation.schoolId, user.schoolId); assert.equal(relation.guardianUserId, user.userId);
  assert.deepEqual(relation.accessVersions.some.permissions, { path: ["finances"], equals: true });
  assert.equal(studentScope({ ...user, role: "STUDENT" }).studentUserId, user.userId);
  const reports = reportScope(parent);
  assert.deepEqual(reports.publishedVersionId, { not: null }); assert.deepEqual(reports.exam, { status: "PUBLISHED" });
  const reportRelation = (reports.student as ReturnType<typeof studentScope>).guardianRelationships as { some: { accessVersions: { some: { permissions: unknown } } } };
  assert.deepEqual(reportRelation.some.accessVersions.some.permissions, { path: ["learningRecords"], equals: true });
});
test("an unbound guardian predicate preserves a caller's selected recipients", () => {
  const recipientIds = { in: ["guardian-a", "guardian-b"] };
  const where = { guardianUserId: recipientIds, ...guardianRelationshipAuthorityWhere(null) };
  assert.deepEqual(where.guardianUserId, recipientIds);
  assert.deepEqual(where.guardian, { isActive: true, role: "PARENT" });
});
test("campus-limited roles retain exact institutional scope and missing campus fails neutrally", () => {
  assert.deepEqual(campusScope(user), { schoolId: user.schoolId, campusId: user.campusId });
  const logs: string[] = [], original = console.warn; console.warn = value => { logs.push(String(value)); };
  try {
    assert.throws(() => campusScope({ ...user, campusId: null }), { status: 403, message: ACCESS_DENIED });
    const error = new AccessDenied("student", "view", user);
    assert.equal(error.message, ACCESS_DENIED);
  } finally { console.warn = original; }
  assert.equal(logs.length, 2);
  for (const line of logs) {
    const record = JSON.parse(line);
    assert.equal(record.event, "authorization.denied"); assert.equal(record.policy, "2026-10-15.1");
    assert.doesNotMatch(line, /synthetic-account|school-a|synthetic@example/);
    assert.equal(record.recordId, undefined); assert.equal(record.content, undefined);
  }
});

test("overlapping effective grants fail closed while adjacent scheduled changes switch at the exact boundary", () => {
  const before = new Date("2026-10-15T08:00:00Z"), boundary = new Date("2026-10-15T09:00:00Z");
  const allow = { permissions: { learningRecords: true }, effectiveFrom: before, effectiveUntil: null };
  const denial = { permissions: { learningRecords: false }, effectiveFrom: boundary, effectiveUntil: null };
  assert.equal(currentGuardianPermissions([allow, denial], boundary), null);
  assert.equal(currentGuardianPermissions([allow, { ...allow }], boundary), null, "even duplicate allows are ambiguous");
  assert.equal(currentGuardianPermissions([], boundary), null);
  const closed = { ...allow, effectiveUntil: boundary };
  assert.equal(currentGuardianPermissions([closed, denial], new Date(boundary.getTime() - 1))?.learningRecords, true);
  assert.equal(currentGuardianPermissions([closed, denial], boundary)?.learningRecords, false);
  assert.equal(currentGuardianPermissions([{ ...denial, permissions: { learningRecords: "true" } }], boundary)?.learningRecords, false);
  const where = guardianStudentWhere({ ...user, role: "PARENT" }, "learningRecords", boundary);
  const versions = (where.guardianRelationships as { some: { accessVersions: { none: { permissions: unknown } } } }).some.accessVersions;
  assert.deepEqual(versions.none.permissions, { path: ["learningRecords"], equals: false });
});
