import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { campusScope } from "../../src/lib/auth/policy";
import type { AuthUser } from "../../src/lib/auth";

// SKAI-763: campus finance staff must not read or write another campus's student fees by id.
for (const route of ["src/app/api/fees/resolve/route.ts", "src/app/api/fees/carry-forwards/route.ts"]) {
  test(`${route} scopes the student lookup to the caller's campus`, () => {
    const src = readFileSync(route, "utf8");
    const lookup = src.slice(src.indexOf("prisma.student.findFirst"), src.indexOf("prisma.student.findFirst") + 200);
    assert.match(lookup, /\.\.\.campusScope\(user\)/);
    assert.doesNotMatch(lookup, /campus: \{ schoolId: user\.schoolId \}/);
  });
}

test("campusScope pins campus staff to their campus and keeps group owners school-wide", () => {
  const base = { userId: "u", schoolId: "school-a", email: "", fullName: "" } as unknown as AuthUser;
  assert.deepEqual(campusScope({ ...base, role: "ACCOUNTANT", campusId: "campus-1" } as AuthUser), { schoolId: "school-a", campusId: "campus-1" });
  assert.deepEqual(campusScope({ ...base, role: "SUPER_ADMIN", campusId: null } as unknown as AuthUser), { schoolId: "school-a" });
  assert.throws(() => campusScope({ ...base, role: "ACCOUNTANT", campusId: null } as unknown as AuthUser));
});
