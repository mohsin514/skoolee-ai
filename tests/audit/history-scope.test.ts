import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthUser } from "../../src/lib/auth";
import { auditHistoryGroupWide, auditHistoryScope } from "../../src/lib/audit-history";

// G12 (role-ux §7.3): the activity log belongs to the institution authority (school-wide) and to campus
// operators (own campus). The principal loses it. Kind comes from the resolved principal; a hand-built user
// without a kind or the owner flag is not an authority (fail closed, §1.1).
const school = "school-1", campusA = "campus-a", campusB = "campus-b";
const user = (over: Partial<AuthUser>): AuthUser => ({ userId: "u", email: "u@example.invalid", role: "TEACHER", schoolId: school, campusId: campusA, accessVersion: 0, ...over } as AuthUser);

test("the group admin reads the whole school and may narrow to one campus", () => {
  const sa = user({ role: "SUPER_ADMIN", campusId: null, institutionKind: "GROUP" });
  assert.equal(auditHistoryGroupWide(sa), true);
  assert.deepEqual(auditHistoryScope(sa), { schoolId: school });
  assert.deepEqual(auditHistoryScope(sa, campusB), { schoolId: school, campusId: campusB });
});

test("a campus-pinned group admin is still school-wide (legacy rows before the G22a repair)", () => {
  const sa = user({ role: "SUPER_ADMIN", campusId: campusA, institutionKind: "GROUP" });
  assert.deepEqual(auditHistoryScope(sa, campusB), { schoolId: school, campusId: campusB });
});

test("the standalone school admin reads school-level rows and their own campus, never another campus", () => {
  const so = user({ role: "ADMIN", campusId: campusA, institutionKind: "STANDALONE", isInstitutionOwner: true });
  assert.equal(auditHistoryGroupWide(so), false);
  assert.deepEqual(auditHistoryScope(so), { schoolId: school, OR: [{ campusId: campusA }, { campusId: null }] });
  assert.deepEqual(auditHistoryScope(so, campusA), { schoolId: school, campusId: campusA });
  assert.throws(() => auditHistoryScope(so, campusB), { status: 403 });
});

test("campus operators read their own campus only", () => {
  for (const op of [user({ role: "CAMPUS_ADMIN", institutionKind: "GROUP" }), user({ role: "ADMIN", institutionKind: "GROUP" }), user({ role: "CAMPUS_ADMIN", institutionKind: "STANDALONE" })]) {
    assert.deepEqual(auditHistoryScope(op), { schoolId: school, campusId: campusA });
    assert.throws(() => auditHistoryScope(op, campusB), { status: 403 });
  }
  assert.throws(() => auditHistoryScope(user({ role: "CAMPUS_ADMIN", campusId: null, institutionKind: "GROUP" })), { status: 403 });
});

test("the principal, teachers, office staff and families have no activity log", () => {
  for (const role of ["PRINCIPAL", "TEACHER", "ACCOUNTANT", "RECEPTIONIST", "LIBRARIAN", "PARENT", "STUDENT"] as const) {
    assert.throws(() => auditHistoryScope(user({ role, institutionKind: "GROUP" })), { status: 403 }, role);
  }
});

test("authority fails closed without a kind: a role-only super admin is refused, an owner-flagged one is not", () => {
  assert.throws(() => auditHistoryScope(user({ role: "SUPER_ADMIN", campusId: null })), { status: 403 });
  assert.deepEqual(auditHistoryScope(user({ role: "SUPER_ADMIN", campusId: null, isInstitutionOwner: true })), { schoolId: school });
  // A super admin inside a standalone school (C1 anomaly) is not an authority and not a campus operator.
  assert.throws(() => auditHistoryScope(user({ role: "SUPER_ADMIN", campusId: null, institutionKind: "STANDALONE" })), { status: 403 });
});
