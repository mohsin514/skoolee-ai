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
