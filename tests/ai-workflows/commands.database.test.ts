import { redis } from "../../src/lib/queue/connection";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../../src/lib/db/prisma";
import type { AuthUser } from "../../src/lib/auth";
import { startJob, savePlan, advanceJob } from "../../src/lib/ai-workflows/jobs/job-service";
import { runCommand } from "../../src/lib/ai-workflows/jobs/commands";
import { runExecStep } from "../../src/lib/ai-workflows/executor/step-runner";
import { observeHandoffs, handoffsFor, claimHandoff } from "../../src/lib/ai-workflows/executor/handoff";
import { capabilityContext, inTenant } from "../../src/lib/ai-workflows/jobs/actor";
import { EscalationRequired } from "../../src/lib/ai-workflows/errors";
import type { ExecEntry } from "../../src/lib/ai-workflows/registry/types";
import { aiWorkflowsDestination } from "./support/destination.mjs";
aiWorkflowsDestination();
const db = new PrismaClient(), schools: string[] = [];
after(async () => { await db.school.deleteMany({ where: { id: { in: schools } } }); await db.$disconnect(); await prisma.$disconnect(); redis.disconnect(); });

async function fixture(role: AuthUser["role"] = "CAMPUS_ADMIN") {
  const schoolId = `cmd-${randomUUID()}`, campusId = randomUUID(), userId = randomUUID(); schools.push(schoolId);
  await db.school.create({ data: { id: schoolId, slug: schoolId, regId: schoolId, name: "Synthetic command school", contactEmail: `${schoolId}@example.invalid`, city: "Test", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, regId: campusId, name: "Synthetic campus", city: "Test" } });
  await db.user.create({ data: { id: userId, schoolId, campusId, email: `${userId}@example.invalid`, fullName: "Synthetic admin", role, isActive: true } });
  await db.academicCycle.create({ data: { schoolId, campusId, academicYear: 2026, label: "2026", status: "ACTIVE" } });
  const user: AuthUser = { schoolId, campusId, userId, role, email: `${userId}@example.invalid`, accessVersion: 0 };
  return { user, schoolId, campusId };
}
const room = (number: string) => ({ operation: "setup.apply_changes", action: "ROOMS", sourceReference: `Add room ${number}`, rows: [{ roomNumber: number, roomType: "CLASSROOM", rows: 5, benchesPerRow: 4, seatsPerBench: 2, examSeatsPerBench: 1, building: "Main" }] });

async function waitingRoomJob(user: AuthUser, number: string) {
  const job = await startJob(user, { message: `Add room ${number}`, language: "en", idempotencyKey: `k-${randomUUID()}` });
  await savePlan(user, job.id, [{ stepKey: "s1", capabilityKey: "setup.rooms", input: room(number) }]);
  const waiting = await advanceJob(user, job.id);
  const step = await db.aiWorkflowStep.findFirstOrThrow({ where: { jobId: job.id } });
  return { job: waiting, step };
}
const confirmOf = (job: { version: number }, step: { id: string; previewVersion: number; previewHash: string | null; inputHash: string | null }, clientCommandId = `c-${randomUUID()}`) =>
  ({ type: "confirm", jobVersion: job.version, clientCommandId, steps: [{ stepId: step.id, previewVersion: step.previewVersion, previewHash: step.previewHash!, inputHash: step.inputHash! }] });

test("a hash-bound confirmation runs the class B step once; the same click again does not run it twice", async () => {
  const { user, schoolId } = await fixture();
  const { job, step } = await waitingRoomJob(user, "201");
  const command = confirmOf(job, step);
  const done = await runCommand(user, job.id, command, "session-hash");
  assert.equal(done.status, "COMPLETED");
  assert.equal(done.outcome, "EXECUTED");
  assert.equal(await db.classRoom.count({ where: { schoolId, roomNumber: "201" } }), 1);
  await runCommand(user, job.id, command, "session-hash");
  assert.equal(await db.classRoom.count({ where: { schoolId, roomNumber: "201" } }), 1, "a repeated click replays");
  const confirmation = await db.aiWorkflowConfirmation.findFirstOrThrow({ where: { jobId: job.id } });
  assert.equal(confirmation.sessionTokenHash, "session-hash");
  assert.equal(confirmation.inputHash, step.inputHash);
});

test("a confirmation for a different preview, input or job version runs nothing", async () => {
  const { user, schoolId } = await fixture();
  const { job, step } = await waitingRoomJob(user, "202");
  await assert.rejects(runCommand(user, job.id, { ...confirmOf(job, step), steps: [{ stepId: step.id, previewVersion: step.previewVersion, previewHash: "0".repeat(64), inputHash: step.inputHash }] }, null), { code: "STALE_VERSION" });
  await assert.rejects(runCommand(user, job.id, { ...confirmOf(job, step), steps: [{ stepId: step.id, previewVersion: step.previewVersion, previewHash: step.previewHash, inputHash: "f".repeat(64) }] }, null), { code: "STALE_VERSION" });
  await assert.rejects(runCommand(user, job.id, { ...confirmOf(job, step), jobVersion: job.version + 5 }, null), { code: "STALE_VERSION" });
  assert.equal(await db.classRoom.count({ where: { schoolId } }), 0);
});

test("class B cannot run without a confirmation, even if called directly", async () => {
  const { user } = await fixture();
  const { job, step } = await waitingRoomJob(user, "203");
  await assert.rejects(inTenant(user, async () => runExecStep(await capabilityContext(user, user.campusId, "en"), job, step, (await import("../../src/lib/ai-workflows/registry")).capability("setup.rooms") as ExecEntry, room("203"))), { code: "CONFIRM_REQUIRED" });
});

