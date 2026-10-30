import { test } from "node:test";
import assert from "node:assert/strict";
import { SCHOOLS, rolesFor } from "../../scripts/qa/pilot-seed-plan";
import { institutionKindOf, isInstitutionAuthority, isStandaloneOwner, isGroupConsole } from "../../src/lib/auth/institution";

// SKAI-1066: what /api/auth/session derives for each seeded account.
function sessionFor(kind: "GROUP" | "STANDALONE", key: string) {
  const def = rolesFor(kind).find((r) => r.key === key)!;
  const institutionKind = institutionKindOf({ registrationKind: kind });
  const user = { role: def.role, institutionKind, isInstitutionOwner: def.owner === true };
  return { kind: institutionKind, isAuthority: isInstitutionAuthority(user), standaloneOwner: isStandaloneOwner(user), isOwner: user.isInstitutionOwner, groupConsole: isGroupConsole(user), def };
}

test("seed has two GROUP schools and one STANDALONE school", () => {
  assert.deepEqual(SCHOOLS.map((s) => [s.slug, s.kind]), [["qa-alpha", "GROUP"], ["qa-beta", "GROUP"], ["qa-solo", "STANDALONE"]]);
  assert.equal(new Set(SCHOOLS.flatMap((s) => s.campuses.map((c) => c.regId))).size, 5);
});

test("standalone admin resolves as owner/authority (SKAI-1066)", () => {
  const s = sessionFor("STANDALONE", "admin");
  assert.equal(s.def.role, "ADMIN");
  assert.equal(s.def.scoped, true, "pinned to the school campus like an onboarded owner");
  assert.deepEqual([s.kind, s.isAuthority, s.standaloneOwner, s.isOwner], ["STANDALONE", true, true, true]);
});

test("standalone staff hold no authority", () => {
  for (const key of ["principal", "teacher", "accountant", "guardian", "student", "noaccess"]) {
    const s = sessionFor("STANDALONE", key);
    assert.equal(s.isAuthority, false, key);
    assert.equal(s.isOwner, false, key);
  }
  assert.equal(rolesFor("STANDALONE").some((r) => r.role === "SUPER_ADMIN" || r.role === "CAMPUS_ADMIN"), false);
});

test("group boundaries unchanged", () => {
  assert.deepEqual(rolesFor("GROUP").map((r) => [r.key, r.role, r.scoped, r.owner === true]), [
    ["owner", "SUPER_ADMIN", false, false],
    ["admin", "CAMPUS_ADMIN", true, false],
    ["principal", "PRINCIPAL", true, false],
    ["teacher", "TEACHER", true, false],
    ["accountant", "ACCOUNTANT", true, false],
    ["guardian", "PARENT", true, false],
    ["student", "STUDENT", true, false],
    ["noaccess", "RECEPTIONIST", false, false],
  ]);
  assert.equal(sessionFor("GROUP", "owner").groupConsole, true);
  const admin = sessionFor("GROUP", "admin");
  assert.deepEqual([admin.kind, admin.isAuthority, admin.standaloneOwner], ["GROUP", false, false]);
});
