import { h, groupUser, loadDashboard, user } from "./harness";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rosterStatusWhere } from "@/lib/students/roster-status";

/**
 * SKAI-1926: archived pupils stayed on the admin and principal rosters and in every class count, so one campus
 * showed 41 on roll on the home KPI and 45 on the roster, Classes, Attendance and the year-end summary.
 */
const ON_ROLL = rosterStatusWhere(false);
const studentListReads = () => h.calls.filter((call) => call.read === "student.findMany").map((call) => call.args.where);
const classStudentCounts = () => h.calls
  .filter((call) => call.read === "class.findMany")
  .map((call) => call.args.include?._count?.select?.students);

const consoles = [
  ["admin", user("ADMIN", { isInstitutionOwner: true }), "getCampusDashboardData"],
  ["group campus admin", groupUser("CAMPUS_ADMIN"), "getCampusDashboardData"],
  ["standalone principal", user("PRINCIPAL"), "getPrincipalDashboardData"],
  ["group principal", groupUser("PRINCIPAL"), "getPrincipalDashboardData"],
] as const;

for (const [label, session, load] of consoles) {
  test(`SKAI-1926: the ${label} roster lists on-roll pupils only, inside its own school and campus`, async () => {
    const dashboard = await loadDashboard();
    h.session = session;
    const data = await dashboard[load]();
    assert.deepEqual(data.degraded, []);
    const reads = studentListReads();
    assert.equal(reads.length, 1, "one roster read");
    assert.deepEqual(reads[0], { campusId: session.campusId, campus: { schoolId: session.schoolId }, ...ON_ROLL });
  });

  test(`SKAI-1926: the ${label} class counts leave archived pupils out`, async () => {
    const dashboard = await loadDashboard();
    h.session = session;
    await dashboard[load]();
    const counts = classStudentCounts();
    assert.ok(counts.length >= 1, "the classes widget counts its pupils");
    for (const count of counts) assert.deepEqual(count, { where: ON_ROLL });
  });
}

test("SKAI-1926: archived pupils are not on roll, active ones are", () => {
  const notIn = (ON_ROLL as { status: { notIn: string[] } }).status.notIn;
  assert.ok(notIn.includes("archived"));
  assert.ok(!notIn.includes("active"));
});

test("SKAI-1926: the year list and both platform-owner school views count on-roll pupils only", () => {
  for (const path of ["src/app/api/academic-year/route.ts", "src/app/api/owner/schools/route.ts", "src/app/api/owner/schools/[id]/route.ts"]) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /_count: \{ select: \{ students: \{ where: rosterStatusWhere\(false\) \}/, path);
    assert.doesNotMatch(source, /_count: \{ select: \{ students: true/, path);
  }
});
