import { redis } from "../../src/lib/queue/connection";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../../src/lib/db/prisma";
import type { AuthUser } from "../../src/lib/auth";
import { startJob, savePlan, advanceJob } from "../../src/lib/ai-workflows/jobs/job-service";
import { runCommand } from "../../src/lib/ai-workflows/jobs/commands";
import { capabilityContext, inTenant } from "../../src/lib/ai-workflows/jobs/actor";
import { capability } from "../../src/lib/ai-workflows/registry";
import { InputRequired, WorkflowError } from "../../src/lib/ai-workflows/errors";
import type { ExecEntry, PreviewModel } from "../../src/lib/ai-workflows/registry/types";
import { TEACHER_ATTENDANCE_ENTRIES, negatesStatus, type SaveRegisterInput } from "../../src/lib/ai-workflows/registry/domains/teacher/attendance";
import { schoolToday } from "../../src/lib/datetime";
import { aiWorkflowsDestination } from "./support/destination.mjs";
aiWorkflowsDestination();
const db = new PrismaClient(), schools: string[] = [];
after(async () => {
  for (const schoolId of schools) {
    await db.notification.deleteMany({ where: { schoolId } });
    await db.attendanceEditHistory.deleteMany({ where: { schoolId } });
    await db.attendance.deleteMany({ where: { schoolId } });
    await db.studentEnrollment.deleteMany({ where: { schoolId } });
  }
  await db.school.deleteMany({ where: { id: { in: schools } } });
  await db.$disconnect(); await prisma.$disconnect(); redis.disconnect();
});

/**
 * Slice 2 teacher attendance: "7B register: Ali and Sara absent" saves two absences and leaves the rest
 * unmarked; only the person's own "Mark the other N present" marks anyone else.
 */
const DATE = "2026-10-21"; // a Wednesday in the past: a working day for any weekend rule
const entry = (key: string) => TEACHER_ATTENDANCE_ENTRIES.find(item => item.key === key) as ExecEntry<SaveRegisterInput>;
const save = entry("attendance.mark_class");
const wired = Boolean(capability("attendance.mark_class"));

