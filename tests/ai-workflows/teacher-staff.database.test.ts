import { redis } from "../../src/lib/queue/connection";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../../src/lib/db/prisma";
import type { AuthUser } from "../../src/lib/auth";
import { capabilityContext, inTenant } from "../../src/lib/ai-workflows/jobs/actor";
import { runGates } from "../../src/lib/ai-workflows/registry/gates";
import { InputRequired, WorkflowError } from "../../src/lib/ai-workflows/errors";
import { TEACHER_STAFF_ENTRIES } from "../../src/lib/ai-workflows/registry/domains/teacher/staff";
import type { CapabilityContext, ExecEntry, HandoffEntry } from "../../src/lib/ai-workflows/registry/types";
import { aiWorkflowsDestination } from "./support/destination.mjs";
aiWorkflowsDestination();
const db = new PrismaClient(), schools: string[] = [];
after(async () => { await db.school.deleteMany({ where: { id: { in: schools } } }); await db.$disconnect(); await prisma.$disconnect(); redis.disconnect(); });

/**
 * Teacher STAFF/SELF entries, exercised directly (resolve → preview → execute) until the lead wires them
 * into the registry: leave, meeting windows, the readiness hand-off and the weekly family digest.
 */
const entry = <T extends ExecEntry<any> | HandoffEntry<any>>(key: string) => TEACHER_STAFF_ENTRIES.find(item => item.key === key) as T;
const exec = (key: string) => entry<ExecEntry<any>>(key);
const KEY = () => `wf-test-${randomUUID()}`;

async function fixture() {
  const schoolId = `staff-${randomUUID()}`, campusId = randomUUID(), otherCampusId = randomUUID(), userId = randomUUID(); schools.push(schoolId);
  await db.school.create({ data: { id: schoolId, slug: schoolId, regId: schoolId, name: "Synthetic staff school", contactEmail: `${schoolId}@example.invalid`, city: "Test", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, regId: campusId, name: "Synthetic campus", city: "Test" } });
  await db.campus.create({ data: { id: otherCampusId, schoolId, regId: otherCampusId, name: "Other campus", city: "Test" } });
  await db.user.create({ data: { id: userId, schoolId, campusId, email: `${userId}@example.invalid`, fullName: "Synthetic teacher", role: "TEACHER", isActive: true } });
  await db.academicCycle.create({ data: { schoolId, campusId, academicYear: 2026, label: "2026", status: "ACTIVE" } });
  const user: AuthUser = { schoolId, campusId, userId, role: "TEACHER", email: `${userId}@example.invalid`, fullName: "Synthetic teacher", accessVersion: 0 };
  return { user, schoolId, campusId, otherCampusId };
}
const ctxFor = (user: AuthUser, campusId: string | null) => capabilityContext(user, campusId, "en");
const within = <T>(user: AuthUser, work: () => Promise<T>) => inTenant(user, work);
const code = async (work: Promise<unknown>) => { try { await work; return "OK"; } catch (error) { return error instanceof WorkflowError ? error.code : error instanceof InputRequired ? `INPUT:${error.fields.map(field => field.pointer).join(",")}` : `THROWN:${(error as Error).message}`; } };
const dayFromNow = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

/** Resolve, preview and execute one exec entry the way a confirmed class-B step does. */
async function confirmRun(ctx: CapabilityContext, key: string, input: unknown) {
  const item = exec(key);
  const parsed = item.input.parse(input);
  const resolved = item.resolve ? await item.resolve(ctx, parsed) : parsed;
  const bound = item.input.parse(resolved);
  const preview = await item.preview!(ctx, bound);
  const receipt = await item.execute(ctx, bound, { idempotencyKey: KEY() });
  return { resolved: bound, preview, receipt };
}

test("all staff entries define and keep their static classes", () => {
  assert.deepEqual(TEACHER_STAFF_ENTRIES.map(item => [item.key, item.class]), [["leave.apply", "B"], ["meetings.open_window", "B"], ["readiness.update_task", "C"], ["digests.prepare", entry("digests.prepare").class], ["digests.send", "C"]]);
  assert.ok(["A", "B"].includes(entry("digests.prepare").class));
  assert.deepEqual(exec("leave.apply").evidence, ["/from", "/to", "/reason"]);
  assert.deepEqual(exec("meetings.open_window").evidence, ["/date", "/start", "/end"]);
});

