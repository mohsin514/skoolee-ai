import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { resolveGuardianName, verifiedGuardianLinkInclude } from "../../src/lib/students/guardian-display";

// SKAI-1246: the profile shows the linked guardian, not "N/A". Synthetic QA-01 data only.
const SCHOOL_A = "qa-01-school-a";
const SCHOOL_B = "qa-01-school-b";

test("a verified linked guardian is shown even when the legacy field is empty", () => {
  const name = resolveGuardianName({ schoolId: SCHOOL_A, guardianName: null }, [
    { schoolId: SCHOOL_A, fullName: "QA Guardian Link", guardian: { fullName: "QA Parent Account", schoolId: SCHOOL_A } },
  ]);
  assert.equal(name, "QA Parent Account");
  assert.equal(
    resolveGuardianName({ schoolId: SCHOOL_A, guardianName: "" }, [{ schoolId: SCHOOL_A, fullName: "QA Guardian Link", guardian: null }]),
    "QA Guardian Link",
  );
});

test("the legacy field is the fallback when there is no verified link", () => {
  assert.equal(resolveGuardianName({ schoolId: SCHOOL_A, guardianName: "QA Legacy Guardian" }, []), "QA Legacy Guardian");
  assert.equal(resolveGuardianName({ schoolId: SCHOOL_A, guardianName: "QA Legacy Guardian" }, undefined), "QA Legacy Guardian");
  assert.equal(resolveGuardianName({ schoolId: SCHOOL_A, guardianName: null }, []), null);
});

test("a guardian from another school is never shown", () => {
  assert.equal(
    resolveGuardianName({ schoolId: SCHOOL_A, guardianName: "QA Legacy Guardian" }, [
      { schoolId: SCHOOL_B, fullName: "QA Other School Link", guardian: { fullName: "QA Other Parent", schoolId: SCHOOL_B } },
    ]),
    "QA Legacy Guardian",
  );
  // A same-school link whose account belongs to another school shows the link name, never the foreign account.
  assert.equal(
    resolveGuardianName({ schoolId: SCHOOL_A, guardianName: null }, [
      { schoolId: SCHOOL_A, fullName: "QA Guardian Link", guardian: { fullName: "QA Other Parent", schoolId: SCHOOL_B } },
    ]),
    "QA Guardian Link",
  );
});

test("two schools are isolated: the link query is scoped to the caller's school and verified links only", () => {
  const a = verifiedGuardianLinkInclude(SCHOOL_A);
  const b = verifiedGuardianLinkInclude(SCHOOL_B);
  assert.equal(a.where.schoolId, SCHOOL_A);
  assert.equal(b.where.schoolId, SCHOOL_B);
  assert.equal(a.where.status, "ACTIVE");
  assert.deepEqual(a.where.verifiedAt, { not: null });
});

test("the profile read resolves guardianName from the scoped verified link", () => {
  const route = readFileSync(new URL("../../src/app/api/students/[id]/route.ts", import.meta.url), "utf8");
  assert.match(route, /guardianRelationships: verifiedGuardianLinkInclude\(user\.schoolId\)/);
  assert.match(route, /guardianName: resolveGuardianName\(student, guardianRelationships\)/);
  assert.match(route, /scopedCampusWhere\(user, user\.campusId\)/);
});
