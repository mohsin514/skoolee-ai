import { redis } from "../../src/lib/queue/connection";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../../src/lib/db/prisma";
import type { AuthUser } from "../../src/lib/auth";
import type { generateAIDraft } from "../../src/lib/ai/openai";
import { startJob, savePlan, advanceJob } from "../../src/lib/ai-workflows/jobs/job-service";
import { runCommand } from "../../src/lib/ai-workflows/jobs/commands";
import { startQuestionnaireJob } from "../../src/lib/ai-workflows/jobs/questionnaire";
import { aiWorkflowsDestination } from "./support/destination.mjs";
aiWorkflowsDestination();
const db = new PrismaClient(), schools: string[] = [];
after(async () => { await db.school.deleteMany({ where: { id: { in: schools } } }); await db.$disconnect(); await prisma.$disconnect(); redis.disconnect(); });

/**
 * The retired engine's 18 acceptance scenarios, re-run through the registry and the new runtime so the
 * cutover keeps every adapter's behaviour: replay safety, role boundaries, no account invitations,
 * private plans, campus scope, and questionnaire version binding.
 */
async function fixture(role: AuthUser["role"]) {
  const schoolId = `parity-${randomUUID()}`, campusId = randomUUID(), userId = randomUUID(); schools.push(schoolId);
  await db.school.create({ data: { id: schoolId, slug: schoolId, regId: schoolId, name: "Synthetic parity school", contactEmail: `${schoolId}@example.invalid`, city: "Test", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, regId: campusId, name: "Synthetic campus", city: "Test" } });
  await db.user.create({ data: { id: userId, schoolId, campusId: role === "APP_OWNER" || role === "SUPER_ADMIN" ? null : campusId, email: `${userId}@example.invalid`, fullName: "Synthetic actor", role, isActive: true } });
  const cycle = await db.academicCycle.create({ data: { schoolId, campusId, academicYear: 2026, label: "2026", status: "ACTIVE" } });
  // A SUPER_ADMIN is a group's institution authority (Slice 8 rebuilt campus.create on the group console rule).
  const user: AuthUser = { schoolId, campusId: role === "APP_OWNER" || role === "SUPER_ADMIN" ? null : campusId, userId, role, email: `${userId}@example.invalid`, accessVersion: 0, ...(role === "SUPER_ADMIN" ? { institutionKind: "GROUP" as const } : {}) };
  return { user, schoolId, campusId, cycle };
}

/** Plans one step, runs A/C, confirms B; returns the step after. */
async function run(user: AuthUser, capabilityKey: string, input: unknown, campusId?: string) {
  const job = await startJob(user, { message: `parity ${capabilityKey}`, language: "en", idempotencyKey: `k-${randomUUID()}`, ...(campusId ? { campusId } : {}) });
  await savePlan(user, job.id, [{ stepKey: "s1", capabilityKey, input }]);
  let current = await advanceJob(user, job.id);
  const waiting = await db.aiWorkflowStep.findFirstOrThrow({ where: { jobId: job.id } });
  if (waiting.status === "WAITING_CONFIRM") {
    current = await runCommand(user, job.id, { type: "confirm", jobVersion: current.version, clientCommandId: `c-${randomUUID()}`, steps: [{ stepId: waiting.id, previewVersion: waiting.previewVersion, previewHash: waiting.previewHash!, inputHash: waiting.inputHash! }] }, null);
  }
  return { job: current, step: await db.aiWorkflowStep.findFirstOrThrow({ where: { jobId: job.id } }) };
}

test("library titles: created once, replayed by content, refused for a teacher", async () => {
  const { user, schoolId } = await fixture("LIBRARIAN");
  const books = { books: [{ title: "Atlas of the World", author: "Collins", copiesTotal: 2 }] };
  assert.equal((await run(user, "library.book_create", books)).step.status, "SUCCEEDED");
  assert.equal(await db.book.count({ where: { schoolId } }), 1);
  const teacher = await fixture("TEACHER");
  const refused = await run(teacher.user, "library.book_create", books).catch(error => error);
  assert.ok(refused instanceof Error || refused.step.status !== "SUCCEEDED", "a teacher cannot create catalogue titles");
  assert.equal(await db.book.count({ where: { schoolId: teacher.schoolId } }), 0);
});

test("students: created after confirmation, guardian email kept as contact only, no accounts invited", async () => {
  const { user, schoolId, campusId } = await fixture("CAMPUS_ADMIN");
  const klass = await db.class.create({ data: { schoolId, campusId, name: "5", section: "A", academicYear: 2026, status: "ACTIVE" } });
  const students = { students: [{ fullName: "Synthetic Pupil", rollNo: "11", classId: klass.id, gender: "FEMALE", guardianPhone: "+923001112223", guardianEmail: "guardian@example.invalid", address: "Street 1", city: "Lahore", medicalNotes: "None reported in this synthetic fixture" }] };
  const { step } = await run(user, "students.create", students);
  assert.equal(step.status, "SUCCEEDED");
  assert.equal(await db.student.count({ where: { schoolId } }), 1);
  assert.equal(await db.user.count({ where: { schoolId, role: "PARENT" } }), 0);
});