test("leave: bound to the campus's type, applied once, replay reconciles, overlap and bad dates refused or asked", async () => {
  const { user, schoolId, campusId } = await fixture();
  await db.leaveType.createMany({ data: [{ schoolId, campusId, name: "Sick Leave", defaultDays: 100 }, { schoolId, campusId, name: "Casual Leave", defaultDays: 100 }] });
  const sick = await db.leaveType.findFirstOrThrow({ where: { campusId, name: "Sick Leave" } });
  await db.leaveAllocation.create({ data: { schoolId, campusId, leaveTypeId: sick.id, role: "TEACHER", days: 100, academicYear: 2026 } });
  await within(user, async () => {
    const ctx = await ctxFor(user, campusId);
    const input = { leaveType: "sick", from: "2026-11-03", to: "2026-11-04", reason: "I have a fever" };
    const first = await confirmRun(ctx, "leave.apply", input);
    assert.equal(first.resolved.leaveTypeId, sick.id);
    assert.equal(first.resolved.leaveType, "Sick Leave");
    assert.ok(first.preview.lines.some(line => /reviewer is notified/i.test(line.value) && /approval stays with the reviewer/i.test(line.value)));
    assert.ok(first.preview.lines.some(line => line.value.startsWith("10 / 10")), "the balance is shown as the route computes it");
    assert.equal(first.receipt.counts.requests, 1);
    assert.equal(await db.leaveRequest.count({ where: { schoolId, userId: user.userId } }), 1);

    const replay = await confirmRun(ctx, "leave.apply", input);
    assert.equal(replay.receipt.entities[0].id, first.receipt.entities[0].id);
    assert.equal((replay.receipt.detail as { reconciled?: boolean }).reconciled, true);
    assert.equal(await db.leaveRequest.count({ where: { schoolId, userId: user.userId } }), 1, "a replay never applies twice");

    const leave = exec("leave.apply");
    assert.equal(await code(leave.resolve!(ctx, { leaveType: "casual", from: "2026-11-04", to: "2026-11-06", reason: "Family wedding" })), "DOMAIN_REFUSED", "an overlapping request is refused");
    assert.equal(await code(leave.resolve!(ctx, { leaveType: "casual", from: "2026-11-10", to: "2026-11-08", reason: "Family wedding" })), "INPUT:/to");
    assert.equal(await code(leave.resolve!(ctx, { leaveType: "casual", from: "2026-02-30", to: "2026-03-02", reason: "Family wedding" })), "INPUT:/from");
    const unclear = await leave.resolve!(ctx, { leaveType: "annual", from: "2026-12-01", to: "2026-12-02", reason: "Travel home" }).catch(error => error);
    assert.ok(unclear instanceof InputRequired);
    assert.equal(unclear.fields[0].pointer, "/leaveType");
    assert.deepEqual(unclear.fields[0].options?.map((option: { value: string }) => option.value), ["Casual Leave", "Sick Leave"]);
  });
  assert.equal(await db.leaveRequest.count({ where: { schoolId, userId: user.userId } }), 1);
});

test("meeting window: created with N slots, replay reconciles, an overlap is refused, missing policy asked", async () => {
  const { user, schoolId, campusId } = await fixture();
  await within(user, async () => {
    const ctx = await ctxFor(user, campusId);
    const date = dayFromNow(10);
    const input = { date, start: "14:00", end: "16:00", slotMinutes: 15, mode: "IN_PERSON", location: "Room 12", cancellationPolicy: "Cancel or change from the app up to 2 hours before." };
    const first = await confirmRun(ctx, "meetings.open_window", input);
    assert.equal(first.preview.counts.slots, 8);
    assert.ok(first.preview.lines.some(line => /Families of pupils/.test(line.value)));
    assert.equal(first.receipt.counts.slots, 8);
    assert.equal(await db.meetingWindow.count({ where: { schoolId, teacherId: user.userId } }), 1);

    const replay = await confirmRun(ctx, "meetings.open_window", input);
    assert.equal(replay.receipt.entities[0].id, first.receipt.entities[0].id);
    assert.equal((replay.receipt.detail as { reconciled?: boolean }).reconciled, true);
    assert.equal(await db.meetingWindow.count({ where: { schoolId, teacherId: user.userId } }), 1);

    const window = exec("meetings.open_window");
    assert.equal(await code(window.resolve!(ctx, window.input.parse({ ...input, start: "15:00", end: "17:00" }))), "DOMAIN_REFUSED");
    assert.equal(await code(window.execute(ctx, window.input.parse({ ...input, start: "15:00", end: "17:00" }), { idempotencyKey: KEY() })), "DOMAIN_REFUSED");
    assert.equal(await code(window.resolve!(ctx, window.input.parse({ date, start: "17:00", end: "18:00", slotMinutes: 10, location: "Room 12" }))), "INPUT:/cancellationPolicy");
    assert.equal(await code(window.resolve!(ctx, window.input.parse({ date, start: "17:00", end: "16:00", slotMinutes: 10, mode: "REMOTE", cancellationPolicy: "Any time" }))), "INPUT:/end");
  });
  assert.equal(await db.meetingWindow.count({ where: { schoolId, teacherId: user.userId } }), 1);
});

