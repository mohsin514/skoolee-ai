import { redis } from "../../src/lib/queue/connection";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../../src/lib/db/prisma";
import type { AuthUser } from "../../src/lib/auth";
import { CLASS_A_ALLOWLIST } from "../../src/lib/ai-workflows/registry/floors";
import { runGates } from "../../src/lib/ai-workflows/registry/gates";
import { capabilityContext, inTenant } from "../../src/lib/ai-workflows/jobs/actor";
import { InputRequired, WorkflowError, toWorkflowError } from "../../src/lib/ai-workflows/errors";
import type { CapabilityContext, CapabilityEntry, ExecEntry } from "../../src/lib/ai-workflows/registry/types";
import { aiWorkflowsDestination } from "./support/destination.mjs";
aiWorkflowsDestination();
const db = new PrismaClient(), schools: string[] = [];
after(async () => { await db.school.deleteMany({ where: { id: { in: schools } } }); await db.$disconnect(); await prisma.$disconnect(); redis.disconnect(); });

// marks_scan.create_template runs at class A; until the lead lists it in CLASS_A_ALLOWLIST (floors.ts),
// allow it here before the entries are defined so defineCapability's floor check passes as it will then.
(CLASS_A_ALLOWLIST as Record<string, string>)["marks_scan.create_template"] ??= "test: pending floors.ts entry";
let ENTRIES: readonly CapabilityEntry[] = [];
before(async () => { ({ TEACHER_ASSESSMENT_ENTRIES: ENTRIES } = await import("../../src/lib/ai-workflows/registry/domains/teacher/assessment")); });
const exec = (key: string) => ENTRIES.find(row => row.key === key) as ExecEntry<Record<string, unknown>>;

/** A teacher who leads 7B and teaches Science there; 7C is a colleague's class on the same campus. */
async function fixture() {
  const schoolId = `assessment-${randomUUID()}`, campusId = randomUUID(), userId = randomUUID(), colleagueId = randomUUID(); schools.push(schoolId);
  await db.school.create({ data: { id: schoolId, slug: schoolId, regId: schoolId, name: "Synthetic assessment school", contactEmail: `${schoolId}@example.invalid`, city: "Test", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, regId: campusId, name: "Synthetic campus", city: "Test" } });
  for (const id of [userId, colleagueId]) await db.user.create({ data: { id, schoolId, campusId, email: `${id}@example.invalid`, fullName: "Synthetic teacher", role: "TEACHER", isActive: true } });
  await db.academicCycle.create({ data: { schoolId, campusId, academicYear: 2026, label: "2026", status: "ACTIVE" } });
  const own = await db.class.create({ data: { schoolId, campusId, name: "7", section: "B", academicYear: 2026, status: "ACTIVE", classTeacherId: userId } });
  const foreign = await db.class.create({ data: { schoolId, campusId, name: "7", section: "C", academicYear: 2026, status: "ACTIVE", classTeacherId: colleagueId } });
  const science = await db.subject.create({ data: { schoolId, campusId, classId: own.id, name: "Science", teacherId: userId, totalMarks: 20 } });
  const foreignScience = await db.subject.create({ data: { schoolId, campusId, classId: foreign.id, name: "Science", teacherId: colleagueId, totalMarks: 20 } });
  const pupil = (classId: string, fullName: string, rollNo: string) => db.student.create({ data: { schoolId, campusId, classId, fullName, rollNo, gender: "MALE", status: "active", enrollmentDate: new Date("2026-04-01Z") } });
  const ali = await pupil(own.id, "Ali Raza", "1"), sara = await pupil(own.id, "Sara Khan", "2");
  await pupil(foreign.id, "Bilal Ahmed", "31");
  const exam = (classId: string, subjectId: string, title: string, examType = "QUIZ") => db.exam.create({ data: { schoolId, campusId, classId, subjectId, title, term: "Term 1", academicYear: 2026, examType, status: "ACTIVE", totalMarks: 20, activatedAt: new Date("2026-10-20Z") } });
  const user: AuthUser = { schoolId, campusId, userId, role: "TEACHER", email: `${userId}@example.invalid`, fullName: "Synthetic teacher", accessVersion: 0 };
  const ctx = await inTenant(user, () => capabilityContext(user, campusId, "en"));
  const as = <T>(work: () => Promise<T>) => inTenant(user, work);
  return { user, ctx, as, schoolId, campusId, own, foreign, science, foreignScience, ali, sara, exam };
}