test("campus creation belongs to the group administrator and replays", async () => {
  const { user, schoolId } = await fixture("SUPER_ADMIN");
  assert.equal((await run(user, "campus.create", { name: "Gulberg", city: "Lahore" })).step.status, "SUCCEEDED");
  assert.equal(await db.campus.count({ where: { schoolId } }), 2);
  const admin = await fixture("CAMPUS_ADMIN");
  await assert.rejects(savePlan(admin.user, (await startJob(admin.user, { message: "x", language: "en", idempotencyKey: `k-${randomUUID()}` })).id, [{ stepKey: "s1", capabilityKey: "campus.create", input: { name: "X", city: "Y" } }]).then(async () => {
    const job = await db.aiWorkflowJob.findFirstOrThrow({ where: { schoolId: admin.schoolId } });
    await advanceJob(admin.user, job.id);
    const step = await db.aiWorkflowStep.findFirstOrThrow({ where: { jobId: job.id } });
    if (step.status === "SUCCEEDED") throw new Error("campus admin created a campus");
    throw new Error("refused");
  }), /refused/);
  assert.equal(await db.campus.count({ where: { schoolId: admin.schoolId } }), 1);
});

test("calls are logged once per request; a private plan stays private", async () => {
  const reception = await fixture("RECEPTIONIST");
  const call = { name: "Mr Ahmed", phone: "03001234567", direction: "IN", date: "2026-10-20T10:00", purpose: "Admission enquiry", sensitive: false };
  const logged = await run(reception.user, "front_desk.call_log", call);
  assert.equal(logged.step.status, "SUCCEEDED", `${logged.step.errorCode} ${JSON.stringify(logged.step.errorParams)}`);
  assert.equal(await db.phoneCallLog.count({ where: { schoolId: reception.schoolId } }), 1);
  const student = await fixture("STUDENT");
  const plan = { title: "Revision plan", goal: "Prepare for maths", steps: [{ title: "Chapter 1", detail: "Exercises", dueDate: null }] };
  const { step } = await run(student.user, "personal.save_plan", plan);
  assert.equal(step.status, "SUCCEEDED");
  assert.equal((step.receipt as { detail?: { visibility?: string } }).detail?.visibility, "PRIVATE");
});

test("the questionnaire plans from confirmed answers only, waits for confirmation, and stops when the questionnaire changes", async () => {
  const { user, schoolId, campusId } = await fixture("CAMPUS_ADMIN");
  const record = await db.schoolAiRecord.create({ data: { schoolId, campusId, kind: "ONBOARDING", title: "Campus setup", version: 3, status: "DRAFT", createdById: user.userId, updatedById: user.userId, idempotencyKey: `q-${randomUUID()}`, requestHash: "a".repeat(64),
    data: { path: "new", answers: { resources: "Rooms 101 and 102, classrooms with 5 rows of 4 benches", feePolicy: "unconfirmed text" }, confirmedKeys: ["resources"], step: "review" } } });
  const first = await startQuestionnaireJob(user, { recordId: record.id, version: 3, language: "en" });
  const again = await startQuestionnaireJob(user, { recordId: record.id, version: 3, language: "en" });
  assert.equal(again.id, first.id, "a second tab reopens the same job");
  const segments = await db.aiWorkflowSegment.findMany({ where: { jobId: first.id }, orderBy: { ordinal: "asc" } });
  assert.deepEqual(segments.map(segment => segment.fieldKey).filter(Boolean), ["resources"], "unconfirmed answers never reach the plan");
  const prompts: string[] = [];
  const generate: typeof generateAIDraft = async ({ prompt }) => { prompts.push(prompt); return { text: JSON.stringify({ kind: "plan", steps: [{ key: "s1", capability: "setup.rooms", input: { operation: "setup.apply_changes", action: "ROOMS", sourceReference: "Rooms 101 and 102", rows: [{ roomNumber: "101", roomType: "CLASSROOM", rows: 5, benchesPerRow: 4, seatsPerBench: 2, examSeatsPerBench: 1, building: "Main" }] }, evidence: [] }] }), model: "synthetic:test", tokensUsed: 30, promptVersion: "test" }; };
  const waiting = await advanceJob(user, first.id, "request", generate);
  assert.equal(waiting.status, "WAITING_CONFIRM", "nothing applies until the user approves it");
  assert.ok(!prompts[0].includes("unconfirmed text"));
  assert.equal(await db.classRoom.count({ where: { schoolId } }), 0);
  await db.schoolAiRecord.update({ where: { id: record.id }, data: { version: 4 } });
  const blocked = await advanceJob(user, first.id, "request", generate);
  assert.equal(blocked.status, "BLOCKED");
  assert.equal(blocked.errorCode, "STALE_VERSION");
});