test("a typed answer is not a confirmation: the step keeps waiting", async () => {
  const { user, schoolId } = await fixture();
  const { job } = await waitingRoomJob(user, "204");
  await assert.rejects(runCommand(user, job.id, { type: "answer", jobVersion: job.version, clientCommandId: `c-${randomUUID()}`, text: "yes" }, null), { code: "SUPERSEDED" });
  assert.equal(await db.classRoom.count({ where: { schoolId } }), 0);
});

test("when policy needs a second person, the step becomes a hand-off for an eligible approver and nothing is applied", async () => {
  const { user } = await fixture();
  const { job, step } = await waitingRoomJob(user, "205");
  const escalating: ExecEntry = { ...(await import("../../src/lib/ai-workflows/registry")).capability("setup.rooms") as ExecEntry,
    execute: async () => { throw new EscalationRequired({ kind: "RECORD_APPROVAL", targetRoles: ["PRINCIPAL"], link: "/ai?workflow=schoolSetup", prefill: { recordId: "rec-1", version: 1 } }); } };
  await inTenant(user, async () => runExecStep(await capabilityContext(user, user.campusId, "en"), job, step, escalating, room("205"), { confirmed: true }));
  const after = await db.aiWorkflowStep.findFirstOrThrow({ where: { id: step.id } });
  assert.equal(after.status, "WAITING_HANDOFF");
  assert.equal(after.effectiveClass, "C");
  const handoff = await db.aiWorkflowHandoff.findFirstOrThrow({ where: { stepId: step.id } });
  assert.deepEqual(handoff.targetRoles, ["PRINCIPAL"]);
  assert.equal((await db.aiWorkflowIntent.findFirstOrThrow({ where: { stepId: step.id } })).state, "FAILED");
});

test("a class C hand-off completes only when the deciding screen executes the record; approvers claim it once", async () => {
  const { user, schoolId, campusId } = await fixture();
  const job = await startJob(user, { message: "Remove the 12 November holiday", language: "en", idempotencyKey: `k-${randomUUID()}` });
  const holiday = await db.holiday.create({ data: { schoolId, campusId, name: "Iqbal Day", fromDate: new Date("2026-11-12"), toDate: new Date("2026-11-12") } });
  await savePlan(user, job.id, [{ stepKey: "s1", capabilityKey: "setup.holidays_delete", input: { operation: "setup.apply_changes", action: "HOLIDAYS", sourceReference: "Remove", rows: [{ calendarAction: "DELETE", academicYear: 2026, holidayId: holiday.id }] } }]);
  await advanceJob(user, job.id);
  const handoff = await db.aiWorkflowHandoff.findFirstOrThrow({ where: { jobId: job.id } });
  const approverId = randomUUID();
  await db.user.create({ data: { id: approverId, schoolId, campusId, email: `${approverId}@example.invalid`, fullName: "Synthetic approver", role: "ADMIN", isActive: true } });
  const approver: AuthUser = { schoolId, campusId, userId: approverId, role: "ADMIN", email: `${approverId}@example.invalid`, accessVersion: 0 };
  assert.ok((await inTenant(approver, () => handoffsFor(approver))).some(item => item.id === handoff.id));
  await inTenant(approver, () => claimHandoff(approver, handoff.id));
  const otherId = randomUUID();
  await db.user.create({ data: { id: otherId, schoolId, campusId, email: `${otherId}@example.invalid`, fullName: "Second approver", role: "CAMPUS_ADMIN", isActive: true } });
  const other: AuthUser = { schoolId, campusId, userId: otherId, role: "CAMPUS_ADMIN", email: `${otherId}@example.invalid`, accessVersion: 0 };
  await assert.rejects(inTenant(other, () => claimHandoff(other, handoff.id)), { code: "LEASED" });
  // Nothing has executed yet: observation leaves it open.
  assert.equal(await inTenant(user, async () => observeHandoffs((await db.aiWorkflowJob.findUniqueOrThrow({ where: { id: job.id } })))), 0);
  // The approver's screen executes the record (simulated by the execution row it writes).
  await db.schoolAiExecution.create({ data: { schoolId, campusId, recordId: handoff.recordId!, recordVersion: 1, operation: "setup.apply_changes", requestedById: approverId, idempotencyKey: `e-${randomUUID()}`, previewHash: "a".repeat(64), receipt: {} } });
  const done = await advanceJob(user, job.id);
  assert.equal(done.status, "COMPLETED");
  assert.equal(done.outcome, "EXECUTED", "the approver executed it on their screen");
  const step = await db.aiWorkflowStep.findFirstOrThrow({ where: { jobId: job.id } });
  assert.equal(step.status, "HANDED_OFF_DONE");
  assert.equal((step.receipt as { detail?: { decidedBy?: string } }).detail?.decidedBy, "approver");
});

test("pause and resume are version-checked and resume continues", async () => {
  const { user } = await fixture("TEACHER");
  const job = await startJob(user, { message: "Set my city to Lahore", language: "en", idempotencyKey: `k-${randomUUID()}` });
  await savePlan(user, job.id, [{ stepKey: "s1", capabilityKey: "profile.update", input: { city: "Lahore" } }]);
  const current = await db.aiWorkflowJob.findUniqueOrThrow({ where: { id: job.id } });
  const paused = await runCommand(user, job.id, { type: "pause", jobVersion: current.version }, null);
  assert.equal(paused.status, "PAUSED");
  assert.equal((await advanceJob(user, job.id)).status, "PAUSED", "a paused job does not move");
  const resumed = await runCommand(user, job.id, { type: "resume", jobVersion: paused.version }, null);
  assert.equal(resumed.status, "COMPLETED");
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: user.userId } })).city, "Lahore");
});
