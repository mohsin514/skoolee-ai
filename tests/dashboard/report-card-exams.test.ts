import { h, groupUser, loadDashboard, user } from "./harness";
import { test } from "node:test";
import assert from "node:assert/strict";
import { reportCardExamsInView } from "../../src/lib/academic/report-card-exams";

/**
 * SKAI-1821: the admin Report cards view mounted one pipeline (one /api/reports request) for every released exam of
 * every year. It now lists the active year's exams by default, keeps the linked `?exam=` one, and hides earlier
 * years behind a toggle.
 */
const exam = (id: string, academicYear: number, status = "PUBLISHED", isLocked = false) => ({ id, academicYear, status, isLocked });
const recent = [
  exam("y26-mid", 2026),
  exam("y26-draft", 2026, "SCHEDULED"),
  exam("y26-locked", 2026, "MARKS_ENTRY", true),
  exam("y27-early", 2027, "LOCKED"),
  exam("y25-final", 2025, "PRINCIPAL_REVIEWED"),
  exam("y24-final", 2024),
];
const ids = (list: { id: string }[]) => list.map((item) => item.id);

test("SKAI-1821: lists only released exams from the active year (or later) by default", () => {
  const view = reportCardExamsInView(recent, { activeYear: 2026, focusExam: null, showEarlier: false });
  assert.deepEqual(ids(view.exams), ["y26-mid", "y26-locked", "y27-early"]);
  assert.equal(view.earlierCount, 2);
});

test("SKAI-1821: 'Show earlier years' lists every released exam in the original order", () => {
  const view = reportCardExamsInView(recent, { activeYear: 2026, focusExam: null, showEarlier: true });
  assert.deepEqual(ids(view.exams), ["y26-mid", "y26-locked", "y27-early", "y25-final", "y24-final"]);
  assert.equal(view.earlierCount, 2);
});

test("SKAI-1821: a linked ?exam= from an earlier year stays listed, first", () => {
  const view = reportCardExamsInView(recent, { activeYear: 2026, focusExam: "y24-final", showEarlier: false });
  assert.deepEqual(ids(view.exams), ["y24-final", "y26-mid", "y26-locked", "y27-early"]);
  assert.equal(view.earlierCount, 1);
});

test("SKAI-1821: an unreleased linked exam is still not listed", () => {
  const view = reportCardExamsInView(recent, { activeYear: 2026, focusExam: "y26-draft", showEarlier: false });
  assert.deepEqual(ids(view.exams), ["y26-mid", "y26-locked", "y27-early"]);
});

test("SKAI-1821: without a known active year nothing is hidden (previous behaviour)", () => {
  for (const activeYear of [null, undefined]) {
    const view = reportCardExamsInView(recent, { activeYear, focusExam: null, showEarlier: false });
    assert.deepEqual(ids(view.exams), ["y26-mid", "y26-locked", "y27-early", "y25-final", "y24-final"]);
    assert.equal(view.earlierCount, 0);
  }
  assert.deepEqual(reportCardExamsInView(undefined, { activeYear: 2026, focusExam: null, showEarlier: false }), { exams: [], earlierCount: 0 });
});

for (const [label, session] of [["standalone school", () => user("ADMIN", { isInstitutionOwner: true })], ["group school campus", () => groupUser("CAMPUS_ADMIN")]] as const) {
  test(`SKAI-1821: the ${label} admin console carries the active academic year and keeps recentExams campus-scoped`, async () => {
    const dashboard = await loadDashboard();
    h.session = session();
    const data = await dashboard.getCampusDashboardData();
    assert.equal(data.activeAcademicYear, 2026);
    const read = h.calls.find((call) => call.read === "exam.findMany");
    assert.ok(read, "recentExams is read");
    assert.deepEqual(read.args.where, { campusId: h.session.campusId, campus: { schoolId: h.session.schoolId } });
    assert.equal(read.args.select.academicYear, true);
  });
}

test("SKAI-1821: the admin console stays denied to a teacher", async () => {
  const dashboard = await loadDashboard();
  h.session = user("TEACHER");
  await assert.rejects(() => dashboard.getCampusDashboardData(), /Permission Denied/);
});

/**
 * SKAI-1960: the principal Report cards view had the same fan-out (400 /api/reports calls on a 4-year school). The
 * principal console now carries the active academic year so the view can apply reportCardExamsInView; the exam read
 * keeps its campus and school scope.
 */
for (const [label, principal] of [["standalone", () => user("PRINCIPAL")], ["group", () => groupUser("PRINCIPAL")]] as const) {
  test(`SKAI-1960: the ${label} principal console carries the active academic year and keeps reviewExams campus-scoped`, async () => {
    const dashboard = await loadDashboard();
    h.session = principal();
    const data = await dashboard.getPrincipalDashboardData();
    assert.equal(data.activeAcademicYear, 2026);
    const read = h.calls.find((call) => call.read === "exam.findMany");
    assert.ok(read, "reviewExams is read");
    assert.equal(read.args.where.campusId, h.session.campusId);
    assert.deepEqual(read.args.where.campus, { schoolId: h.session.schoolId });
  });
}

test("SKAI-1960: the principal view of a big school's history lists the active year only, plus a linked earlier exam", () => {
  // Mirrors the qa-big shape: 4 years of released exams (published, locked and principal-reviewed).
  const history = [2026, 2025, 2024, 2023].flatMap((year) => [exam(`${year}-pub`, year), exam(`${year}-locked`, year, "LOCKED"), exam(`${year}-rev`, year, "PRINCIPAL_REVIEWED")]);
  const view = reportCardExamsInView(history, { activeYear: 2026, focusExam: null, showEarlier: false });
  assert.deepEqual(ids(view.exams), ["2026-pub", "2026-locked", "2026-rev"]);
  assert.equal(view.earlierCount, 9);
  const linked = reportCardExamsInView(history, { activeYear: 2026, focusExam: "2023-rev", showEarlier: false });
  assert.deepEqual(ids(linked.exams), ["2023-rev", "2026-pub", "2026-locked", "2026-rev"]);
  assert.equal(reportCardExamsInView(history, { activeYear: 2026, focusExam: null, showEarlier: true }).exams.length, 12);
});

test("SKAI-1960: the principal console stays denied to an admin", async () => {
  const dashboard = await loadDashboard();
  h.session = user("ADMIN");
  await assert.rejects(() => dashboard.getPrincipalDashboardData(), /Unauthorized/);
});
