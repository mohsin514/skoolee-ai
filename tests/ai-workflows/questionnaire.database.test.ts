import { redis } from "../../src/lib/queue/connection";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../../src/lib/db/prisma";
import type { AuthUser } from "../../src/lib/auth";
import { buildSetup, getSheet, saveAnswers, setupStatus } from "../../src/lib/ai-workflows/questionnaire/service";
import { aiWorkflowsDestination } from "./support/destination.mjs";
aiWorkflowsDestination();
const db = new PrismaClient(), schools: string[] = [];
after(async () => { await db.school.deleteMany({ where: { id: { in: schools } } }); await db.$disconnect(); await prisma.$disconnect(); redis.disconnect(); });

async function school() {
  const schoolId = `setup-${randomUUID()}`, campusId = randomUUID(); schools.push(schoolId);
  await db.school.create({ data: { id: schoolId, slug: schoolId, regId: schoolId, name: "Synthetic setup school", contactEmail: `${schoolId}@example.invalid`, city: "Test", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, regId: campusId, name: "Synthetic campus", city: "Test" } });
  await db.academicCycle.create({ data: { schoolId, campusId, academicYear: 2026, label: "2026", status: "ACTIVE" } });
  return { schoolId, campusId };
}
async function person(schoolId: string, campusId: string, role: AuthUser["role"]): Promise<AuthUser> {
  const userId = randomUUID();
  await db.user.create({ data: { id: userId, schoolId, campusId, email: `${userId}@example.invalid`, fullName: "Synthetic staff", role, isActive: true } });
  return { schoolId, campusId, userId, role, email: `${userId}@example.invalid`, accessVersion: 0 };
}
const code = (expected: string) => (error: unknown) => (error as { code?: string }).code === expected;

test("a key for another role is NOT_FOUND for every role but its own (RT14)", async () => {
  const { schoolId, campusId } = await school();
  for (const role of ["ADMIN", "CAMPUS_ADMIN", "PRINCIPAL", "ACCOUNTANT", "LIBRARIAN", "RECEPTIONIST", "STUDENT"] as const) {
    const user = await person(schoolId, campusId, role);
    await assert.rejects(getSheet(user, "teacher", "en"), code("NOT_FOUND"), role);
    await assert.rejects(saveAnswers(user, "teacher", { version: 1, answers: {}, confirmedKeys: [] }), code("NOT_FOUND"), role);
    assert.equal(await setupStatus(user), null);
  }
});

test("a teacher without allocations is told so and never given invented classes", async () => {
  const { schoolId, campusId } = await school();
  const teacher = await person(schoolId, campusId, "TEACHER");
  const sheet = await getSheet(teacher, "teacher", "en");
  assert.equal(sheet.known[0].value, "Not assigned yet");
  assert.deepEqual(sheet.questions.map(question => question.key), ["assignmentCheck", "preferredLanguage", "professionalGaps", "focusAreas"]);
  assert.equal(sheet.questions[0].value, "MISSING");
  assert.equal(sheet.questions[0].confirmed, false, "a default is shown, never confirmed for the teacher");
  assert.deepEqual((await setupStatus(teacher))?.show, true);
});

test("answers save with optimistic versions; an older tab gets STALE_VERSION; foreign rows are refused", async () => {
  const { schoolId, campusId } = await school();
  const teacher = await person(schoolId, campusId, "TEACHER");
  const klass = await db.class.create({ data: { schoolId, campusId, name: "7", section: "B", academicYear: 2026, status: "ACTIVE", classTeacherId: teacher.userId } });
  await db.subject.create({ data: { schoolId, campusId, classId: klass.id, name: "Mathematics", teacherId: teacher.userId, totalMarks: 50 } });
  const sheet = await getSheet(teacher, "teacher", "en");
  const { version } = await saveAnswers(teacher, "teacher", { version: sheet.version, answers: { preferredLanguage: "ur" }, confirmedKeys: ["preferredLanguage"] });
  assert.equal(version, sheet.version + 1);
  await assert.rejects(saveAnswers(teacher, "teacher", { version: sheet.version, answers: { preferredLanguage: "ar" }, confirmedKeys: ["preferredLanguage"] }), code("STALE_VERSION"));
  await assert.rejects(saveAnswers(teacher, "teacher", { version, answers: { classTests: { "not-mine": { date: "2030-01-01", totalMarks: 20 } } }, confirmedKeys: ["classTests"] }), code("INVALID_INPUT"));
  await assert.rejects(saveAnswers(teacher, "teacher", { version, answers: { nonsense: 1 }, confirmedKeys: [] }), code("INVALID_INPUT"));
});

test("Build compiles confirmed answers with no model call, runs class A, and a second Build reopens the same job", async () => {
  const { schoolId, campusId } = await school();
  const teacher = await person(schoolId, campusId, "TEACHER");
  const klass = await db.class.create({ data: { schoolId, campusId, name: "8", section: "A", academicYear: 2026, status: "ACTIVE", classTeacherId: teacher.userId } });
  const subject = await db.subject.create({ data: { schoolId, campusId, classId: klass.id, name: "Science", teacherId: teacher.userId, totalMarks: 50 } });
  const topic = await db.syllabusTopic.create({ data: { schoolId, subjectId: subject.id, title: "Cells", order: 1 } });
  const sheet = await getSheet(teacher, "teacher", "en");
  const answers = { assignmentCheck: "CORRECT", preferredLanguage: "ur", focusAreas: ["REGISTER", "HOMEWORK"], startingUnits: { [subject.id]: topic.id } };
  const { version } = await saveAnswers(teacher, "teacher", { version: sheet.version, answers, confirmedKeys: Object.keys(answers) });
  const ready = await getSheet(teacher, "teacher", "en");
  assert.deepEqual(ready.willCreate.map(item => item.capabilityKey).sort(), ["personal.save_plan", "profile.update", "work.save"]);

  const run = await buildSetup(teacher, "teacher", { version, language: "en" });
  assert.equal(run.status, "COMPLETED");
  assert.deepEqual(run.steps.map(step => step.state), ["saved", "saved", "draft"], JSON.stringify(run.steps.map(step => [step.capabilityKey, step.errorCode])));
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: teacher.userId } })).preferredLanguage, "ur");
  assert.equal(await db.aiWorkflowEvent.count({ where: { jobId: run.id, type: "MODEL_ATTEMPT_STARTED" } }), 0, "no model call");
  assert.equal((await db.aiSetupResponse.findFirstOrThrow({ where: { userId: teacher.userId } })).status, "READY");
  assert.equal((await buildSetup(teacher, "teacher", { version, language: "en" })).id, run.id, "a second tab or retry reopens the same job");
  assert.equal((await setupStatus(teacher))?.show, false);

  // Editing an answer and building again replays what already saved instead of writing it twice.
  const edited = await saveAnswers(teacher, "teacher", { version, answers: { focusAreas: ["REGISTER", "HOMEWORK", "TESTS"] }, confirmedKeys: Object.keys(answers) });
  const again = await buildSetup(teacher, "teacher", { version: edited.version, language: "en" });
  assert.notEqual(again.id, run.id);
  assert.ok(!again.steps.some(step => step.capabilityKey === "profile.update"), "the language already matches the profile, so nothing is re-applied");
  assert.equal(again.steps.find(step => step.capabilityKey === "work.save")!.receipt?.replayed, true, "an unchanged answer replays its receipt");
  assert.equal(await db.schoolAiRecord.count({ where: { schoolId, kind: "WORKFLOW" } }), 1, "the teaching plan is not created twice");
});
