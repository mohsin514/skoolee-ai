import assert from "node:assert/strict";
import { test } from "node:test";
import {
  authorityRoleFor,
  canOwnSubscription,
  institutionKindOf,
  isCampusOperator,
  isGroupConsole,
  isInstitutionAuthority,
  isStandaloneOwner,
  kindFor,
} from "../../src/lib/auth/institution";
import { roleLabelFor, USER_ROLES, type UserRole } from "../../src/lib/roles";

// role-ux §1.1 / §7.1 G1: one helper decides GROUP vs STANDALONE and who holds institution authority.

test("institutionKindOf: registrationKind, then setup type, then owner role; never campus counts; fails toward GROUP", () => {
  assert.equal(institutionKindOf({ registrationKind: "STANDALONE", setupType: "GROUP", ownerRole: "SUPER_ADMIN" }), "STANDALONE");
  assert.equal(institutionKindOf({ registrationKind: "GROUP", setupType: "STANDALONE", ownerRole: "ADMIN" }), "GROUP");
  // UNVERIFIED school: the setup type decides…
  assert.equal(institutionKindOf({ registrationKind: "UNVERIFIED", setupType: "STANDALONE" }), "STANDALONE");
  assert.equal(institutionKindOf({ registrationKind: "UNVERIFIED", setupType: "GROUP", ownerRole: "ADMIN" }), "GROUP");
  // …then the owner's role…
  assert.equal(institutionKindOf({ registrationKind: "UNVERIFIED", setupType: null, ownerRole: "ADMIN" }), "STANDALONE");
  assert.equal(institutionKindOf({ registrationKind: "UNVERIFIED", setupType: null, ownerRole: "SUPER_ADMIN" }), "GROUP");
  // …and with nothing known it fails toward GROUP (a group admin is the stricter reading for campus admins).
  assert.equal(institutionKindOf({ registrationKind: "UNVERIFIED" }), "GROUP");
  assert.equal(institutionKindOf({}), "GROUP");
});

test("authority by kind × role: the group admin in a group, the school admin in a single school", () => {
  const cases: Array<[UserRole, "GROUP" | "STANDALONE", boolean]> = [
    ["SUPER_ADMIN", "GROUP", true],
    ["SUPER_ADMIN", "STANDALONE", false], // anomaly (C1): fail closed, listed by the G22a report
    ["ADMIN", "STANDALONE", true],
    ["ADMIN", "GROUP", false], // an ADMIN inside a group is a campus operator, nothing more
    ["CAMPUS_ADMIN", "GROUP", false],
    ["CAMPUS_ADMIN", "STANDALONE", false], // a standalone deputy is not the authority
    ["PRINCIPAL", "GROUP", false],
    ["PRINCIPAL", "STANDALONE", false],
  ];
  for (const [role, institutionKind, expected] of cases) {
    assert.equal(isInstitutionAuthority({ role, institutionKind }), expected, `${role} in ${institutionKind}`);
  }
  for (const role of USER_ROLES) {
    if (role === "SUPER_ADMIN" || role === "ADMIN") continue;
    for (const institutionKind of ["GROUP", "STANDALONE"] as const) {
      assert.equal(isInstitutionAuthority({ role, institutionKind, isInstitutionOwner: true, canPurchaseSubscription: true }), false, `${role} with flags in ${institutionKind}`);
    }
  }
});

test("a one-campus GROUP is still a group: its campus admin never becomes the authority", () => {
  // Campus counts are never an input; the kind is all that matters.
  assert.equal(isInstitutionAuthority({ role: "CAMPUS_ADMIN", institutionKind: "GROUP" }), false);
  assert.equal(isInstitutionAuthority({ role: "ADMIN", institutionKind: "GROUP", isInstitutionOwner: true }), false);
  assert.equal(isGroupConsole({ role: "SUPER_ADMIN", institutionKind: "GROUP" }), true);
});

test("a flagless group admin is still the authority (owner-provisioned or setup delegate)", () => {
  const flagless = { role: "SUPER_ADMIN" as const, institutionKind: "GROUP" as const, isInstitutionOwner: false, canPurchaseSubscription: false };
  assert.equal(isInstitutionAuthority(flagless), true);
  assert.equal(isGroupConsole(flagless), true);
  assert.equal(canOwnSubscription(flagless), false, "authority does not imply the payer");
});

