import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthUser } from "../../src/lib/auth";
import { campusScope, studentScope } from "../../src/lib/auth/policy";
import { decodeActiveCampus, encodeActiveCampus, resolveActiveCampusId, type CampusLookup } from "../../src/lib/auth/active-campus";

// Two synthetic schools, two campuses each. The lookup mirrors lookupSchoolCampus: id AND schoolId must match.
const CAMPUSES = [
  { id: "campus-a1", schoolId: "school-a" }, { id: "campus-a2", schoolId: "school-a" },
  { id: "campus-b1", schoolId: "school-b" }, { id: "campus-b2", schoolId: "school-b" },
];
const lookup: CampusLookup = async (schoolId, campusId) => CAMPUSES.find(c => c.id === campusId && c.schoolId === schoolId) ?? null;
const superAdmin: AuthUser = { userId: "sa-a", schoolId: "school-a", campusId: null, role: "SUPER_ADMIN", email: "sa@example.invalid" };

test("All campuses (no cookie) keeps the SUPER_ADMIN school-wide scope", async () => {
  assert.equal(await resolveActiveCampusId(superAdmin, undefined, lookup), null);
  assert.deepEqual(campusScope(superAdmin), { schoolId: "school-a" });
  assert.deepEqual(studentScope(superAdmin), { schoolId: "school-a" });
});

test("a chosen campus of the user's school narrows campusScope to it", async () => {
  const activeCampusId = await resolveActiveCampusId(superAdmin, encodeActiveCampus("sa-a", "campus-a2"), lookup);
  assert.equal(activeCampusId, "campus-a2");
  const narrowed = { ...superAdmin, activeCampusId };
  assert.deepEqual(campusScope(narrowed), { schoolId: "school-a", campusId: "campus-a2" });
  assert.deepEqual(studentScope(narrowed), { schoolId: "school-a", campusId: "campus-a2" });
});

test("another school's campus is ignored, so the cookie cannot reach another tenant", async () => {
  assert.equal(await resolveActiveCampusId(superAdmin, encodeActiveCampus("sa-a", "campus-b1"), lookup), null);
  assert.equal(await resolveActiveCampusId(superAdmin, encodeActiveCampus("sa-a", "missing"), lookup), null);
});

test("a cookie written for another account is ignored", async () => {
  assert.equal(await resolveActiveCampusId(superAdmin, encodeActiveCampus("someone-else", "campus-a1"), lookup), null);
  assert.equal(decodeActiveCampus("campus-a1", "sa-a"), null);
  assert.equal(decodeActiveCampus("sa-a:bad id;", "sa-a"), null);
});

test("other roles never pick up an active campus and keep their own scope", async () => {
  for (const role of ["ADMIN", "CAMPUS_ADMIN", "PRINCIPAL", "TEACHER", "PARENT", "APP_OWNER"] as const) {
    const user: AuthUser = { userId: "sa-a", schoolId: "school-a", campusId: "campus-a1", role, email: "x@example.invalid" };
    assert.equal(await resolveActiveCampusId(user, encodeActiveCampus("sa-a", "campus-a2"), lookup), null, role);
  }
  const campusAdmin: AuthUser = { userId: "ca", schoolId: "school-a", campusId: "campus-a1", role: "CAMPUS_ADMIN", email: "c@example.invalid", activeCampusId: "campus-a2" };
  assert.deepEqual(campusScope(campusAdmin), { schoolId: "school-a", campusId: "campus-a1" }, "a stray activeCampusId cannot widen or move a campus role");
});
