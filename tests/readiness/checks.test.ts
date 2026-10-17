import assert from "node:assert/strict";
import test from "node:test";
import { evaluateReadiness, isUnknownClassError, type ReadinessFacts } from "@/lib/readiness/checks";

const ready: ReadinessFacts = {
  adoptionMode: "FULL_OPERATIONS", institutionType: "GROUP", campuses: 2, localeConfirmed: true, activeCycles: 1, classes: 3, classesWithTeacher: 1, teachers: 2,
  students: 40, studentsWithoutGuardian: 0, guardianReviewRequired: 0, feeStructures: 1, openingBalances: 0,
  imports: { pendingBatches: 0, rejectedRows: 2, unresolvedRows: 0, unknownClassRows: 1, batches: [] },
  rehearsal: { attendance: "2026-10-17T00:00:00Z", assessment: "2026-10-17T00:00:00Z", family: "2026-10-17T00:00:00Z" },
};

test("a complete full-operations school is ready; rejected rows stay visible as evidence without blocking", () => {
  const result = evaluateReadiness(ready);
  assert.equal(result.ready, true);
  assert.equal(result.nextRequired, null);
  assert.equal(result.checks.find(check => check.id === "imports")!.evidence.unknownClassRows, 1);
});

test("full operations requires verified guardians and fees; Exam Studio does not", () => {
  const gaps = { ...ready, studentsWithoutGuardian: 4, feeStructures: 0 };
  const full = evaluateReadiness(gaps);
  assert.equal(full.ready, false);
  assert.equal(full.nextRequired, "guardians");
  const exam = evaluateReadiness({ ...gaps, adoptionMode: "EXAM_STUDIO", classesWithTeacher: 0 });
  assert.equal(exam.ready, true, "Exam Studio runs beside the school's existing fee and family systems");
  assert.equal(exam.checks.find(check => check.id === "guardians")!.required, false);
});

test("a platform-default locale, a staged import or an incomplete rehearsal blocks go-live, in order", () => {
  assert.equal(evaluateReadiness({ ...ready, localeConfirmed: false }).nextRequired, "locale");
  assert.equal(evaluateReadiness({ ...ready, imports: { ...ready.imports, pendingBatches: 1 } }).nextRequired, "imports");
  const rehearsal = evaluateReadiness({ ...ready, rehearsal: { attendance: "x" } });
  assert.equal(rehearsal.nextRequired, "rehearsal");
  assert.equal(rehearsal.checks.find(check => check.id === "rehearsal")!.evidence.completedSteps, 1);
});

test("unknown-class roster rejections are recognised from the staging error", () => {
  assert.equal(isUnknownClassError("classId: Class is outside the selected campus or does not exist"), true);
  assert.equal(isUnknownClassError("rollNo: Roll number already used"), false);
});
