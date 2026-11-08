import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { createWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { listSchoolAiExams } from "../../src/lib/school-ai/exam-service";
import { recordRehearsal } from "../../src/lib/school-ai/exam-release-service";
import { addForm, assignFormSet, createFormSet, formSetReport } from "../../src/lib/school-ai/form-set-service";
import { paperDataSchema } from "../../src/lib/school-ai/assessment";
import { assessmentFixture } from "./assessment-fixture";

// SKO-408 R10 against the isolated database: forms, structural parity without difficulty claims, one form per candidate, sealed releases and exposure.
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (database.hostname !== "127.0.0.1" || database.port !== (process.env.QA_DB_PORT || "55438") || database.pathname !== "/postgres") throw new Error("Use only isolated PG55438.");
const raw = new PrismaClient();
const schoolId = `frm408-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), subjectId = randomUUID();
const actor = (role: AuthUser["role"]): AuthUser => ({ userId: randomUUID(), schoolId, campusId, role, email: `${randomUUID()}@example.invalid`, accessVersion: 0 });
const lead = actor("CAMPUS_ADMIN"), author = actor("TEACHER"), learners = [1, 2, 3, 4].map(() => actor("STUDENT"));
const studentIds = learners.map(() => randomUUID());
let paperId = "", formSetId = "";
const as = <T>(user: AuthUser, fn: () => Promise<T>) => runWithTenantContext({ schoolId, campusId, userId: user.userId, role: user.role }, fn);
const member = async (label: string) => (await raw.schoolAiRecord.findMany({ where: { schoolId, kind: "PAPER" } })).find(row => paperDataSchema.parse(row.data).formSet?.label === label)!;

before(async () => {
  await raw.school.create({ data: { id: schoolId, name: "Synthetic forms school", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Synthetic", status: "ACTIVE" } });
  await raw.campus.create({ data: { id: campusId, schoolId, name: "Synthetic campus", regId: campusId, city: "Synthetic" } });
  for (const user of [lead, author, ...learners]) await raw.user.create({ data: { id: user.userId, schoolId, campusId, email: user.email, role: user.role, fullName: `Synthetic ${user.role}`, onboardingComplete: true } });
  await raw.class.create({ data: { id: classId, schoolId, campusId, name: "Synthetic Grade 8", academicYear: 2026 } });
  await raw.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Mathematics", teacherId: author.userId } });
  for (const [index, learner] of learners.entries()) await raw.student.create({ data: { id: studentIds[index], schoolId, campusId, classId, studentUserId: learner.userId, fullName: `Synthetic learner ${index + 1}`, rollNo: String(index + 1), gender: "FEMALE", status: "active" } });
  const fixture = assessmentFixture(subjectId, classId);
  let curriculum = await createWorkspaceRecord(lead, { kind: "CURRICULUM", campusId, title: "Synthetic curriculum", data: fixture.curriculum, idempotencyKey: randomUUID() });
  curriculum = await updateWorkspaceRecord(lead, curriculum.id, { version: curriculum.version, action: "approve" });
  paperId = (await createWorkspaceRecord(author, { kind: "PAPER", campusId, title: "Synthetic end of term", data: { ...fixture.paper, curriculumId: curriculum.id, curriculumVersion: curriculum.version } as unknown as Record<string, unknown>, idempotencyKey: randomUUID() })).id;
});
after(async () => { await raw.school.deleteMany({ where: { id: schoolId } }); await raw.$disconnect(); await prisma.$disconnect(); });

test("a draft paper becomes form A with an independent form B; identical copies are flagged, difficulty is never claimed", async () => {
  formSetId = (await createFormSet(author, paperId)).id;
  const a = await member("A"), b = await member("B");
  assert.equal(a.id, paperId);
  const groupsA = Object.values(paperDataSchema.parse(a.data).itemGroupIds!), groupsB = Object.values(paperDataSchema.parse(b.data).itemGroupIds!);
  assert.equal(groupsA.filter(group => groupsB.includes(group)).length, 0, "form B never silently shares form A's items");
  const report = await formSetReport(author, formSetId);
  assert.deepEqual(report.forms.map(form => [form.label, form.status, form.parity]), [["A", "DRAFT", true], ["B", "DRAFT", true]]);
  assert.equal(report.difficulty, "NOT_MEASURED");
  assert.equal(report.identical.length, 3, "an unedited copy is not yet a parallel form");
  assert.equal(report.assignable, false);
  await assert.rejects(() => createFormSet(author, paperId), { status: 409 });
});

test("only the form-set service changes membership; content edits clear the identical-item flags; a marks change breaks parity", async () => {
  const b = await member("B");
  const data = paperDataSchema.parse(b.data);
  await assert.rejects(() => updateWorkspaceRecord(author, b.id, { version: b.version, data: { ...data, formSet: { ...data.formSet!, label: "C" } } as unknown as Record<string, unknown> }), { status: 403 });
  const rewritten = { ...data, questions: data.questions.map(question => question.id === "q1" ? { ...question, prompt: "What is 3 + 1?" } : question.id === "q2" ? { ...question, prompt: "Choose the total of one and three." } : question.id === "q3" ? { ...question, prompt: "Describe how you would add two numbers." } : question) };
  const saved = await updateWorkspaceRecord(author, b.id, { version: b.version, data: rewritten as unknown as Record<string, unknown> });
  assert.equal((await formSetReport(author, formSetId)).identical.length, 0);
  const broken = { ...rewritten, questions: rewritten.questions.map(question => question.id === "q3" ? { ...question, marks: 4, rubric: [{ ...question.rubric[0], marks: 4 }] } : question) };
  const brokenSave = await updateWorkspaceRecord(author, b.id, { version: saved.version, data: broken as unknown as Record<string, unknown> });
  const report = await formSetReport(author, formSetId);
  assert.ok(report.blockers.some(blocker => blocker.label === "B"), "a structural mismatch names the failing form (R10.4)");
  await updateWorkspaceRecord(author, b.id, { version: brokenSave.version, data: rewritten as unknown as Record<string, unknown> });
  assert.equal((await formSetReport(author, formSetId)).blockers.length, 0);
});

test("forms are added up to the policy maximum", async () => {
  assert.equal((await addForm(author, formSetId)).label, "C");
  assert.equal((await addForm(author, formSetId)).label, "D");
  await assert.rejects(() => addForm(author, formSetId), { status: 409 });
  // Keep three forms for the assignment: archive D.
  const d = await member("D");
  await updateWorkspaceRecord(lead, d.id, { version: d.version, action: "archive" });
});

test("the set is assigned whole: one form per candidate, each form sealed, every item's exposure recorded", async () => {
  await assert.rejects(() => as(author, () => assignFormSet(author, formSetId, { idempotencyKey: randomUUID(), title: "Term test", startsAt: new Date(Date.now() - 60_000).toISOString(), endsAt: new Date(Date.now() + 3_600_000).toISOString(), studentIds })), { status: 409 }, "drafts cannot be assigned");
  for (const label of ["A", "B", "C"]) {
    let row = await member(label);
    row = await raw.schoolAiRecord.findUniqueOrThrow({ where: { id: (await updateWorkspaceRecord(author, row.id, { version: row.version, action: "review" })).id } });
    const approved = await updateWorkspaceRecord(lead, row.id, { version: row.version, action: "approve" });
    await recordRehearsal(author, row.id, { version: approved.version, findings: [] });
  }
  const report = await formSetReport(author, formSetId);
  assert.equal(report.assignable, true, JSON.stringify(report.blockers));
  const input = { idempotencyKey: randomUUID(), title: "Term test", startsAt: new Date(Date.now() - 60_000).toISOString(), endsAt: new Date(Date.now() + 3_600_000).toISOString(), studentIds };
  const assigned = await as(author, () => assignFormSet(author, formSetId, input));
  assert.deepEqual(assigned.assignments.map(row => [row.label, row.candidates]), [["A", 2], ["B", 1], ["C", 1]]);
  const exams = await raw.schoolAiExamAssignment.findMany({ where: { schoolId, formSetId } });
  assert.equal(exams.length, 3);
  const seen = exams.flatMap(exam => exam.studentIds as string[]);
  assert.deepEqual([...seen].sort(), [...studentIds].sort(), "every candidate has exactly one form (R10.8)");
  assert.equal(await raw.schoolAiExamFormAllocation.count({ where: { formSetId } }), 4);
  assert.equal(await raw.schoolAiExamFormRelease.count({ where: { formSetId } }), 3);
  assert.equal(await raw.schoolAiExposureEntry.count({ where: { formSetId } }), 9);
  assert.equal((await raw.schoolAiExamFormSet.findUniqueOrThrow({ where: { id: formSetId } })).status, "SEALED");
  const again = await as(author, () => assignFormSet(author, formSetId, input));
  assert.deepEqual(again.assignments.map(row => row.id), assigned.assignments.map(row => row.id), "a retry completes the same set without duplicates");
  assert.equal(await raw.schoolAiExposureEntry.count({ where: { formSetId } }), 9);
  const allocation = await raw.schoolAiExamFormAllocation.findFirstOrThrow({ where: { formSetId } });
  await assert.rejects(() => raw.schoolAiExamFormAllocation.update({ where: { id: allocation.id }, data: { formLabel: "B" } }), /frozen/);
  const mine = await as(learners[0], () => listSchoolAiExams(learners[0]));
  assert.equal(mine.length, 1, "a candidate sees only their own form");
});
