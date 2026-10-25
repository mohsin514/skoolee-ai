import { redis } from "../../src/lib/queue/connection";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../../src/lib/db/prisma";
import type { AuthUser } from "../../src/lib/auth";
import { startJob, savePlan, advanceJob, getJob, eventsAfter, cancelJob } from "../../src/lib/ai-workflows/jobs/job-service";
import { sweepWorkflowJobs } from "../../src/lib/ai-workflows/jobs/worker";
import { aiWorkflowsDestination } from "./support/destination.mjs";
aiWorkflowsDestination();
const db = new PrismaClient(), schools: string[] = [];
after(async () => { await db.school.deleteMany({ where: { id: { in: schools } } }); await db.$disconnect(); await prisma.$disconnect(); redis.disconnect(); });

async function fixture(role: AuthUser["role"] = "CAMPUS_ADMIN") {
  const schoolId = `wf-${randomUUID()}`, campusId = randomUUID(), userId = randomUUID(); schools.push(schoolId);
  await db.school.create({ data: { id: schoolId, slug: schoolId, regId: schoolId, name: "Synthetic workflow school", contactEmail: `${schoolId}@example.invalid`, city: "Test", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, regId: campusId, name: "Synthetic campus", city: "Test" } });
  await db.user.create({ data: { id: userId, schoolId, campusId, email: `${userId}@example.invalid`, fullName: "Synthetic tester", role, isActive: true } });
  await db.academicCycle.create({ data: { schoolId, campusId, academicYear: 2026, label: "2026", status: "ACTIVE" } });
  const user: AuthUser = { schoolId, campusId, userId, role, email: `${userId}@example.invalid`, accessVersion: 0 };
  return { user, schoolId, campusId };
}
const start = (user: AuthUser, message = "Set my language to Urdu") => startJob(user, { message, language: "en", idempotencyKey: `k-${randomUUID()}` });

test("start is idempotent per key; a different request under the same key is refused", async () => {
  const { user } = await fixture();
  const key = `k-${randomUUID()}`;
  const first = await startJob(user, { message: "Add a holiday", language: "en", idempotencyKey: key });
  const again = await startJob(user, { message: "Add a holiday", language: "en", idempotencyKey: key });
  assert.equal(again.id, first.id);
  await assert.rejects(startJob(user, { message: "Something else", language: "en", idempotencyKey: key }), { code: "KEY_CONFLICT" });
  assert.equal(await db.aiWorkflowSegment.count({ where: { jobId: first.id } }), 1, "the user's words are stored once as evidence");
});

test("a class A step runs once through the intent ledger and its receipt is replayed, never re-written", async () => {
  const { user } = await fixture("TEACHER");
  const job = await start(user);
  await savePlan(user, job.id, [{ stepKey: "s1", capabilityKey: "profile.update", input: { preferredLanguage: "ur" } }]);
  const done = await advanceJob(user, job.id);
  assert.equal(done.status, "COMPLETED");
  assert.equal(done.outcome, "EXECUTED");
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: user.userId } })).preferredLanguage, "ur");
  const intent = await db.aiWorkflowIntent.findFirstOrThrow({ where: { jobId: job.id } });
  assert.equal(intent.state, "COMMITTED");
  // Simulate a crash after commit: the step is put back to PENDING; advancing must replay, not write again.
  await db.aiWorkflowStep.updateMany({ where: { jobId: job.id }, data: { status: "PENDING" } });
  await db.aiWorkflowJob.update({ where: { id: job.id }, data: { status: "RUNNING" } });
  await advanceJob(user, job.id);
  const step = await db.aiWorkflowStep.findFirstOrThrow({ where: { jobId: job.id } });
  assert.equal((step.receipt as { replayed?: boolean }).replayed, true);
  assert.equal(await db.aiWorkflowIntent.count({ where: { jobId: job.id } }), 1);
  assert.equal(await db.schoolAiRequest.count({ where: { schoolId: user.schoolId, feature: "AUTOMATIC_ACTION_V1" } }), 1, "the domain receipt was written once");
});