test("readiness request is a ROLE_TASK hand-off to the academic lead roles, naming no owner", async () => {
  const { user, campusId } = await fixture();
  const task = entry<HandoffEntry<any>>("readiness.update_task");
  assert.equal(task.class, "C");
  assert.equal((task as { execute?: unknown }).execute, undefined);
  await within(user, async () => {
    const ctx = await ctxFor(user, campusId);
    const input = task.input.parse({ request: "I should be the class teacher of 7B, not 7A", topic: "CLASS_ASSIGNMENT" });
    const prepared = await task.handoff.prepare(ctx, await task.resolve!(ctx, input), { idempotencyKey: KEY() });
    assert.equal(prepared.kind, "ROLE_TASK");
    assert.deepEqual([...prepared.targetRoles].sort(), ["ADMIN", "CAMPUS_ADMIN", "PRINCIPAL"]);
    assert.ok(!prepared.targetRoles.includes("TEACHER"), "the teacher never assigns themself");
    assert.ok(!("ownerId" in prepared.prefill));
    assert.equal(prepared.prefill.teacherId, user.userId);
  });
});

test("family digest: draft built for an assigned class, replay converges, a foreign class is SCOPE_DENIED", async () => {
  const { user, schoolId, campusId } = await fixture();
  const mine = await db.class.create({ data: { schoolId, campusId, name: "5", section: "A", academicYear: 2026, status: "ACTIVE", classTeacherId: user.userId } });
  const foreign = await db.class.create({ data: { schoolId, campusId, name: "6", section: "B", academicYear: 2026, status: "ACTIVE" } });
  await db.student.create({ data: { schoolId, campusId, classId: mine.id, fullName: "Synthetic learner", rollNo: "L1", gender: "MALE", status: "active" } });
  await within(user, async () => {
    const ctx = await ctxFor(user, campusId);
    const first = await confirmRun(ctx, "digests.prepare", { classId: mine.id });
    assert.equal(first.receipt.kind, "draft");
    assert.equal(first.receipt.counts.entries, 1);
    assert.equal((first.receipt.detail as { status?: string }).status, "DRAFT");
    const replay = await confirmRun(ctx, "digests.prepare", { classId: mine.id });
    assert.equal(replay.receipt.entities[0].id, first.receipt.entities[0].id);
    assert.equal(await db.familyDigest.count({ where: { schoolId } }), 1);
    assert.equal(await code(exec("digests.prepare").resolve!(ctx, { classId: foreign.id })), "SCOPE_DENIED");
    assert.equal(await code(exec("digests.prepare").execute(ctx, { classId: foreign.id, week: dayFromNow(0) }, { idempotencyKey: KEY() })), "SCOPE_DENIED");

    const send = entry<HandoffEntry<any>>("digests.send");
    const prepared = await send.handoff.prepare(ctx, await send.resolve!(ctx, { classId: mine.id }), { idempotencyKey: KEY() });
    assert.equal(prepared.kind, "DOMAIN_SCREEN");
    assert.equal(prepared.prefill.digestId, first.receipt.entities[0].id);
    assert.equal(await code(send.resolve!(ctx, { classId: foreign.id })), "SCOPE_DENIED");
  });
  assert.equal(await db.familyDigest.count({ where: { schoolId, classId: foreign.id } }), 0);
  assert.equal(await db.familyDigestDelivery.count({ where: { schoolId } }), 0, "nothing is sent");
});

test("a teacher acting on another campus is SCOPE_DENIED and writes nothing", async () => {
  const { user, schoolId, campusId, otherCampusId } = await fixture();
  await db.leaveType.create({ data: { schoolId, campusId: otherCampusId, name: "Sick Leave" } });
  await within(user, async () => {
    const ctx = await ctxFor(user, otherCampusId);
    for (const item of TEACHER_STAFF_ENTRIES) assert.deepEqual(await runGates(ctx, item.gates), { ok: false, code: "SCOPE" }, item.key);
    assert.equal(await code(exec("leave.apply").resolve!(ctx, { leaveType: "sick", from: "2026-11-03", to: "2026-11-03", reason: "Fever" })), "SCOPE_DENIED");
    assert.equal(await code(exec("leave.apply").execute(ctx, { leaveType: "Sick Leave", leaveTypeId: randomUUID(), from: "2026-11-03", to: "2026-11-03", reason: "Fever" }, { idempotencyKey: KEY() })), "SCOPE_DENIED");
    const window = exec("meetings.open_window");
    const input = window.input.parse({ date: dayFromNow(10), start: "14:00", end: "15:00", slotMinutes: 15, mode: "REMOTE", cancellationPolicy: "Any time" });
    assert.equal(await code(window.resolve!(ctx, input)), "SCOPE_DENIED");
    assert.equal(await code(window.execute(ctx, input, { idempotencyKey: KEY() })), "SCOPE_DENIED");
    const task = entry<HandoffEntry<any>>("readiness.update_task");
    assert.equal(await code(task.resolve!(ctx, task.input.parse({ request: "Please assign me to 7B maths" }))), "SCOPE_DENIED");
  });
  assert.equal(await db.leaveRequest.count({ where: { schoolId } }), 0);
  assert.equal(await db.meetingWindow.count({ where: { schoolId } }), 0);
  void campusId;
});