/** resolve → preview → execute, the order the step runner uses. */
async function runEntry(ctx: CapabilityContext, as: <T>(work: () => Promise<T>) => Promise<T>, key: string, raw: Record<string, unknown>) {
  const entry = exec(key);
  const input = entry.input.parse(raw);
  const bound = await as(() => entry.resolve ? entry.resolve(ctx, input) : Promise.resolve(input));
  const reparsed = entry.input.parse(bound); // the confirm path re-parses the bound input
  const preview = entry.preview ? await as(() => entry.preview!(ctx, reparsed)) : null;
  const receipt = await as(() => entry.execute(ctx, reparsed, { idempotencyKey: `k-${randomUUID()}` }));
  return { bound: reparsed, preview, receipt };
}
const thrown = async (work: Promise<unknown>) => { try { await work; } catch (error) { return error; } assert.fail("expected a refusal"); };

test("entries are defined at their floors with copy in three languages", () => {
  assert.deepEqual(ENTRIES.map(entry => [entry.key, entry.class]), [["exams.create", "B"], ["marks.enter_bulk", "B"], ["marks_scan.create_template", "A"], ["reports.edit_remarks", "B"], ["corrections.request_mark", "B"]]);
  assert.deepEqual(exec("marks.enter_bulk").evidence, ["/marks/*/said"]);
});

test("a teacher creates a quiz in their own class; a mid-term is refused", async () => {
  const f = await fixture();
  assert.equal((await runGates(f.ctx, exec("exams.create").gates)).ok, true);
  const { preview, receipt } = await runEntry(f.ctx, f.as, "exams.create", { classId: f.own.id, subjectId: f.science.id, title: "Chapter 3 quiz", examType: "QUIZ" });
  assert.equal(receipt.kind, "write");
  const created = await db.exam.findFirstOrThrow({ where: { id: receipt.entities[0].id } });
  assert.deepEqual([created.examType, created.term, created.academicYear, created.totalMarks, created.status], ["QUIZ", "Term 1", 2026, 20, "ACTIVE"]);
  assert.ok(preview!.lines.some(line => /academic lead/.test(line.value) && /New exam created/.test(line.value)), "the preview names the EXAM_CREATED notice and its recipients");
  assert.equal(preview!.confirmLabel, "Create Quiz");

  assert.equal(exec("exams.create").input.safeParse({ classId: f.own.id, title: "Mid-term", examType: "MID_TERM" }).success, false, "the AI input offers teachers quizzes and class tests only");
  const { createExamCommand } = await import("../../src/lib/exams/create-command");
  const refused = await thrown(f.as(() => createExamCommand(f.user, { classId: f.own.id, title: "Mid-term", term: "Term 1", academicYear: 2026, examType: "MID_TERM" })));
  assert.equal((refused as { status?: number }).status, 403);
  assert.equal(toWorkflowError(refused).code, "SCOPE_DENIED");
  assert.equal(await db.exam.count({ where: { schoolId: f.schoolId } }), 1);
});

test("marks for two named pupils are saved once; the replay writes nothing more", async () => {
  const f = await fixture();
  const quiz = await f.exam(f.own.id, f.science.id, "Science quiz");
  const raw = { exam: "science quiz", marks: [{ student: "Ali", marks: 18, said: "Ali 18" }, { student: "sara", marks: 15, said: "Sara got 15 out of 20" }] };
  const first = await runEntry(f.ctx, f.as, "marks.enter_bulk", raw);
  assert.equal(first.bound.examId, quiz.id);
  assert.deepEqual((first.bound.marks as Array<{ studentId: string }>).map(row => row.studentId), [f.ali.id, f.sara.id]);
  assert.deepEqual(first.preview!.lines.slice(0, 2).map(line => `${line.label} · ${line.value}`), ["Ali Raza · 18/20", "Sara Khan · 15/20"]);
  assert.equal(first.preview!.confirmLabel, "Save 2 marks");
  assert.ok(first.preview!.lines.some(line => /Marks entered/.test(line.value)));
  assert.deepEqual(first.receipt.counts, { saved: 2, changed: 2 });
  assert.equal(await db.mark.count({ where: { examId: quiz.id } }), 2);
  const audits = await db.auditLog.count({ where: { tableName: "marks", userId: f.user.userId } });

  const replay = await f.as(() => exec("marks.enter_bulk").execute(f.ctx, first.bound, { idempotencyKey: "replay" }));
  assert.deepEqual(replay.counts, { saved: 2, changed: 0 });
  assert.equal(await db.mark.count({ where: { examId: quiz.id } }), 2);
  assert.equal(await db.auditLog.count({ where: { tableName: "marks", userId: f.user.userId } }), audits, "an identical replay writes no audit row");
  assert.deepEqual((await db.mark.findMany({ where: { examId: quiz.id }, orderBy: { marksObtained: "desc" } })).map(mark => mark.marksObtained), [18, 15]);
});

