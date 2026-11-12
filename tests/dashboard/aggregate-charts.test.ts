import { h, GROUP_SCHOOL, SCHOOL, groupUser, loadDashboard, user } from "./harness";
import { test } from "node:test";
import assert from "node:assert/strict";
import { campusRows, enrolmentTrend, gradeDistribution, networkEnrolments, networkGrades } from "../../src/components/insights/metrics";

/**
 * SKAI-1856: the librarian and group consoles chart counts the database computed, instead of loading every loan of
 * the last six months and every pupil (with a report card each). Scope stays one school (and the librarian's campus),
 * and the charts read the same as when they were counted in the browser.
 */

const campusRow = (id: string) => ({
  id, name: id, city: "", users: [], staffInvitations: [],
  _count: { users: 0, classes: 0, students: 0, subjects: 0, exams: 0, reportCards: 0, invoices: 0, parentCommunications: 0 },
});
const reads = (name: string) => h.calls.filter((call) => call.read === name);

test("SKAI-1856: the group console loads no pupils, only per-campus counts scoped to its school", async () => {
  const dashboard = await loadDashboard();
  h.session = groupUser("SUPER_ADMIN");
  h.answers.set("campus.findMany", () => [campusRow("campus-g1"), campusRow("campus-g2")]);
  h.answers.set("student.groupBy", () => [
    { campusId: "campus-g1", enrollmentDate: new Date(2026, 3, 2), _count: { _all: 3 } },
    { campusId: "campus-g2", enrollmentDate: new Date(2026, 4, 9), _count: { _all: 2 } },
  ]);
  h.answers.set("$queryRaw", () => [
    { campusId: "campus-g1", grade: "A", count: 2, scored: 2, scoreSum: 170 },
    { campusId: "campus-g1", grade: null, count: 1, scored: 1, scoreSum: 0 },
    { campusId: "campus-g2", grade: "b ", count: 1, scored: 0, scoreSum: 0 },
  ]);
  const data = await dashboard.getSuperAdminDashboardData();

  const [campuses] = reads("campus.findMany");
  assert.equal(campuses.args.include.students, undefined, "no roster rides along with the campuses");
  const [groupBy] = reads("student.groupBy");
  assert.equal(groupBy.args.where.schoolId, GROUP_SCHOOL);
  assert.deepEqual(groupBy.args.where.campus, { archivedAt: null });
  const [raw] = reads("$queryRaw");
  assert.ok(raw.args.values.includes(GROUP_SCHOOL) && !raw.args.values.includes(SCHOOL), "the raw read names the caller's school");
  assert.match(raw.args.sql, /rc\.school_id = \?/);

  const [g1, g2] = data.campuses as any[];
  assert.equal(g1.students, undefined);
  assert.deepEqual(g1.enrolments, [{ enrollmentDate: new Date(2026, 3, 2), count: 3 }]);
  assert.equal(g1.averageScore, 57, "mean of 85, 85 and 0");
  assert.equal(g2.averageScore, null, "no scored card");
  assert.deepEqual(gradeDistribution(networkGrades(data.campuses)).map(({ grade, count }) => [grade, count]), [["A", 2], ["B", 1]]);
});

for (const role of ["PRINCIPAL", "CAMPUS_ADMIN", "TEACHER"]) {
  test(`SKAI-1856: ${role} is denied the group console before any count runs`, async () => {
    const dashboard = await loadDashboard();
    h.session = groupUser(role);
    await assert.rejects(() => dashboard.getSuperAdminDashboardData(), /Permission Denied/);
    assert.equal(reads("$queryRaw").length + reads("student.groupBy").length, 0);
  });
}

test("SKAI-1856: the librarian console counts loans per month in SQL scoped to its school and campus", async () => {
  const dashboard = await loadDashboard();
  h.session = user("LIBRARIAN", { campusId: "campus-1" });
  h.answers.set("$queryRaw", () => [
    { kind: "issue", bucket: 6, count: 4 },
    { kind: "issue", bucket: 1, count: 1 },
    { kind: "issue", bucket: 7, count: 9 },
    { kind: "return", bucket: 6, count: 2 },
  ]);
  h.answers.set("bookIssue.aggregate", () => ({ _sum: { fine: 350 } }));
  h.answers.set("book.aggregate", () => ({ _count: 0, _sum: { copiesTotal: null, copiesAvailable: null } }));
  const data = await dashboard.getOperationsStaffDashboardData();
  const summary = data.summary as any;

  assert.equal(reads("bookIssue.findMany").length, 0, "no loan rows are loaded");
  const [raw] = reads("$queryRaw");
  assert.ok(raw.args.values.includes(SCHOOL) && raw.args.values.includes("campus-1"));
  assert.match(raw.args.sql, /bi\.school_id = \? AND b\.school_id = \? AND b\.campus_id = \?/);
  const [fines] = reads("bookIssue.aggregate");
  assert.deepEqual(fines.args.where, { schoolId: SCHOOL, returnedAt: null, book: { campusId: "campus-1" } });

  assert.equal(summary.finesOutstanding, 350);
  assert.equal(summary.issuesByMonth.length, 6);
  assert.deepEqual(summary.issuesByMonth.map((m: any) => m.count), [1, 0, 0, 0, 0, 4], "after-window bucket dropped");
  assert.deepEqual(summary.returnsByMonth.map((m: any) => m.count), [0, 0, 0, 0, 0, 2]);
  const now = new Date();
  assert.equal(summary.issuesByMonth[5].month, `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
});

test("SKAI-1856: counted rows chart exactly like the per-pupil lists they replace", () => {
  const jan = new Date(2025, 0, 5), mar = new Date(2025, 2, 1);
  assert.deepEqual(enrolmentTrend(networkEnrolments([{ enrolments: [{ enrollmentDate: mar, count: 1 }, { enrollmentDate: jan, count: 2 }] }]), 12), enrolmentTrend([{ enrollmentDate: jan }, { enrollmentDate: mar }, { enrollmentDate: jan }], 12));
  assert.deepEqual(gradeDistribution([{ grade: "a ", count: 2 }, { grade: null, count: 4 }, { grade: "B", count: 1 }]), gradeDistribution(["A", "a", "", "B"].map((grade) => ({ grade }))));
  const listed = campusRows([{ id: "n", name: "N", currency: "PKR", students: [{ reportCards: [{ percentage: 0 }] }, { reportCards: [{ percentage: 80 }] }] }])[0];
  assert.equal(campusRows([{ id: "n", name: "N", currency: "PKR", averageScore: 40 }])[0].average, listed.average);
});