test("class B waits for confirmation and is never run by advance or the worker", async () => {
  const { user, schoolId } = await fixture();
  const job = await start(user, "Add room 101");
  await savePlan(user, job.id, [{ stepKey: "rooms", capabilityKey: "setup.rooms", input: { operation: "setup.apply_changes", action: "ROOMS", sourceReference: "Add room 101", rows: [{ roomNumber: "101", roomType: "CLASSROOM", rows: 5, benchesPerRow: 4, seatsPerBench: 2, examSeatsPerBench: 1, building: "Main" }] } }]);
  const waiting = await advanceJob(user, job.id);
  assert.equal(waiting.status, "WAITING_CONFIRM");
  const step = await db.aiWorkflowStep.findFirstOrThrow({ where: { jobId: job.id } });
  assert.equal(step.status, "WAITING_CONFIRM");
  assert.ok(step.previewHash && step.inputHash && step.previewVersion === 1);
  await db.aiWorkflowJob.update({ where: { id: job.id }, data: { status: "RUNNING" } });
  await sweepWorkflowJobs(db);
  assert.equal(await db.classRoom.count({ where: { schoolId } }), 0, "nothing was created without the user's confirmation");
  assert.equal((await db.aiWorkflowStep.findFirstOrThrow({ where: { jobId: job.id } })).status, "WAITING_CONFIRM");
});

test("class C prepares one hand-off for the deciding screen and the job reports awaiting approval, not done", async () => {
  const { user } = await fixture();
  const job = await start(user, "Remove the 12 November holiday");
  const holiday = await db.holiday.create({ data: { schoolId: user.schoolId, campusId: user.campusId!, name: "Iqbal Day", fromDate: new Date("2026-11-12"), toDate: new Date("2026-11-12") } });
  await savePlan(user, job.id, [{ stepKey: "del", capabilityKey: "setup.holidays_delete", input: { operation: "setup.apply_changes", action: "HOLIDAYS", sourceReference: "Remove the holiday", rows: [{ calendarAction: "DELETE", academicYear: 2026, holidayId: holiday.id }] } }]);
  const first = await advanceJob(user, job.id);
  assert.equal(first.status, "WAITING_HANDOFF");
  await advanceJob(user, job.id);
  const handoffs = await db.aiWorkflowHandoff.findMany({ where: { jobId: job.id } });
  assert.equal(handoffs.length, 1);
  assert.equal(handoffs[0].kind, "RECORD_APPROVAL");
  assert.equal(handoffs[0].originUserId, user.userId);
  assert.equal(await db.holiday.count({ where: { id: holiday.id } }), 1, "the holiday is untouched until someone approves on the calendar screen");
  const record = await db.schoolAiRecord.findUniqueOrThrow({ where: { id: handoffs[0].recordId! } });
  assert.notEqual(record.status, "APPROVED", "the AI never approves its own class-C proposal");
});

test("a dependent step is skipped when its prerequisite cannot run; outcome stays honest", async () => {
  const { user } = await fixture("TEACHER");
  const job = await start(user);
  await savePlan(user, job.id, [
    { stepKey: "a", capabilityKey: "students.create", input: { students: [] } },
    { stepKey: "b", capabilityKey: "profile.update", dependsOn: ["a"], input: { city: "Lahore" } },
  ]);
  const result = await advanceJob(user, job.id);
  const steps = await db.aiWorkflowStep.findMany({ where: { jobId: job.id }, orderBy: { stepKey: "asc" } });
  assert.notEqual(steps[0].status, "SUCCEEDED");
  assert.ok(["SKIPPED", "PENDING"].includes(steps[1].status));
  assert.notEqual(result.outcome, "EXECUTED");
  assert.notEqual((await db.user.findUniqueOrThrow({ where: { id: user.userId } })).city, "Lahore", "the dependent change did not run");
});

test("access changed since start: the worker blocks the job without running anything", async () => {
  const { user } = await fixture("TEACHER");
  const job = await start(user);
  await savePlan(user, job.id, [{ stepKey: "s1", capabilityKey: "profile.update", input: { city: "Karachi" } }]);
  await db.user.update({ where: { id: user.userId }, data: { accessVersion: { increment: 1 } } });
  await sweepWorkflowJobs(db);
  const blocked = await db.aiWorkflowJob.findUniqueOrThrow({ where: { id: job.id } });
  assert.equal(blocked.status, "BLOCKED");
  assert.equal(blocked.errorCode, "ACCESS_CHANGED");
  assert.notEqual((await db.user.findUniqueOrThrow({ where: { id: user.userId } })).city, "Karachi");
});