test("a mark above the subject total becomes a question, not a save", async () => {
  const f = await fixture();
  const quiz = await f.exam(f.own.id, f.science.id, "Science quiz");
  const entry = exec("marks.enter_bulk");
  const error = await thrown(f.as(() => entry.resolve!(f.ctx, entry.input.parse({ exam: "science quiz", marks: [{ student: "Ali", marks: 25, said: "Ali 25" }] }))));
  assert.ok(error instanceof InputRequired);
  assert.deepEqual(error.fields.map(field => [field.pointer, field.promptKey, field.params?.total]), [["/marks/0/marks", "MARK_OVER_TOTAL", 20]]);
  assert.equal(await db.mark.count({ where: { examId: quiz.id } }), 0);
});

test("an exam name that fits two exams asks which one, with choices", async () => {
  const f = await fixture();
  await f.exam(f.own.id, f.science.id, "Science quiz 1");
  await f.exam(f.own.id, f.science.id, "Science quiz 2");
  const entry = exec("marks.enter_bulk");
  const error = await thrown(f.as(() => entry.resolve!(f.ctx, entry.input.parse({ exam: "science quiz", marks: [{ student: "Ali", marks: 12, said: "Ali 12" }] }))));
  assert.ok(error instanceof InputRequired);
  assert.equal(error.fields[0].promptKey, "EXAM_AMBIGUOUS");
  assert.equal(error.fields[0].options?.length, 2);
  // Answering with a choice binds exactly that exam.
  const bound = await f.as(() => entry.resolve!(f.ctx, entry.input.parse({ exam: error.fields[0].options![1].value, marks: [{ student: "Ali", marks: 12, said: "Ali 12" }] })));
  assert.match(String(error.fields[0].options![1].label), /Science quiz 2/);
  assert.ok(bound.examId);
});

test("a colleague's class is refused with SCOPE_DENIED and writes nothing", async () => {
  const f = await fixture();
  const create = exec("exams.create");
  const denied = await thrown(f.as(() => create.resolve!(f.ctx, create.input.parse({ classId: f.foreign.id, title: "Quiz", examType: "QUIZ" }))));
  assert.ok(denied instanceof WorkflowError && denied.code === "SCOPE_DENIED");
  const deniedAtExecute = await thrown(f.as(() => create.execute(f.ctx, create.input.parse({ classId: f.foreign.id, title: "Quiz", examType: "QUIZ", term: "Term 1" }), { idempotencyKey: "x" })));
  assert.ok(deniedAtExecute instanceof WorkflowError && deniedAtExecute.code === "SCOPE_DENIED");

  const foreignQuiz = await f.exam(f.foreign.id, f.foreignScience.id, "Science quiz 7C");
  const marks = exec("marks.enter_bulk");
  const named = await thrown(f.as(() => marks.resolve!(f.ctx, marks.input.parse({ exam: "science quiz 7C", marks: [{ student: "Bilal", marks: 10, said: "Bilal 10" }] }))));
  assert.ok(named instanceof InputRequired && named.fields[0].promptKey === "EXAM_NOT_FOUND", "a colleague's exam is not offered");
  const bound = await thrown(f.as(() => marks.execute(f.ctx, marks.input.parse({ exam: "x", examId: foreignQuiz.id, subjectId: f.foreignScience.id, marks: [{ student: "Bilal", marks: 10, said: "Bilal 10", studentId: randomUUID() }] }), { idempotencyKey: "y" })));
  assert.ok(bound instanceof WorkflowError && bound.code === "SCOPE_DENIED");
  assert.equal(await db.exam.count({ where: { schoolId: f.schoolId, classId: f.foreign.id } }), 1);
  assert.equal(await db.mark.count({ where: { schoolId: f.schoolId } }), 0);
});

