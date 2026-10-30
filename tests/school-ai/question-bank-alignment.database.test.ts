import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { createWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { listQuestionBank, prepareQuestionReuse } from "../../src/lib/school-ai/question-bank-service";
import { recordMapping } from "../../src/lib/curriculum/service";
import type { CurriculumData, PaperData } from "../../src/lib/school-ai/assessment";
import { getSchoolAiExam } from "../../src/lib/school-ai/exam-service";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { assessmentFixture } from "./assessment-fixture";

// SKO-407: reuse across curriculum versions and boards follows the SKO-406 lead decisions.
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (database.hostname !== "127.0.0.1" || database.port !== (process.env.QA_DB_PORT || "55438") || database.pathname !== "/postgres") throw new Error("Use only isolated PG55438.");
const raw = new PrismaClient();
const schoolId = `bank407-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), subjectId = randomUUID();
const actor = (role: AuthUser["role"]): AuthUser => ({ userId: randomUUID(), schoolId, campusId, role, email: `${randomUUID()}@example.invalid`, accessVersion: 0 });
const lead = actor("CAMPUS_ADMIN"), teacher = actor("TEACHER"), student = actor("STUDENT");
const studentId = randomUUID();
let boardA = { id: "", version: 0 }, boardB = { id: "", version: 0 }, sourcePaper = { id: "", version: 0 };

function curriculum(prefix: string, board: string): CurriculumData {
  const { curriculum } = assessmentFixture(subjectId, classId);
  curriculum.board = board;
  curriculum.outcomes = [{ id: `${prefix}add`, code: `${prefix.toUpperCase()}M1`, title: "Add whole numbers", sourceId: "source-1", sourcePage: "1", included: true, taught: true }];
  return curriculum;
}
async function approved(kind: "CURRICULUM" | "PAPER", title: string, data: unknown) {
  const created = await createWorkspaceRecord(lead, { kind, campusId, title, data: data as Record<string, unknown>, idempotencyKey: randomUUID() });
  return updateWorkspaceRecord(lead, created.id, { version: created.version, action: "approve" });
}
const targetPaper = (target: { id: string; version: number }): PaperData => {
  const { paper } = assessmentFixture(subjectId, classId);
  const outcome = target.id === boardA.id ? "a-add" : "b-add";
  paper.blueprint.sections = paper.blueprint.sections.map(section => ({ ...section, outcomeIds: [outcome] }));
  return { ...paper, curriculumId: target.id, curriculumVersion: target.version, questions: [] };
};
const reuse = (target: { id: string; version: number }, targetOutcomeId: string) => ({ source: { paperId: sourcePaper.id, paperVersion: sourcePaper.version, questionId: "q1" }, paper: targetPaper(target), sectionId: "a", mappings: [{ sourceOutcomeId: "a-add", targetOutcomeId }], alignmentConfirmed: true as const });

before(async () => {
  await raw.school.create({ data: { id: schoolId, name: "Synthetic bank school", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Synthetic", status: "ACTIVE" } });
  await raw.campus.create({ data: { id: campusId, schoolId, name: "Synthetic campus", regId: campusId, city: "Synthetic" } });
  for (const user of [lead, teacher, student]) await raw.user.create({ data: { id: user.userId, schoolId, campusId, email: user.email, role: user.role, fullName: `Synthetic ${user.role}`, onboardingComplete: true } });
  await raw.class.create({ data: { id: classId, schoolId, campusId, name: "Synthetic class", academicYear: 2026 } });
  await raw.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Mathematics", teacherId: teacher.userId } });
  await raw.student.create({ data: { id: studentId, schoolId, campusId, classId, studentUserId: student.userId, fullName: "Synthetic learner", rollNo: "1", gender: "FEMALE", status: "active" } });
  boardA = await approved("CURRICULUM", "Board A", curriculum("a-", "Synthetic Board A"));
  boardB = await approved("CURRICULUM", "Board B", curriculum("b-", "Synthetic Board B"));
  const { paper } = assessmentFixture(subjectId, classId);
  paper.blueprint.sections = paper.blueprint.sections.map(section => ({ ...section, outcomeIds: ["a-add"] }));
  paper.questions = paper.questions.map(question => ({ ...question, outcomeIds: ["a-add"] }));
  sourcePaper = await approved("PAPER", "Board A approved paper", { ...paper, curriculumId: boardA.id, curriculumVersion: boardA.version });
});
after(async () => { await raw.school.deleteMany({ where: { id: schoolId } }); await raw.$disconnect(); await prisma.$disconnect(); });

test("reuse into another board is refused until a lead records a same or partial decision", async () => {
  await assert.rejects(() => prepareQuestionReuse(lead, reuse(boardB, "b-add")), { status: 409, code: "BANK_REUSE_UNMAPPED_OBJECTIVE" }, "identical titles are not a mapping");
  await recordMapping(lead, { from: { recordId: boardA.id, version: boardA.version, outcomeId: "a-add" }, to: { recordId: boardB.id, version: boardB.version, outcomeId: "b-add" }, relation: "NOT_EQUIVALENT" });
  await assert.rejects(() => prepareQuestionReuse(lead, reuse(boardB, "b-add")), { status: 409 }, "a NOT_EQUIVALENT decision blocks reuse");
  await recordMapping(lead, { from: { recordId: boardB.id, version: boardB.version, outcomeId: "b-add" }, to: { recordId: boardA.id, version: boardA.version, outcomeId: "a-add" }, relation: "PARTIAL", note: "Board B stops at 100." });
  const { paper } = await prepareQuestionReuse(lead, reuse(boardB, "b-add"));
  assert.deepEqual(paper.questions[0].outcomeIds, ["b-add"]);
  assert.deepEqual(paper.questions[0].reusedFrom, { paperId: sourcePaper.id, paperVersion: sourcePaper.version, questionId: "q1", curriculumId: boardA.id, curriculumVersion: boardA.version }, "provenance names the real source version");
  assert.equal(paper.questions[0].review, undefined, "the copy needs its own review");
});

test("the bank shows each entry's alignment to the target curriculum and filters by a target objective", async () => {
  const filters = { campusId, subjectId, classId, targetCurriculumId: boardB.id, targetCurriculumVersion: String(boardB.version) };
  const listed = await listQuestionBank(lead, filters);
  assert.ok(listed.items.length > 0);
  const alignment = listed.items[0].alignment!;
  assert.equal(alignment.mode, "MAPPED");
  assert.deepEqual(alignment.mode === "MAPPED" ? alignment.targets["a-add"] : null, [{ outcomeId: "b-add", relation: "PARTIAL" }]);
  assert.equal((await listQuestionBank(lead, { ...filters, outcomeId: "b-add" })).items.length, listed.items.length);
  assert.equal((await listQuestionBank(lead, { ...filters, outcomeId: "b-missing" })).items.length, 0);
  const same = await listQuestionBank(lead, { ...filters, targetCurriculumId: boardA.id, targetCurriculumVersion: String(boardA.version) });
  assert.equal(same.items[0].alignment?.mode, "SAME_VERSION");
  await assert.rejects(() => listQuestionBank(lead, { ...filters, targetCurriculumId: randomUUID() }), { status: 404 });
});

test("an edit after release makes a new version; the issued snapshot keeps the original key and learners never get it", async () => {
  const assignment = await raw.schoolAiExamAssignment.create({ data: { schoolId, campusId, classId, paperId: sourcePaper.id, paperVersion: sourcePaper.version, paperSnapshot: (await raw.schoolAiRecord.findUniqueOrThrow({ where: { id: sourcePaper.id } })).data!, createdById: lead.userId, title: "Synthetic issued paper", startsAt: new Date(Date.now() - 3_600_000), endsAt: new Date(Date.now() + 3_600_000), studentIds: [studentId], status: "ACTIVE", mode: "STANDARD" } });
  const current = await raw.schoolAiRecord.findUniqueOrThrow({ where: { id: sourcePaper.id } });
  const edited = structuredClone(current.data) as unknown as PaperData;
  edited.questions[0].modelAnswer = "Edited after release.";
  const saved = await updateWorkspaceRecord(lead, sourcePaper.id, { version: current.version, data: edited as unknown as Record<string, unknown> });
  assert.equal(saved.status, "DRAFT", "an edit creates a draft successor");
  assert.ok(saved.version > sourcePaper.version);
  const issued = await raw.schoolAiExamAssignment.findUniqueOrThrow({ where: { id: assignment.id } });
  assert.equal((issued.paperSnapshot as unknown as PaperData).questions[0].modelAnswer, "Four.", "the issued paper is unchanged");
  const learnerView = JSON.stringify(await runWithTenantContext({ schoolId, campusId, userId: student.userId, role: student.role }, () => getSchoolAiExam(student, assignment.id)));
  for (const forbidden of ["correctOptionId", "modelAnswer", "rubric", "paperSnapshot"]) assert.equal(learnerView.includes(forbidden), false, `${forbidden} never reaches a learner`);
  await assert.rejects(() => listQuestionBank(student, { campusId, subjectId, classId }));
});
