import { h, groupUser, loadDashboard, user } from "./harness";
import { test } from "node:test";
import assert from "node:assert/strict";
import { attendanceTrend, classPerformance, groupByClass, studentAttendanceRate } from "../../src/components/insights/metrics";

/**
 * SKAI-1813: the admin and principal consoles ship attendance as counts (a per-day trend and a per-pupil tally), not
 * every mark every pupil has ever had, and the principal payload carries at most the latest report card per pupil.
 */

const consoles = [
  ["admin", "getCampusDashboardData", user("ADMIN", { isInstitutionOwner: true })],
  ["campus admin (group school)", "getCampusDashboardData", groupUser("CAMPUS_ADMIN")],
  ["principal", "getPrincipalDashboardData", user("PRINCIPAL")],
  ["principal (group school)", "getPrincipalDashboardData", groupUser("PRINCIPAL")],
] as const;

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

for (const [label, loader, session] of consoles) {
  test(`SKAI-1813: ${label} console reads attendance as counts scoped to its own school and campus`, async () => {
    const dashboard = await loadDashboard();
    h.session = session;
    h.answers.set("student.findMany", () => [{ id: "s1", fullName: "Pupil One" }, { id: "s2", fullName: "Pupil Two" }]);
    h.answers.set("attendance.groupBy", (args) => args.by.includes("studentId")
      ? [
          { studentId: "s1", status: "PRESENT", _count: { _all: 3 } },
          { studentId: "s1", status: "ABSENT", _count: { _all: 1 } },
        ]
      : [
          { date: day("2026-11-10"), status: "PRESENT", _count: { _all: 2 } },
          { date: day("2026-11-10"), status: "ABSENT", _count: { _all: 1 } },
        ]);

    const data: any = await (dashboard as any)[loader]();
    assert.deepEqual(data.degraded, []);

    const studentRead = h.calls.find((call) => call.read === "student.findMany" && call.args?.select?.fullName);
    assert.ok(studentRead, "the student roster was read");
    assert.equal("attendance" in studentRead.args.select, false, "no per-row attendance history on the roster");
    assert.equal(studentRead.args.select.reportCards.take, 1, "latest report card only");

    const groupBys = h.calls.filter((call) => call.read === "attendance.groupBy");
    assert.equal(groupBys.length, 2, "one trend read and one per-pupil tally");
    for (const call of groupBys) {
      assert.deepEqual(call.args.where, {
        schoolId: session.schoolId,
        campusId: session.campusId,
        student: { campusId: session.campusId, campus: { schoolId: session.schoolId } },
      });
    }
    const trendRead = groupBys.find((call) => call.args.by.includes("date"))!;
    assert.deepEqual(trendRead.args.orderBy, { date: "desc" });
    assert.ok(trendRead.args.take >= 21, "enough day×status rows for the 21 marked days the chart draws");

    assert.deepEqual(data.attendanceTrend, [
      { date: day("2026-11-10"), status: "PRESENT", count: 2 },
      { date: day("2026-11-10"), status: "ABSENT", count: 1 },
    ]);
    assert.deepEqual(data.students.map((s: any) => s.attendanceMarks), [{ present: 3, total: 4 }, { present: 0, total: 0 }]);
    assert.equal(studentAttendanceRate(data.students[0]), 75);
    assert.equal(studentAttendanceRate(data.students[1]), null, "never marked reads as no data, not 0%");
  });
}

test("SKAI-1813: principal class rosters carry the latest report card only", async () => {
  const dashboard = await loadDashboard();
  h.session = user("PRINCIPAL");
  await dashboard.getPrincipalDashboardData();
  const classRead = h.calls.find((call) => call.read === "class.findMany" && call.args?.include?.students);
  assert.equal(classRead?.args.include.students.select.reportCards.take, 1);
});

test("SKAI-1813: a failing attendance tally degrades only its widgets", async () => {
  const dashboard = await loadDashboard();
  h.session = user("PRINCIPAL");
  h.failing = new Set(["attendance.groupBy"]);
  const data: any = await dashboard.getPrincipalDashboardData();
  assert.deepEqual([...data.degraded].sort(), ["attendanceByStudent", "attendanceTrend"]);
  assert.deepEqual(data.attendanceTrend, []);
});

for (const [loader, role] of [["getCampusDashboardData", "TEACHER"], ["getPrincipalDashboardData", "CAMPUS_ADMIN"]] as const) {
  test(`SKAI-1813: ${role} is denied ${loader} before any attendance is read`, async () => {
    const dashboard = await loadDashboard();
    h.session = user(role);
    await assert.rejects(() => (dashboard as any)[loader]());
    assert.equal(h.calls.some((call) => call.read === "attendance.groupBy"), false);
  });
}

test("SKAI-1813: the trend folds day×status counts into the last marked days", () => {
  const rows = [
    ...Array.from({ length: 25 }, (_, i) => ({ date: day(`2026-10-${String(i + 1).padStart(2, "0")}`), status: "PRESENT", count: 4 })),
    { date: day("2026-10-25"), status: "ABSENT", count: 1 },
    { date: day("2026-10-25"), status: "LEAVE", count: 1 },
    { date: day("2026-10-25"), status: "LATE", count: 2 },
  ];
  const trend = attendanceTrend(rows, 21);
  assert.equal(trend.length, 21);
  assert.equal(trend[0].key, attendanceTrend([rows[4]], 1)[0].key, "oldest kept day is the 5th of 25");
  const last = trend[trend.length - 1];
  assert.deepEqual([last.present, last.absent, last.leave, last.rate], [4, 1, 1, 67]);
  assert.deepEqual(attendanceTrend([], 21), []);
});

test("SKAI-1813: class attendance averages the per-pupil tallies", () => {
  const students = [
    { class: { id: "c1" }, attendanceMarks: { present: 9, total: 10 }, reportCards: [{ percentage: 80 }] },
    { class: { id: "c1" }, attendanceMarks: { present: 5, total: 10 }, reportCards: [{ percentage: 60 }] },
    { class: { id: "c1" }, attendanceMarks: { present: 0, total: 0 } },
  ];
  const [row] = classPerformance([{ id: "c1", name: "7", students: [] }], groupByClass(students));
  assert.equal(row.attendance, 70);
  assert.equal(row.average, 70);
});