test("undefined kind fails closed: a role-only user object is never an authority (C32, R-I6, K-B5)", () => {
  for (const role of ["ADMIN", "SUPER_ADMIN", "CAMPUS_ADMIN"] as const) {
    assert.equal(kindFor({ role }), null, `${role} without kind`);
    assert.equal(isInstitutionAuthority({ role }), false);
    assert.equal(canOwnSubscription({ role, canPurchaseSubscription: true }), false);
    assert.equal(isGroupConsole({ role }), false);
    assert.equal(isStandaloneOwner({ role }), false);
  }
  // The owner flag alone resolves the kind for the two owner roles (hand-built worker users carry it).
  assert.equal(kindFor({ role: "SUPER_ADMIN", isInstitutionOwner: true }), "GROUP");
  assert.equal(kindFor({ role: "ADMIN", isInstitutionOwner: true }), "STANDALONE");
  assert.equal(kindFor({ role: "CAMPUS_ADMIN", isInstitutionOwner: true }), null);
  assert.equal(isInstitutionAuthority({ role: "ADMIN", isInstitutionOwner: true }), true);
});

test("console predicates and the authority role per kind", () => {
  assert.equal(isStandaloneOwner({ role: "ADMIN", institutionKind: "STANDALONE" }), true);
  assert.equal(isStandaloneOwner({ role: "ADMIN", institutionKind: "GROUP" }), false);
  assert.equal(isGroupConsole({ role: "SUPER_ADMIN", institutionKind: "STANDALONE" }), false);
  assert.equal(isCampusOperator({ role: "ADMIN" }), true);
  assert.equal(isCampusOperator({ role: "CAMPUS_ADMIN" }), true);
  assert.equal(isCampusOperator({ role: "PRINCIPAL" }), false);
  assert.equal(isCampusOperator({ role: "SUPER_ADMIN" }), false);
  assert.equal(authorityRoleFor("GROUP"), "SUPER_ADMIN");
  assert.equal(authorityRoleFor("STANDALONE"), "ADMIN");
});

test("canOwnSubscription = authority AND (owner OR authority-role purchase delegate)", () => {
  assert.equal(canOwnSubscription({ role: "SUPER_ADMIN", institutionKind: "GROUP", isInstitutionOwner: true }), true);
  assert.equal(canOwnSubscription({ role: "SUPER_ADMIN", institutionKind: "GROUP", canPurchaseSubscription: true }), true);
  assert.equal(canOwnSubscription({ role: "ADMIN", institutionKind: "STANDALONE", isInstitutionOwner: true }), true);
  assert.equal(canOwnSubscription({ role: "ADMIN", institutionKind: "GROUP", isInstitutionOwner: true }), false);
  assert.equal(canOwnSubscription({ role: "PRINCIPAL", institutionKind: "GROUP", canPurchaseSubscription: true }), false);
  assert.equal(canOwnSubscription({ role: "CAMPUS_ADMIN", institutionKind: "STANDALONE", canPurchaseSubscription: true }), false);
});

test("mode-aware role labels (§1.5)", () => {
  assert.equal(roleLabelFor({ role: "SUPER_ADMIN", institutionKind: "GROUP" }), "Group admin");
  assert.equal(roleLabelFor({ role: "ADMIN", institutionKind: "STANDALONE" }), "School admin");
  assert.equal(roleLabelFor({ role: "ADMIN", institutionKind: "GROUP" }), "Campus admin");
  assert.equal(roleLabelFor({ role: "ADMIN" }), "Campus admin");
  assert.equal(roleLabelFor({ role: "CAMPUS_ADMIN", institutionKind: "STANDALONE" }), "Campus admin");
  assert.equal(roleLabelFor({ role: "APP_OWNER" }), "Platform operator");
  assert.equal(roleLabelFor({ role: "TEACHER" }), "Teacher");
  assert.equal(roleLabelFor({ role: "ADMIN", institutionKind: "STANDALONE" }, "ar"), "مدير المدرسة");
  assert.equal(roleLabelFor({ role: "SUPER_ADMIN" }, "ur"), "ادارے کا منتظم");
});

test("every P1 translation is the one the app shows: no P1 row is overridden by another package's wording (§8.2)", async () => {
  const { arabicP1Ui, urduP1Ui } = await import("../../src/lib/locale/role-ux/p1-messages");
  const { arabicRoleUxUi, urduRoleUxUi } = await import("../../src/lib/locale/role-ux/index");
  const drift: string[] = [];
  for (const key of Object.keys(arabicP1Ui)) {
    if (arabicRoleUxUi[key] !== arabicP1Ui[key]) drift.push(`ar: ${key} → ${arabicRoleUxUi[key]}`);
    if (urduRoleUxUi[key] !== urduP1Ui[key]) drift.push(`ur: ${key} → ${urduRoleUxUi[key]}`);
  }
  assert.deepEqual(drift, [], "align the wording with the other package or drop the P1 duplicate");
  // One Urdu term for corrections across the queue, the sorting rule and the navigation (تصحیح, not درستی).
  assert.doesNotMatch(Object.values(urduP1Ui).join("\n"), /درستی|درستیاں/);
});
