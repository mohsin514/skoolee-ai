import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { createWorkspaceRecord, getWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { listQuestionBank, prepareQuestionReuse } from "../../src/lib/school-ai/question-bank-service";
import type { PaperData } from "../../src/lib/school-ai/assessment";
import { assessmentFixture } from "./assessment-fixture";

const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (database.hostname !== "127.0.0.1" || database.port !== (process.env.QA_DB_PORT || "55438") || database.pathname !== "/postgres") throw new Error("Use only the isolated school AI fixture database on 127.0.0.1:55438/postgres.");
const raw = new PrismaClient();
const schoolId = `ai-bank-${randomUUID()}`, campusId = randomUUID(), anotherCampusId = randomUUID(), classId = randomUUID(), otherClassId = randomUUID(), subjectId = randomUUID();
const actor = (role: AuthUser["role"], campus = campusId): AuthUser => ({ userId: randomUUID(), schoolId, campusId: campus, role, email: `${randomUUID()}@example.invalid` });
const admin = actor("CAMPUS_ADMIN"), teacher = actor("TEACHER"), unrelatedTeacher = actor("TEACHER"), student = actor("STUDENT"), secondStudent = actor("STUDENT"), wrongClass = actor("STUDENT"), wrongCampus = actor("STUDENT", anotherCampusId), parent = actor("PARENT");
const studentId = randomUUID(), secondStudentId = randomUUID(), wrongClassId = randomUUID();
let paperId: string, paperVersion: number, curriculumId: string, curriculumVersion: number, teacherPaperId: string;

before(async () => {
  await raw.school.create({ data: { id: schoolId, name: "Synthetic exam school", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Synthetic", status: "ACTIVE" } });
  for (const id of [campusId, anotherCampusId]) await raw.campus.create({ data: { id, schoolId, name: "Synthetic campus", regId: id, city: "Synthetic" } });
  for (const user of [admin, teacher, unrelatedTeacher, student, secondStudent, wrongClass, wrongCampus, parent]) await raw.user.create({ data: { id: user.userId, schoolId, campusId: user.campusId, email: user.email, role: user.role, fullName: `Synthetic ${user.role}`, onboardingComplete: true } });
  for (const [index, id] of [classId, otherClassId].entries()) await raw.class.create({ data: { id, schoolId, campusId, name: "Synthetic class", section: `S${index + 1}`, academicYear: 2026 } });
  await raw.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Mathematics", teacherId: teacher.userId } });
  for (const [id, userId, cls] of [[studentId, student.userId, classId], [secondStudentId, secondStudent.userId, classId], [wrongClassId, wrongClass.userId, otherClassId]]) await raw.student.create({ data: { id, schoolId, campusId, classId: cls, studentUserId: userId, fullName: "Synthetic learner", rollNo: id.slice(0, 8), gender: "MALE", status: "active" } });
  const fixture = assessmentFixture(subjectId, classId);
  let curriculum = await createWorkspaceRecord(admin, { kind: "CURRICULUM", campusId, title: "Synthetic approved curriculum", data: fixture.curriculum, idempotencyKey: randomUUID() });
  curriculum = await updateWorkspaceRecord(admin, curriculum.id, { version: curriculum.version, action: "approve" }); curriculumId = curriculum.id; curriculumVersion = curriculum.version;
  fixture.paper.questions[0].bankMetadata = { tags: ["addition", "unit-one"], difficulty: "EASY" };
  let paper = await createWorkspaceRecord(admin, { kind: "PAPER", campusId, title: fixture.paper.blueprint.title, data: { ...fixture.paper, curriculumId: curriculum.id, curriculumVersion: curriculum.version }, idempotencyKey: randomUUID() });
  paper = await updateWorkspaceRecord(admin, paper.id, { version: paper.version, action: "approve" }); paperId = paper.id; paperVersion = paper.version;
  let teacherPaper = await createWorkspaceRecord(teacher, { kind: "PAPER", campusId, title: "Teacher approved bank paper", data: { ...fixture.paper, curriculumId, curriculumVersion }, idempotencyKey: randomUUID() });
  teacherPaper = await updateWorkspaceRecord(admin, teacherPaper.id, { version: teacherPaper.version, action: "approve" }); teacherPaperId = teacherPaper.id;
});
after(async () => { await raw.school.deleteMany({ where: { id: schoolId } }); await raw.$disconnect(); await prisma.$disconnect(); });

const filters = () => ({ campusId, subjectId, classId });
const targetPaper = (): PaperData => ({ ...assessmentFixture(subjectId, classId).paper, curriculumId, curriculumVersion, questions: [] });
const reuse = (sourcePaperId = paperId) => ({ source: { paperId: sourcePaperId, paperVersion, questionId: "q1" }, paper: targetPaper(), sectionId: assessmentFixture().paper.questions[0].sectionId, mappings: [{ sourceOutcomeId: "outcome-1", targetOutcomeId: "outcome-1" }], alignmentConfirmed: true });

test("approved bank filters are scoped, staff-only and exclude other teachers' answer keys", async () => {
  const all = await listQuestionBank(admin, filters()); assert.equal(all.items.length, 6);
  const filtered = await listQuestionBank(admin, { ...filters(), tag: "ADDITION", difficulty: "EASY", type: "SINGLE_CHOICE", language: "en", minMarks: "2", maxMarks: "2" }); assert.equal(filtered.items.length, 2);
  assert.equal((await listQuestionBank(admin, { ...filters(), language: "ar" })).items.length, 0);
  const own = await listQuestionBank(teacher, filters()); assert.equal(own.items.length, 3); assert(own.items.every((item) => item.source.paperId === teacherPaperId));
  for (const user of [student, parent, wrongCampus, unrelatedTeacher]) await assert.rejects(() => listQuestionBank(user, filters()));
  await assert.rejects(() => listQuestionBank(admin, { ...filters(), campusId: anotherCampusId }), { status: 403 });
  await assert.rejects(() => prepareQuestionReuse(teacher, reuse(paperId)), { status: 404 });
});
test("reuse produces a pinned draft copy with durable validated provenance, without publishing", async () => {
  const result = await prepareQuestionReuse(admin, reuse()); const question = result.paper.questions[0];
  assert.equal(question.locked, true); assert.equal(question.reusedFrom?.paperId, paperId); assert.equal(question.reusedFrom?.paperVersion, paperVersion);
  const saved = await createWorkspaceRecord(admin, { kind: "PAPER", campusId, title: "Reused bank draft", data: result.paper, idempotencyKey: randomUUID() });
  assert.equal(saved.status, "DRAFT"); assert.equal((saved.data as unknown as PaperData).questions[0].reusedFrom?.curriculumVersion, curriculumVersion);
  const forged = structuredClone(result.paper); forged.questions[0].reusedFrom!.paperVersion = 1;
  await assert.rejects(() => createWorkspaceRecord(admin, { kind: "PAPER", campusId, title: "Forged approval", data: forged, idempotencyKey: randomUUID() }), { status: 404 });
  forged.questions[0].reusedFrom!.paperVersion = paperVersion; forged.questions[0].reusedFrom!.curriculumVersion = 999;
  await assert.rejects(() => createWorkspaceRecord(admin, { kind: "PAPER", campusId, title: "Forged curriculum", data: forged, idempotencyKey: randomUUID() }), { status: 403 });
  await assert.rejects(() => prepareQuestionReuse(admin, { ...reuse(), paper: { ...targetPaper(), curriculumVersion: curriculumVersion + 1 } }), { status: 409 });
  assert.equal(await raw.schoolAiExamAssignment.count({ where: { schoolId } }), 0);
});
test("historical approved questions remain unchanged while the authoring paper is revised", async () => {
  const paper = await getWorkspaceRecord(admin, paperId); const changed = structuredClone(paper.data) as unknown as PaperData; changed.questions[0].prompt = "Unapproved later edit";
  await updateWorkspaceRecord(admin, paperId, { version: paper.version, data: changed, action: "save" });
  const bank = await listQuestionBank(admin, { ...filters(), search: "What is 2 + 2?" });
  const original = bank.items.find((item) => item.source.paperId === paperId); assert(original); assert.equal(original.source.paperVersion, paperVersion); assert.equal(original.question.prompt, "What is 2 + 2?");
  assert.equal((await listQuestionBank(admin, { ...filters(), search: "Unapproved later edit" })).items.length, 0);
  assert.equal((await prepareQuestionReuse(admin, reuse())).paper.questions[0].prompt, "What is 2 + 2?");
});
test("bank access immediately honors a revoked exams grant", async () => {
  await listQuestionBank(teacher, filters());
  await raw.rolePermission.create({ data: { schoolId, role: "TEACHER", module: "exams", canView: false, canAdd: true, canEdit: true } });
  try { await assert.rejects(() => listQuestionBank(teacher, filters()), { status: 403 }); }
  finally { await raw.rolePermission.deleteMany({ where: { schoolId, role: "TEACHER", module: "exams" } }); }
});
test("bank pagination does not lose questions within a large approved revision", async () => {
  const fixture = assessmentFixture(subjectId, classId); const base = fixture.paper.questions[0];
  const data: PaperData = { ...fixture.paper, curriculumId, curriculumVersion, blueprint: { ...fixture.paper.blueprint, totalMarks: 50, sections: [{ ...fixture.paper.blueprint.sections[0], questionCount: 25, answerCount: 25 }] }, questions: Array.from({ length: 25 }, (_, index) => ({ ...base, id: `page-${index}`, prompt: `Synthetic addition item ${index}`, bankMetadata: { tags: ["pagination"], difficulty: "UNSPECIFIED" } })) };
  let record = await createWorkspaceRecord(admin, { kind: "PAPER", campusId, title: "Pagination paper", data, idempotencyKey: randomUUID() }); record = await updateWorkspaceRecord(admin, record.id, { version: record.version, action: "approve" });
  const first = await listQuestionBank(admin, { ...filters(), tag: "pagination" }); assert.equal(first.items.length, 20); assert(first.nextCursor);
  const second = await listQuestionBank(admin, { ...filters(), tag: "pagination", cursor: first.nextCursor }); assert.equal(second.items.length, 5);
  assert.equal(new Set([...first.items, ...second.items].map((item) => item.source.questionId)).size, 25);
  await assert.rejects(() => listQuestionBank(admin, { ...filters(), cursor: "invalid" }), { status: 400 });
});
