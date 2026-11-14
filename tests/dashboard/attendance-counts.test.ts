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
    const scope = {
      schoolId: session.schoolId,
      campusId: session.campusId,
      student: { campusId: session.campusId, campus: { schoolId: session.schoolId } },
    };
    const tallies = groupBys.filter((call) => call.args.by.includes("studentId"));
    assert.equal(tallies.length, 1, "one per-pupil tally");
    // SKAI-1963: the per-pupil tally counts this academic year only (no active cycle in this fake: the last 12 months).
    const { date: rateWindow, ...tallyScope } = tallies[0].args.where;
    assert.deepEqual(tallyScope, scope);
    assert.ok(rateWindow.gte instanceof Date, "the per-pupil tally is bounded by date");
    // SKAI-1963: the trend reads a recent window first; one marked day cannot fill it, so it re-reads unbounded.
    const trendReads = groupBys.filter((call) => call.args.by.includes("date"));
    assert.equal(trendReads.length, 2, "a windowed trend read, then the unbounded fallback");
    const { date: window, ...windowScope } = trendReads[0].args.where;
    assert.deepEqual(windowScope, scope);
    assert.ok(window.gte instanceof Date, "the first trend read is bounded by date");
    assert.deepEqual(trendReads[1].args.where, scope);
    for (const trendRead of trendReads) {
      assert.deepEqual(trendRead.args.orderBy, { date: "desc" });
      assert.ok(trendRead.args.take >= 21, "enough day×status rows for the 21 marked days the chart draws");
    }

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

const marked = (from: string, days: number) => Array.from({ length: days }, (_, i) => {
  const date = day(from);
  date.setUTCDate(date.getUTCDate() - i);
  return { date, status: "PRESENT", _count: { _all: 5 } };
});

test("SKAI-1963: a window holding the last 21 marked days is the only trend read", async () => {
  const dashboard = await loadDashboard();
  h.session = groupUser("CAMPUS_ADMIN");
  h.answers.set("attendance.groupBy", (args) => (args.by.includes("date") ? marked("2026-11-13", 30) : []));
  const before = Date.now();
  const data: any = await dashboard.getCampusDashboardData();
  const trendReads = h.calls.filter((call) => call.read === "attendance.groupBy" && call.args.by.includes("date"));
  assert.equal(trendReads.length, 1, "no unbounded re-read");
  const since: Date = trendReads[0].args.where.date.gte;
  const ageDays = (before - since.getTime()) / 86_400_000;
  assert.ok(ageDays >= 44 && ageDays <= 46, `window starts about 45 days back (was ${ageDays.toFixed(1)})`);
  assert.equal(trendReads[0].args.where.campusId, "campus-g1");
  assert.equal(trendReads[0].args.where.schoolId, "school-group");
  assert.equal(attendanceTrend(data.attendanceTrend, 21).length, 21);
});

test("SKAI-1963: after a break longer than the window the trend still shows the earlier marked days", async () => {
  const dashboard = await loadDashboard();
  h.session = user("PRINCIPAL");
  const beforeBreak = marked("2026-06-20", 25);
  h.answers.set("attendance.groupBy", (args) => {
    if (!args.by.includes("date")) return [];
    return args.where.date ? marked("2026-11-13", 2) : [...marked("2026-11-13", 2), ...beforeBreak];
  });
  const data: any = await dashboard.getPrincipalDashboardData();
  const trendReads = h.calls.filter((call) => call.read === "attendance.groupBy" && call.args.by.includes("date"));
  assert.equal(trendReads.length, 2, "windowed read, then the unbounded read");
  assert.equal("date" in trendReads[1].args.where, false);
  const trend = attendanceTrend(data.attendanceTrend, 21);
  assert.equal(trend.length, 21, "the two recent days plus 19 days from before the break");
  assert.equal(trend[trend.length - 1].key, attendanceTrend([{ date: day("2026-11-13"), status: "PRESENT", count: 1 }], 1)[0].key);
});

for (const [label, loader, session] of consoles) {
  test(`SKAI-1963: ${label} per-pupil rate counts marks from its own campus's active cycle start`, async () => {
    const dashboard = await loadDashboard();
    h.session = session;
    h.answers.set("academicCycle.findFirst", (args) =>
      args.where.schoolId === session.schoolId && args.where.campusId === session.campusId && args.where.status === "ACTIVE"
        ? { startDate: day("2026-08-01") }
        : null);
    await (dashboard as any)[loader]();
    const cycleRead = h.calls.find((call) => call.read === "academicCycle.findFirst" && call.args?.select?.startDate);
    assert.deepEqual(cycleRead?.args.where, { schoolId: session.schoolId, campusId: session.campusId, status: "ACTIVE" });
    const tally = h.calls.find((call) => call.read === "attendance.groupBy" && call.args.by.includes("studentId"))!;
    assert.deepEqual(tally.args.where, {
      schoolId: session.schoolId,
      campusId: session.campusId,
      student: { campusId: session.campusId, campus: { schoolId: session.schoolId } },
      date: { gte: day("2026-08-01") },
    });
  });
}

test("SKAI-1963: with no dated active cycle the per-pupil rate falls back to the last 12 months, never all history", async () => {
  const dashboard = await loadDashboard();
  h.session = user("PRINCIPAL");
  h.answers.set("academicCycle.findFirst", () => ({ startDate: null }));
  const before = Date.now();
  await dashboard.getPrincipalDashboardData();
  const tally = h.calls.find((call) => call.read === "attendance.groupBy" && call.args.by.includes("studentId"))!;
  const ageDays = (before - tally.args.where.date.gte.getTime()) / 86_400_000;
  assert.ok(ageDays >= 364 && ageDays <= 367, `window starts about a year back (was ${ageDays.toFixed(1)})`);
});