test("editing a report remark clears its approval and says so first", async () => {
  const f = await fixture();
  const term = await f.exam(f.own.id, f.science.id, "Term 1 result", "CLASS_TEST");
  const report = await db.reportCard.create({ data: { schoolId: f.schoolId, campusId: f.campusId, examId: term.id, studentId: f.ali.id, remarksEn: "Good.", remarksApproved: true, approvedBy: f.user.userId, approvedAt: new Date(), status: "REVIEWED" } });
  const { preview, receipt, bound } = await runEntry(f.ctx, f.as, "reports.edit_remarks", { student: "Ali", remark: "Works hard and helps others.", said: "works hard and helps others" });
  assert.equal(bound.reportCardId, report.id);
  assert.equal(bound.language, "EN");
  assert.ok(preview!.lines.some(line => /clears the approval/.test(line.value)));
  assert.equal(preview!.counts.approvalCleared, 1);
  const after = await db.reportCard.findUniqueOrThrow({ where: { id: report.id } });
  assert.deepEqual([after.remarksEn, after.remarksApproved, after.approvedBy, after.approvedAt], ["Works hard and helps others.", false, null, null]);
  assert.equal(receipt.counts.approvalCleared, 1);
});

test("a mark correction is requested for the academic lead, bound to the reviewed version, once", async () => {
  const f = await fixture();
  const midterm = await db.exam.create({ data: { schoolId: f.schoolId, campusId: f.campusId, classId: f.own.id, subjectId: f.science.id, title: "Science mid-term", term: "Term 1", academicYear: 2026, examType: "MID_TERM", status: "LOCKED", isLocked: true, totalMarks: 20 } });
  const mark = await db.mark.create({ data: { schoolId: f.schoolId, campusId: f.campusId, examId: midterm.id, studentId: f.ali.id, subjectId: f.science.id, marksObtained: 15, grade: "B", enteredBy: f.user.userId } });
  const raw = { exam: "science mid-term", student: "Ali", marksObtained: 17, reason: "I added the paper wrong", publicExplanation: "A totalling error was corrected.", said: "Ali's science mid-term should be 17 not 15, I added the paper wrong" };
  const { bound, preview, receipt } = await runEntry(f.ctx, f.as, "corrections.request_mark", raw);
  assert.equal(bound.markId, mark.id);
  assert.ok(preview!.lines.some(line => line.value.startsWith("15/20") && line.value.includes("17/20")));
  const rows = await db.correction.findMany({ where: { schoolId: f.schoolId } });
  assert.deepEqual(rows.map(row => [row.status, row.kind, row.sourceId, row.requesterId]), [["PENDING", "MARK", mark.id, f.user.userId]]);
  assert.equal((await db.mark.findUniqueOrThrow({ where: { id: mark.id } })).marksObtained, 15, "nothing changes until the academic lead decides");
  const replay = await f.as(() => exec("corrections.request_mark").execute(f.ctx, bound, { idempotencyKey: "replay" }));
  assert.equal(replay.entities[0].id, receipt.entities[0].id);
  assert.equal(await db.correction.count({ where: { schoolId: f.schoolId } }), 1);
});

test("a paper marks sheet is drafted for an open exam of the teacher's own", async () => {
  const f = await fixture();
  const quiz = await f.exam(f.own.id, f.science.id, "Science quiz");
  const { receipt } = await runEntry(f.ctx, f.as, "marks_scan.create_template", { exam: "science quiz" });
  assert.equal(receipt.kind, "draft");
  const template = await db.markSheetTemplate.findFirstOrThrow({ where: { examId: quiz.id } });
  assert.deepEqual([template.subjectId, template.maxMarks, template.pageCount], [f.science.id, 20, 1]);
  assert.equal(await db.mark.count({ where: { examId: quiz.id } }), 0);
});
