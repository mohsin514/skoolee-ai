import assert from "node:assert/strict";
import { test } from "node:test";
import { SETUP_AREAS, setupAreaHref, setupAreaTaskKey } from "../../src/lib/onboarding/setup-areas";
import { evaluateReadiness, type ReadinessFacts } from "../../src/lib/readiness/checks";
import { buildSetupProgress, progressFreshness, PROGRESS_STALE_MS, taskBucket } from "../../src/lib/readiness/progress";

const at = new Date("2026-10-30T09:00:00Z");
const facts: ReadinessFacts = {
  adoptionMode: "FULL_OPERATIONS", institutionType: "GROUP", campuses: 2, localeConfirmed: true, activeCycles: 1, classes: 3, classesWithTeacher: 3, teachers: 2,
  students: 40, studentsWithoutGuardian: 0, guardianReviewRequired: 0, feeStructures: 1, openingBalances: 0,
  imports: { pendingBatches: 0, rejectedRows: 0, unresolvedRows: 0, unknownClassRows: 0, batches: [] }, rehearsal: {},
  campusBreakdown: [{ id: "north", name: "North", classes: 3, students: 40 }, { id: "south", name: "South", classes: 0, students: 0 }],
};
const tasks = [
  { key: setupAreaTaskKey("academicYear"), status: "DONE" }, { key: setupAreaTaskKey("weekends"), status: "DONE" },
  { key: setupAreaTaskKey("holidays"), status: "IN_PROGRESS" }, { key: setupAreaTaskKey("periods"), status: "DEFERRED" },
  { key: setupAreaTaskKey("rooms"), status: "OPEN" }, { key: "logo", status: "DONE" },
  { key: "feesPayroll", status: "OPEN" }, { key: "custom-1", status: "IN_PROGRESS" },
];
function build(role = "ADMIN", school = { classes: 3, students: 40 }) {
  const viewer = { role, institutionKind: "GROUP" as const };
  const evaluation = evaluateReadiness(facts, viewer);
  return buildSetupProgress({ tasks, areas: SETUP_AREAS.map(id => ({ id, ...setupAreaHref(id, viewer) })), checks: evaluation.checks, campuses: evaluation.campuses, school, viewer, generatedAt: at });
}

test("a task's status maps to exactly one bucket; in progress and later are not done", () => {
  assert.deepEqual(["DONE", "IN_PROGRESS", "OPEN", "DEFERRED", undefined].map(taskBucket), ["done", "inProgress", "open", "deferred", "open"]);
});

test("totals reconcile with the task records they were counted from", () => {
  const p = build();
  // Every setup area appears once; areas without a task (classes, subjects, grade weights) count as not started.
  assert.equal(p.areaTally.total, SETUP_AREAS.length);
  assert.deepEqual({ ...p.areaTally }, { done: 3, inProgress: 1, open: 4, deferred: 1, total: 9 });
  // Follow-ups are every task record, recounted independently here.
  const recount = (status: string) => tasks.filter(task => task.status === status).length;
  assert.deepEqual({ ...p.followUps }, { done: recount("DONE"), inProgress: recount("IN_PROGRESS"), open: recount("OPEN"), deferred: recount("DEFERRED"), total: tasks.length });
  assert.equal(p.reconciled, true);
});

test("overall percent is areas done plus required checks passed over both totals", () => {
  const p = build();
  const required = evaluateReadiness(facts).checks.filter(check => check.required);
  assert.equal(p.checks.total, required.length);
  assert.equal(p.checks.passed, required.filter(check => check.passed).length);
  assert.equal(p.percent, Math.floor(((p.areaTally.done + p.checks.passed) * 100) / (p.areaTally.total + p.checks.total)));
});

test("per-campus totals add up to the school totals, and a mismatch is reported, not hidden", () => {
  const p = build();
  assert.deepEqual(p.campusTotals, { total: 2, ready: 1, classes: 3, students: 40 });
  // A class on an archived campus is in the school count but on no campus row.
  const off = build("ADMIN", { classes: 4, students: 40 });
  assert.equal(off.reconciliation.campuses, false);
  assert.equal(off.reconciled, false);
});

test("drill-through only links to consoles the viewer may open", () => {
  const admin = build("ADMIN");
  assert.equal(admin.campuses[0].classesHref, "/admin?view=academic-hub");
  assert.equal(admin.campuses[0].pupilsHref, "/admin?view=students");
  const group = build("SUPER_ADMIN");
  assert.ok(group.campuses.every(c => c.classesHref === "/super?view=campuses"), "the group admin has no /admin console");
  assert.ok(group.areas.every(area => !area.href?.startsWith("/admin")));
  const teacher = build("TEACHER");
  assert.ok(teacher.campuses.every(c => c.classesHref === null && c.pupilsHref === null), "no screen, no link");
});

test("a reading is fresh, then partial when a source was capped, then stale after the window", () => {
  const p = build();
  assert.equal(progressFreshness(p, at.getTime() + 60_000), "fresh");
  assert.equal(progressFreshness({ ...p, partial: ["imports"] }, at.getTime()), "partial");
  assert.equal(progressFreshness({ ...p, partial: ["imports"] }, at.getTime() + PROGRESS_STALE_MS + 1), "stale");
  assert.equal(p.generatedAt, at.toISOString());
});

test("a non-lead's progress covers only the tasks handed to the builder", () => {
  const own = buildSetupProgress({ tasks: tasks.slice(0, 2), viewer: { role: "TEACHER" }, generatedAt: at });
  assert.equal(own.followUps.total, 2);
  assert.equal(own.areas.length, 0);
  assert.equal(own.campuses.length, 0);
  assert.equal(own.percent, 0);
});