test("only the job's own actor reads its events; payloads carry no free text", async () => {
  const { user, schoolId, campusId } = await fixture("TEACHER");
  const job = await start(user);
  const other = randomUUID();
  await db.user.create({ data: { id: other, schoolId, campusId, email: `${other}@example.invalid`, fullName: "Other teacher", role: "TEACHER", isActive: true } });
  const intruder: AuthUser = { ...user, userId: other, email: `${other}@example.invalid` };
  await assert.rejects(eventsAfter(intruder, job.id, 0), { code: "NOT_FOUND" });
  await assert.rejects(getJob(intruder, job.id), { code: "NOT_FOUND" });
  const { events } = await eventsAfter(user, job.id, 0);
  assert.equal(events[0].type, "JOB_STARTED");
  for (const event of events) assert.doesNotMatch(JSON.stringify(event.payload), /Urdu|language/i);
});

test("cancel stops what has not run and is version-checked", async () => {
  const { user } = await fixture();
  const job = await start(user, "Add room 102");
  await savePlan(user, job.id, [{ stepKey: "rooms", capabilityKey: "setup.rooms", input: { operation: "setup.apply_changes", action: "ROOMS", sourceReference: "Add room 102", rows: [{ roomNumber: "102", roomType: "CLASSROOM", rows: 5, benchesPerRow: 4, seatsPerBench: 2, examSeatsPerBench: 1, building: "Main" }] } }]);
  const waiting = await advanceJob(user, job.id);
  await assert.rejects(cancelJob(user, job.id, waiting.version - 1), { code: "STALE_VERSION" });
  const cancelled = await cancelJob(user, job.id, waiting.version);
  assert.equal(cancelled.status, "CANCELLED");
  assert.equal((await db.aiWorkflowStep.findFirstOrThrow({ where: { jobId: job.id } })).status, "CANCELLED");
});

test("practice mode in production refuses the write and says so; the flag off stops new requests (drain)", async () => {
  const { user } = await fixture("TEACHER");
  const job = await start(user, "Set my city to Quetta");
  await savePlan(user, job.id, [{ stepKey: "s1", capabilityKey: "profile.update", input: { city: "Quetta" } }]);
  const env = { NODE_ENV: process.env.NODE_ENV, V2: process.env.AI_WORKFLOWS_V2 };
  try {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    process.env.AI_WORKFLOWS_V2 = "all";
    await advanceJob(user, job.id);
    const step = await db.aiWorkflowStep.findFirstOrThrow({ where: { jobId: job.id } });
    assert.equal(step.errorCode, "PRACTICE_MODE");
    assert.notEqual((await db.user.findUniqueOrThrow({ where: { id: user.userId } })).city, "Quetta");
    process.env.AI_WORKFLOWS_V2 = "off";
    await assert.rejects(start(user, "Anything"), { code: "NOT_CONNECTED" });
  } finally {
    (process.env as Record<string, string | undefined>).NODE_ENV = env.NODE_ENV;
    if (env.V2 === undefined) delete process.env.AI_WORKFLOWS_V2; else process.env.AI_WORKFLOWS_V2 = env.V2;
  }
});

test("a forged stored platform plan cannot resolve or read platform records for a student", async () => {
  const { user } = await fixture("STUDENT");
  const job = await start(user, "Show all schools");
  await savePlan(user, job.id, [{ stepKey: "s1", capabilityKey: "platform.inspect", input: {} }]);
  await advanceJob(user, job.id);
  const step = await db.aiWorkflowStep.findFirstOrThrow({ where: { jobId: job.id } });
  assert.equal(step.errorCode, "ROLE_NOT_ALLOWED");
  assert.equal(step.receipt, null);
  assert.equal(await db.aiWorkflowIntent.count({ where: { jobId: job.id } }), 0);
});

test("invalid saved input always produces a visible question instead of an empty NEEDS_INPUT state", async () => {
  const { user } = await fixture("TEACHER");
  const job = await start(user);
  await savePlan(user, job.id, [{ stepKey: "s1", capabilityKey: "profile.update", input: { preferredLanguage: "invalid-language" } }]);
  const waiting = await advanceJob(user, job.id);
  assert.equal(waiting.status, "NEEDS_INPUT");
  const questions = await db.aiWorkflowQuestion.findMany({ where: { jobId: job.id, status: "OPEN" } });
  assert.ok(questions.length > 0);
  assert.ok(questions.some(question => question.pointer === "/preferredLanguage"));
});
