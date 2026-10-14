import assert from "node:assert/strict";
import test from "node:test";
import { EMPTY_GUARDIAN_PERMISSIONS, hasGuardianPermission, parseGuardianPermissions } from "../../src/lib/parent/guardian-permissions";
import { guardianStudentWhere, liveGuardianRelationshipWhere } from "../../src/lib/parent/guardian-query";

test("missing and malformed guardian grants deny every capability", () => {
  for (const value of [null, undefined, "learningRecords", [], { learningRecords: 1, consents: { fieldTrips: "true" } }]) {
    const parsed = parseGuardianPermissions(value);
    assert.deepEqual(parsed, EMPTY_GUARDIAN_PERMISSIONS);
    assert.equal(hasGuardianPermission(value, "learningRecords"), false);
    assert.equal(hasGuardianPermission(value, "fieldTrips"), false);
  }
});

test("consent grants stay separate from learning, finance, and other consents", () => {
  const grant = parseGuardianPermissions({
    learningRecords: true,
    finances: false,
    consents: { fieldTrips: true, medicalTreatment: false },
  });

  assert.equal(hasGuardianPermission(grant, "learningRecords"), true);
  assert.equal(hasGuardianPermission(grant, "finances"), false);
  assert.equal(hasGuardianPermission(grant, "fieldTrips"), true);
  assert.equal(hasGuardianPermission(grant, "medicalTreatment"), false);
  assert.equal(hasGuardianPermission(grant, "offsiteTravel"), false);
});

test("unknown fields are discarded and denied defaults are not shared mutable state", () => {
  const first = parseGuardianPermissions({ communication: true, admin: true });
  first.communication = false;
  const second = parseGuardianPermissions({ communication: true, admin: true });
  assert.equal(second.communication, true);
  assert.equal("admin" in second, false);
});

test("parent student scopes bind one verified account, tenant, current grant, and requested capability", () => {
  const at = new Date("2026-10-08T12:00:00.000Z");
  const query = guardianStudentWhere({ role: "PARENT", userId: "guardian-a", schoolId: "school-a" } as never, "finances", at);
  assert.equal(query.schoolId, "school-a");
  const relation = (query.guardianRelationships as { some: Record<string, unknown> }).some;
  assert.equal(relation.guardianUserId, "guardian-a");
  assert.equal(relation.status, "ACTIVE");
  assert.deepEqual(relation.verifiedAt, { not: null });
  const versions = relation.accessVersions as { some: Record<string, unknown> };
  assert.deepEqual(versions.some.effectiveFrom, { lte: at });
  assert.deepEqual(versions.some.permissions, { path: ["finances"], equals: true });
  assert.equal("phone" in relation, false);
});

test("revoked and expired guardian links fail the live communication predicate", () => {
  const at = new Date("2026-10-08T12:00:00.000Z");
  const query = liveGuardianRelationshipWhere("guardian-a", "communication", at);
  assert.equal(query.guardianUserId, "guardian-a");
  assert.equal(query.status, "ACTIVE");
  assert.deepEqual(query.validFrom, { lte: at });
  assert.deepEqual(query.accessVersions, {
    some: {
      effectiveFrom: { lte: at },
      AND: [{ OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: at } }] }],
      permissions: { path: ["communication"], equals: true },
    },
  });
});