async function fixture(pupils = ["Ali Raza", "Sara Khan", "Hamza Iqbal", "Zainab Noor", "Bilal Ahmed"]) {
  const schoolId = `teacher-att-${randomUUID()}`, campusId = randomUUID(), teacherId = randomUUID(), otherId = randomUUID(), principalId = randomUUID(); schools.push(schoolId);
  await db.school.create({ data: { id: schoolId, slug: schoolId, regId: schoolId, name: "Synthetic attendance school", contactEmail: `${schoolId}@example.invalid`, city: "Test", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, regId: campusId, name: "Synthetic campus", city: "Test" } });
  await db.user.createMany({ data: [[teacherId, "TEACHER"], [otherId, "TEACHER"], [principalId, "PRINCIPAL"]].map(([id, role]) => ({ id, schoolId, campusId, email: `${id}@example.invalid`, fullName: `Synthetic ${role}`, role: role as "TEACHER" | "PRINCIPAL", isActive: true })) });
  await db.academicCycle.create({ data: { schoolId, campusId, academicYear: 2026, label: "2026", status: "ACTIVE", startDate: new Date("2026-01-01Z"), endDate: new Date("2026-12-31Z") } });
  const klass = await db.class.create({ data: { schoolId, campusId, name: "7", section: "B", academicYear: 2026, status: "ACTIVE", classTeacherId: teacherId } });
  const foreign = await db.class.create({ data: { schoolId, campusId, name: "8", section: "A", academicYear: 2026, status: "ACTIVE", classTeacherId: otherId } });
  const students = [];
  for (const [index, fullName] of pupils.entries()) {
    students.push(await db.student.create({ data: { schoolId, campusId, classId: klass.id, fullName, rollNo: String(index + 1), gender: "OTHER", enrollmentDate: new Date("2026-01-01Z") } }));
  }
  const outsider = await db.student.create({ data: { schoolId, campusId, classId: foreign.id, fullName: "Ali Outsider", rollNo: "901", gender: "OTHER", enrollmentDate: new Date("2026-01-01Z") } });
  const user: AuthUser = { schoolId, campusId, userId: teacherId, role: "TEACHER", email: `${teacherId}@example.invalid`, fullName: "Synthetic TEACHER", accessVersion: 0 };
  return { user, schoolId, campusId, klass, foreign, students, outsider };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

const ctxFor = (f: Fixture, locale: "en" | "ar" | "ur" = "en") => inTenant(f.user, () => capabilityContext(f.user, f.campusId, locale));
const as = <T>(f: Fixture, work: () => Promise<T>) => inTenant(f.user, work);
const register = (f: Fixture, entries: SaveRegisterInput["entries"], classId = f.klass.id, date = DATE): SaveRegisterInput => save.input.parse({ classId, date, entries });
const submitted = (f: Fixture) => db.notification.count({ where: { schoolId: f.schoolId, type: "ATTENDANCE_SUBMITTED" } });
const twoAbsent = (f: Fixture) => register(f, [{ student: "Ali", status: "ABSENT", said: "Ali absent" }, { student: "Sara", status: "ABSENT", said: "Sara absent" }]);

// ── Negation guard (pure, golden) ───────────────────────────────────────────────────────────────────
test("negation guard: English", () => {
  assert.equal(negatesStatus("Ali absent", "ABSENT"), false);
  assert.equal(negatesStatus("Ali isn't here today", "ABSENT"), false, "a negated presence is an absence");
  assert.equal(negatesStatus("Sara is not absent", "ABSENT"), true);
  assert.equal(negatesStatus("Hamza isn't on leave", "LEAVE"), true);
  assert.equal(negatesStatus("Ali present", "ABSENT"), true, "words for another status do not support this one");
});
test("negation guard: Urdu (غیر حاضر means absent; غیر حاضر نہیں means not absent)", () => {
  assert.equal(negatesStatus("علی غیر حاضر", "ABSENT"), false);
  assert.equal(negatesStatus("علی غیرحاضر ہے", "ABSENT"), false);
  assert.equal(negatesStatus("علی غائب ہے", "ABSENT"), false);
  assert.equal(negatesStatus("علی حاضر نہیں", "ABSENT"), false);
  assert.equal(negatesStatus("سارہ غیر حاضر نہیں", "ABSENT"), true);
  assert.equal(negatesStatus("سارہ غائب نہیں تھی", "ABSENT"), true);
  assert.equal(negatesStatus("حمزہ چھٹی پر نہیں", "LEAVE"), true);
  assert.equal(negatesStatus("ali ghair hazir nahi", "ABSENT"), true);
});
test("negation guard: Arabic", () => {
  assert.equal(negatesStatus("علي غائب", "ABSENT"), false);
  assert.equal(negatesStatus("علي غير حاضر", "ABSENT"), false);
  assert.equal(negatesStatus("سارة ليست غائبة", "ABSENT"), true);
  assert.equal(negatesStatus("علي غير غائب", "ABSENT"), true);
  assert.equal(negatesStatus("حمزة لا إجازة له", "LEAVE"), true);
});

// ── Direct entry calls (until the lead wires the registry) ──────────────────────────────────────────
test("teacher saves two absences: two ABSENT rows, the rest unmarked, one ATTENDANCE_SUBMITTED", async () => {
  const f = await fixture(), ctx = await ctxFor(f);
  const bound = await as(f, () => save.resolve!(ctx, twoAbsent(f)));
  assert.deepEqual(bound.entries.map(item => item.studentId), [f.students[0].id, f.students[1].id]);
  const preview = await as(f, () => save.preview!(ctx, bound));
  assert.deepEqual(preview.counts, { marked: 2, unmarked: 3, present: 0, absent: 2, leave: 0 });
  assert.deepEqual(preview.lines.slice(0, 2).map(line => line.value), ["Absent", "Absent"]);
  assert.deepEqual(preview.actions, [{ id: "rest-present", label: "Mark the other 3 present", patch: { remaining: "PRESENT" }, expect: 3 }]);
  assert.match(preview.confirmLabel!, /^Save register · 0 present, 2 absent/);
  const receipt = await as(f, () => save.execute(ctx, bound, { idempotencyKey: "k1" }));
  assert.equal(receipt.kind, "write");
  assert.equal(await db.attendance.count({ where: { schoolId: f.schoolId, status: "ABSENT" } }), 2);
  assert.equal(await db.attendance.count({ where: { schoolId: f.schoolId } }), 2, "unmentioned pupils stay unmarked");
  assert.equal(await submitted(f), 1, "exactly one ATTENDANCE_SUBMITTED (one recipient)");
});

test("rest-present: the person's patch marks every other pupil present", async () => {
  const f = await fixture(), ctx = await ctxFor(f, "ur");
  const bound = await as(f, () => save.resolve!(ctx, twoAbsent(f)));
  const first = await as(f, () => save.preview!(ctx, bound));
  assert.equal(first.actions?.[0].label, "باقی 3 کو حاضر لگائیں");
  const patched = await as(f, () => save.resolve!(ctx, save.input.parse({ ...bound, ...first.actions![0].patch })));
  const second: PreviewModel = await as(f, () => save.preview!(ctx, patched));
  assert.equal(second.actions, undefined);
  assert.deepEqual(second.counts, { marked: 5, unmarked: 0, present: 3, absent: 2, leave: 0 });
  await as(f, () => save.execute(ctx, patched, { idempotencyKey: "k2" }));
  assert.equal(await db.attendance.count({ where: { schoolId: f.schoolId, classId: f.klass.id } }), 5);
  assert.equal(await db.attendance.count({ where: { schoolId: f.schoolId, status: "PRESENT" } }), 3);
  assert.equal(await submitted(f), 1);
});

test("a concurrent mark changes the preview hash basis", async () => {
  const f = await fixture(), ctx = await ctxFor(f);
  const bound = await as(f, () => save.resolve!(ctx, twoAbsent(f)));
  const before = await as(f, () => save.preview!(ctx, bound));
  const enrollment = await db.studentEnrollment.findFirstOrThrow({ where: { studentId: f.students[4].id } });
  await db.attendance.create({ data: { schoolId: f.schoolId, campusId: f.campusId, classId: f.klass.id, studentId: f.students[4].id, enrollmentId: enrollment.id, date: new Date(`${DATE}T00:00:00Z`), status: "PRESENT" } });
  const after = await as(f, () => save.preview!(ctx, bound));
  assert.notDeepEqual(after.basis, before.basis);
  assert.equal(after.actions?.[0].expect, 2, "an already-marked pupil is not re-marked by rest-present");
});

test("a future day is refused (DOMAIN_REFUSED) and nothing is written", async () => {
  const f = await fixture(), ctx = await ctxFor(f);
  const today = await as(f, () => schoolToday(f.schoolId, f.campusId));
  const future = new Date(Date.parse(`${today}T00:00:00Z`) + 3 * 86_400_000).toISOString().slice(0, 10);
  const bound = await as(f, () => save.resolve!(ctx, register(f, [{ student: "Ali", status: "ABSENT", said: "Ali absent" }], f.klass.id, future)));
  await assert.rejects(as(f, () => save.preview!(ctx, bound)), (error: unknown) => error instanceof WorkflowError && error.code === "DOMAIN_REFUSED");
  await assert.rejects(as(f, () => save.execute(ctx, bound, { idempotencyKey: "k3" })), (error: unknown) => error instanceof WorkflowError && error.code === "DOMAIN_REFUSED");
  assert.equal(await db.attendance.count({ where: { schoolId: f.schoolId } }), 0);
});

test("a foreign class gives SCOPE_DENIED and zero rows", async () => {
  const f = await fixture(), ctx = await ctxFor(f);
  const foreign = register(f, [{ student: "Ali", status: "ABSENT", said: "Ali absent" }], f.foreign.id);
  await assert.rejects(as(f, () => save.resolve!(ctx, foreign)), (error: unknown) => error instanceof WorkflowError && error.code === "SCOPE_DENIED");
  const forged = { ...foreign, entries: [{ ...foreign.entries[0], studentId: f.outsider.id }] };
  await assert.rejects(as(f, () => save.preview!(ctx, forged)), (error: unknown) => error instanceof WorkflowError && error.code === "SCOPE_DENIED");
  await assert.rejects(as(f, () => save.execute(ctx, forged, { idempotencyKey: "k4" })), (error: unknown) => error instanceof WorkflowError && error.code === "SCOPE_DENIED");
  // A forged pupil id on the teacher's own class is refused too.
  const smuggled = { ...register(f, [{ student: "Ali", status: "ABSENT", said: "Ali absent" }]), entries: [{ student: "Ali", status: "ABSENT" as const, said: "Ali absent", studentId: f.outsider.id }] };
  await assert.rejects(as(f, () => save.execute(ctx, smuggled, { idempotencyKey: "k5" })), (error: unknown) => error instanceof WorkflowError && error.code === "STALE_VERSION");
  assert.equal(await db.attendance.count({ where: { schoolId: f.schoolId } }), 0);
});

test("an ambiguous Ali becomes a CHOICE question; a negated quote is asked back", async () => {
  const f = await fixture(["Ali Raza", "Ali Hassan", "Sara Khan"]), ctx = await ctxFor(f);
  const asked = await as(f, () => save.resolve!(ctx, register(f, [{ student: "Ali", status: "ABSENT", said: "Ali absent" }, { student: "Sara", status: "ABSENT", said: "سارہ غیر حاضر نہیں" }]))).catch(error => error);
  assert.ok(asked instanceof InputRequired);
  const choice = asked.fields.find(field => field.pointer === "/entries/0/student");
  assert.equal(choice?.promptKey, "PUPIL_AMBIGUOUS");
  assert.equal(choice?.options?.length, 2);
  assert.equal(asked.fields.find(field => field.pointer === "/entries/1/said")?.promptKey, "PUPIL_NEGATED");
  assert.equal(await db.attendance.count({ where: { schoolId: f.schoolId } }), 0);
});

test("route command: the quick-mark path keeps its summary and raises one notice", async () => {
  const { saveAttendanceRegister } = await import("../../src/lib/attendance/save-register-command");
  const f = await fixture(["Ali Raza", "Sara Khan"]);
  const result = await as(f, () => saveAttendanceRegister(f.user, { classId: f.klass.id, date: DATE, entries: [{ studentId: f.students[0].id, status: "ABSENT" }, { studentId: f.students[1].id, status: "PRESENT" }] }, { notification: "await" }));
  assert.deepEqual(result.summary, { total: 2, present: 1, absent: 1, leave: 0 });
  assert.equal(await submitted(f), 1);
  await assert.rejects(as(f, () => saveAttendanceRegister(f.user, { classId: f.foreign.id, date: DATE, entries: [{ studentId: f.outsider.id, status: "ABSENT" }] })), { status: 404 });
});

test("read.teacher.register_status and read.teacher.today report the teacher's own classes", async () => {
  const f = await fixture(), ctx = await ctxFor(f);
  const status = entry("read.teacher.register_status") as unknown as ExecEntry<{ date?: string }>;
  const before = await as(f, () => status.execute(ctx, { date: DATE }, { idempotencyKey: "r1" }));
  assert.equal(before.kind, "read");
  assert.deepEqual(before.entities, [{ model: "class", id: f.klass.id }], "a foreign class never appears");
  assert.match(String(before.detail?.text), /7 B: not marked yet \(5 pupils\)/);
  const bound = await as(f, () => save.resolve!(ctx, twoAbsent(f)));
  await as(f, () => save.execute(ctx, bound, { idempotencyKey: "k6" }));
  const afterSave = await as(f, () => status.execute(ctx, { date: DATE }, { idempotencyKey: "r2" }));
  assert.match(String(afterSave.detail?.text), /2 of 5 marked, 3 still to mark/);
  const today = entry("read.teacher.today") as unknown as ExecEntry<Record<string, never>>;
  const day = await as(f, () => today.execute(ctx, {}, { idempotencyKey: "r3" }));
  assert.equal(day.kind, "read");
  assert.equal(day.counts.lessons, 0);
  assert.ok(String(day.detail?.text).length > 10);
});

// ── End to end through the runtime (skipped until the registry wires these entries) ─────────────────
async function plan(f: Fixture, input: unknown) {
  const job = await startJob(f.user, { message: "7B register: Ali and Sara absent", language: "en", idempotencyKey: `k-${randomUUID()}` });
  await savePlan(f.user, job.id, [{ stepKey: "s1", capabilityKey: "attendance.mark_class", input }]);
  const current = await advanceJob(f.user, job.id);
  return { job: current, step: await db.aiWorkflowStep.findFirstOrThrow({ where: { jobId: job.id } }) };
}
const confirm = (f: Fixture, jobId: string, jobVersion: number, step: { id: string; previewVersion: number; previewHash: string | null; inputHash: string | null }) =>
  runCommand(f.user, jobId, { type: "confirm", jobVersion, clientCommandId: `c-${randomUUID()}`, steps: [{ stepId: step.id, previewVersion: step.previewVersion, previewHash: step.previewHash!, inputHash: step.inputHash! }] }, null);
const modelInput = (f: Fixture) => ({ classId: f.klass.id, date: DATE, entries: [{ student: "Ali", status: "ABSENT", said: "Ali absent" }, { student: "Sara", status: "ABSENT", said: "Sara absent" }] });

test("e2e: plan → preview → amend rest-present → confirm marks every pupil once", { skip: !wired && "attendance.mark_class is not wired into the registry yet" }, async () => {
  const f = await fixture();
  const { job, step } = await plan(f, modelInput(f));
  assert.equal(step.status, "WAITING_CONFIRM");
  assert.equal((step.boundInput as SaveRegisterInput).remaining, "UNMARKED");
  const action = (step.preview as unknown as PreviewModel).actions![0];
  assert.deepEqual([action.id, action.expect], ["rest-present", 3]);
  const amended = await runCommand(f.user, job.id, { type: "amend", jobVersion: job.version, stepId: step.id, previewVersion: step.previewVersion, actionId: action.id, expect: action.expect }, null);
  const fresh = await db.aiWorkflowStep.findFirstOrThrow({ where: { id: step.id } });
  assert.equal((fresh.boundInput as SaveRegisterInput).remaining, "PRESENT");
  assert.deepEqual((fresh.preview as unknown as PreviewModel).counts, { marked: 5, unmarked: 0, present: 3, absent: 2, leave: 0 });
  await confirm(f, job.id, amended.version, fresh);
  assert.equal((await db.aiWorkflowStep.findFirstOrThrow({ where: { id: step.id } })).status, "SUCCEEDED");
  assert.equal(await db.attendance.count({ where: { schoolId: f.schoolId } }), 5);
  assert.equal(await submitted(f), 1, "exactly one ATTENDANCE_SUBMITTED");
});

test("e2e: two absences saved after confirm, the rest unmarked; a future day and a foreign class fail the step", { skip: !wired && "attendance.mark_class is not wired into the registry yet" }, async () => {
  const f = await fixture();
  const { job, step } = await plan(f, modelInput(f));
  assert.equal(step.status, "WAITING_CONFIRM");
  assert.deepEqual((step.preview as unknown as PreviewModel).actions?.map(action => action.expect), [3]);
  await confirm(f, job.id, job.version, step);
  assert.equal(await db.attendance.count({ where: { schoolId: f.schoolId } }), 2);
  assert.equal(await submitted(f), 1);

  const foreign = await plan(f, { ...modelInput(f), classId: f.foreign.id });
  assert.equal(foreign.step.status, "FAILED");
  assert.equal(foreign.step.errorCode, "SCOPE_DENIED");
  const future = await plan(f, { ...modelInput(f), date: "2099-01-07" });
  assert.equal(future.step.status, "FAILED");
  assert.equal(future.step.errorCode, "DOMAIN_REFUSED");
  assert.equal(await db.attendance.count({ where: { schoolId: f.schoolId } }), 2);
});

test("e2e: an ambiguous Ali asks a CHOICE question", { skip: !wired && "attendance.mark_class is not wired into the registry yet" }, async () => {
  const f = await fixture(["Ali Raza", "Ali Hassan", "Sara Khan"]);
  const { step } = await plan(f, modelInput(f));
  assert.equal(step.status, "NEEDS_INPUT");
  const question = await db.aiWorkflowQuestion.findFirstOrThrow({ where: { stepId: step.id, pointer: "/entries/0/student" } });
  assert.equal(question.kind, "CHOICE");
  assert.equal(await db.attendance.count({ where: { schoolId: f.schoolId } }), 0);
});
