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
import { ADMIN_PEOPLE_ENTRIES } from "../../src/lib/ai-workflows/registry/domains/admin/people";
import type { CapabilityContext, ExecEntry, HandoffEntry } from "../../src/lib/ai-workflows/registry/types";
import { aiWorkflowsDestination } from "./support/destination.mjs";
aiWorkflowsDestination();
const db = new PrismaClient(), schools: string[] = [];
after(async () => {
  const where = { schoolId: { in: schools } };
  await db.admissionApplication.deleteMany({ where });
  await db.admissionFormVersion.deleteMany({ where });
  await db.admissionForm.deleteMany({ where });
  await db.school.deleteMany({ where: { id: { in: schools } } });
  await db.$disconnect(); await prisma.$disconnect(); redis.disconnect();
});

/**
 * ADMIN / CAMPUS_ADMIN people, leave policy and settings entries, exercised directly (resolve → preview →
 * execute, or resolve → prepare) until the lead wires them into the registry.
 */
const entry = <T extends ExecEntry<any> | HandoffEntry<any>>(key: string) => ADMIN_PEOPLE_ENTRIES.find(item => item.key === key) as T;
const exec = (key: string) => entry<ExecEntry<any>>(key);
const handoff = (key: string) => entry<HandoffEntry<any>>(key);
const KEY = () => `wf-test-${randomUUID()}`;

async function fixture(role: "CAMPUS_ADMIN" | "ADMIN" = "CAMPUS_ADMIN", kind: "GROUP" | "STANDALONE" = "GROUP") {
  const schoolId = `people-${randomUUID()}`, campusId = randomUUID(), otherCampusId = randomUUID(), userId = randomUUID(); schools.push(schoolId);
  await db.school.create({ data: { id: schoolId, slug: schoolId, regId: schoolId, name: "Synthetic people school", contactEmail: `${schoolId}@example.invalid`, city: "Test", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, regId: campusId, name: "Synthetic campus", city: "Test" } });
  await db.campus.create({ data: { id: otherCampusId, schoolId, regId: otherCampusId, name: "Other campus", city: "Test" } });
  await db.user.create({ data: { id: userId, schoolId, campusId, email: `${userId}@example.invalid`, fullName: "Synthetic operator", role, isActive: true } });
  await db.academicCycle.create({ data: { schoolId, campusId, academicYear: 2026, label: "2026", status: "ACTIVE" } });
  const user: AuthUser = { schoolId, campusId, userId, role, email: `${userId}@example.invalid`, fullName: "Synthetic operator", accessVersion: 0, institutionKind: kind, isInstitutionOwner: kind === "STANDALONE" && role === "ADMIN" };
  return { user, schoolId, campusId, otherCampusId };
}
const ctxFor = (user: AuthUser, campusId: string | null) => capabilityContext(user, campusId, "en");
const within = <T>(user: AuthUser, work: () => Promise<T>) => inTenant(user, work);
const code = async (work: Promise<unknown>) => { try { await work; return "OK"; } catch (error) { return error instanceof WorkflowError ? error.code : error instanceof InputRequired ? `INPUT:${error.fields.map(field => `${field.pointer}=${field.promptKey}`).join(",")}` : `THROWN:${(error as Error).message}`; } };

async function resolved(ctx: CapabilityContext, key: string, input: unknown) {
  const item = entry(key);
  const parsed = item.input.parse(input);
  return item.input.parse(item.resolve ? await item.resolve(ctx, parsed) : parsed);
}
/** Resolve, preview and execute one exec entry the way a confirmed class-B step does. */
async function confirmRun(ctx: CapabilityContext, key: string, input: unknown) {
  const item = exec(key);
  const bound = await resolved(ctx, key, input);
  const preview = await item.preview!(ctx, bound);
  const receipt = await item.execute(ctx, bound, { idempotencyKey: KEY() });
  return { bound, preview, receipt };
}

test("all people entries define and keep their static classes", () => {
  assert.deepEqual(ADMIN_PEOPLE_ENTRIES.map(item => [item.key, item.class]), [
    ["leave.create_type", "B"], ["leave.create_allocation", "B"], ["chat.update_school_settings", "B"], ["staff.apply_hierarchy_preset", "B"],
    ["staff.invite_send", "C"], ["staff.resend_invitation", "C"], ["guardians.change_access", "C"], ["admissions.decide_application", "C"], ["leave.review", "C"],
  ]);
  for (const item of ADMIN_PEOPLE_ENTRIES) if (item.class === "C") assert.equal((item as { execute?: unknown }).execute, undefined, `${item.key} hands off only`);
});

test("leave type and allocation: created once, the allocation binds a type an earlier step creates, replays reconcile", async () => {
  const { user, schoolId, campusId } = await fixture();
  await within(user, async () => {
    const ctx = await ctxFor(user, campusId);
    assert.equal((await runGates(ctx, exec("leave.create_type").gates)).ok, true);
    // The plan: s1 creates "Casual Leave", s2 gives every staff role 12 days of it. Both are previewed before s1 runs.
    const allocation = { leaveType: "casual", days: 12 };
    const s2 = await resolved(ctx, "leave.create_allocation", allocation);
    assert.equal(s2.leaveTypeId, undefined, "not bound yet: the type does not exist until s1 runs");
    const s2Preview = await exec("leave.create_allocation").preview!(ctx, s2);
    assert.equal(s2Preview.counts.allocations, 6);

    const s1 = await confirmRun(ctx, "leave.create_type", { name: "Casual Leave", defaultDays: 10 });
    assert.equal(s1.preview.counts.types, 1);
    assert.equal(s1.receipt.counts.types, 1);
    assert.equal(await db.leaveType.count({ where: { schoolId, campusId } }), 1);

    // Confirming s2 re-reads its preview: the type now exists, but what the person confirmed is unchanged.
    assert.deepEqual(await exec("leave.create_allocation").preview!(ctx, s2), s2Preview, "the confirmed preview stays valid after s1");
    const ran = await exec("leave.create_allocation").execute(ctx, s2, { idempotencyKey: KEY() });
    assert.equal(ran.counts.allocations, 6);
    const rows = await db.leaveAllocation.findMany({ where: { schoolId, campusId } });
    assert.equal(rows.length, 6);
    assert.ok(rows.every(row => row.leaveTypeId === s1.receipt.entities[0].id && row.days === 120 && row.userId === null && row.academicYear === new Date().getFullYear()));

    // Replays: the type is kept (any case), the allocations are kept, nothing is written twice.
    const typeAgain = await confirmRun(ctx, "leave.create_type", { name: "casual leave" });
    assert.equal(typeAgain.preview.counts.types, 0);
    assert.equal(typeAgain.receipt.entities[0].id, s1.receipt.entities[0].id);
    assert.equal((typeAgain.receipt.detail as { reconciled?: boolean }).reconciled, true);
    const allocAgain = await confirmRun(ctx, "leave.create_allocation", allocation);
    assert.equal(allocAgain.bound.leaveTypeId, s1.receipt.entities[0].id, "bound in resolve once the type exists");
    assert.equal(allocAgain.preview.counts.allocations, 0);
    assert.equal(allocAgain.receipt.counts.kept, 6);
    assert.equal(await db.leaveType.count({ where: { schoolId } }), 1);
    assert.equal(await db.leaveAllocation.count({ where: { schoolId } }), 6);

    // By role, and an ambiguous type name becomes a question.
    await confirmRun(ctx, "leave.create_type", { name: "Sick Leave" });
    const teachers = await confirmRun(ctx, "leave.create_allocation", { leaveType: "Sick Leave", days: 8, roles: ["TEACHER"] });
    assert.equal(teachers.receipt.counts.allocations, 1);
    await db.leaveType.create({ data: { schoolId, campusId, name: "Sick Leave (Long)", defaultDays: 10 } });
    assert.equal(await code(resolved(ctx, "leave.create_allocation", { leaveType: "ick", days: 2 })), "INPUT:/leaveType=LEAVE_TYPE_AMBIGUOUS");
    assert.equal(await code(exec("leave.create_allocation").execute(ctx, await resolved(ctx, "leave.create_allocation", { leaveType: "Maternity", days: 90 }), { idempotencyKey: KEY() })), "DOMAIN_REFUSED");
  });
});

test("leave and preset entries refuse a foreign campus and write nothing", async () => {
  const { user, schoolId, otherCampusId } = await fixture();
  await within(user, async () => {
    const ctx = await ctxFor(user, otherCampusId);
    assert.equal((await runGates(ctx, exec("leave.create_type").gates)).ok, false);
    assert.equal(await code(resolved(ctx, "leave.create_type", { name: "Casual Leave" })), "SCOPE_DENIED");
    assert.equal(await code(exec("leave.create_type").execute(ctx, { name: "Casual Leave" }, { idempotencyKey: KEY() })), "SCOPE_DENIED");
    assert.equal(await code(resolved(ctx, "leave.create_allocation", { leaveType: "Casual", days: 5 })), "SCOPE_DENIED");
    assert.equal(await code(exec("leave.create_allocation").execute(ctx, { leaveType: "Casual", days: 5 }, { idempotencyKey: KEY() })), "SCOPE_DENIED");
    assert.equal(await code(resolved(ctx, "staff.apply_hierarchy_preset", { type: "SCHOOL" })), "SCOPE_DENIED");
    for (const key of ["staff.invite_send", "staff.resend_invitation"]) assert.equal(await code(handoff(key).handoff.prepare(ctx, {}, { idempotencyKey: KEY() })), "SCOPE_DENIED");
    assert.equal(await code(handoff("guardians.change_access").handoff.prepare(ctx, { student: "Ayesha", change: "SUSPEND", guardian: "Tariq" }, { idempotencyKey: KEY() })), "SCOPE_DENIED");
    assert.equal(await code(handoff("admissions.decide_application").handoff.prepare(ctx, { applicant: "Hamza" }, { idempotencyKey: KEY() })), "SCOPE_DENIED");
    assert.equal(await code(handoff("leave.review").handoff.prepare(ctx, { staff: "Sana" }, { idempotencyKey: KEY() })), "SCOPE_DENIED");
  });
  assert.equal(await db.leaveType.count({ where: { schoolId } }), 0);
  assert.equal(await db.leaveAllocation.count({ where: { schoolId } }), 0);
  assert.equal(await db.staffDesignation.count({ where: { schoolId } }), 0);
});

test("chat settings: the owner sees a before → after diff, a replay converges, a group ADMIN is refused", async () => {
  const owner = await fixture("ADMIN", "STANDALONE");
  await within(owner.user, async () => {
    const ctx = await ctxFor(owner.user, owner.campusId);
    const chat = exec("chat.update_school_settings");
    assert.equal((await runGates(ctx, chat.gates)).ok, true);
    assert.equal(await code(resolved(ctx, "chat.update_school_settings", {})), "INPUT:/parentToParent=CHAT_SETTINGS_NOTHING_TO_CHANGE");
    const input = { parentToParent: true, quietHoursEnabled: true, quietHoursStart: "21:00", attachmentsEnabled: true };
    const first = await confirmRun(ctx, "chat.update_school_settings", input);
    assert.equal(first.preview.counts.changes, 3);
    assert.deepEqual(first.preview.lines.map(line => line.value), ["Off → On", "On · no change", "Off → On", "20:00 → 21:00"]);
    assert.equal(first.receipt.counts.changes, 3);
    const saved = await db.chatSetting.findUniqueOrThrow({ where: { schoolId: owner.schoolId } });
    assert.equal(saved.parentToParent, true);
    assert.equal(saved.quietHoursStart, "21:00");
    assert.equal(saved.quietHoursEnd, "07:00", "fields not named keep their value");

    const replay = await confirmRun(ctx, "chat.update_school_settings", input);
    assert.equal(replay.preview.counts.changes, 0);
    assert.equal(replay.receipt.counts.changes, 0);
    assert.equal(replay.receipt.entities[0].id, saved.id);
    assert.equal(await db.chatSetting.count({ where: { schoolId: owner.schoolId } }), 1);
  });

  for (const [role, kind] of [["ADMIN", "GROUP"], ["CAMPUS_ADMIN", "GROUP"], ["CAMPUS_ADMIN", "STANDALONE"]] as const) {
    const other = await fixture(role, kind);
    await within(other.user, async () => {
      const ctx = await ctxFor(other.user, other.campusId);
      const gate = await runGates(ctx, exec("chat.update_school_settings").gates);
      assert.equal(gate.ok, false, `${kind} ${role} is not the institution authority`);
      assert.equal(await code(exec("chat.update_school_settings").execute(ctx, { parentToParent: true }, { idempotencyKey: KEY() })), "THROWN:Only the institution administrator can change the messaging policy.");
    });
    assert.equal(await db.chatSetting.count({ where: { schoolId: other.schoolId } }), 0);
  }
});

test("hierarchy preset: previews what it adds, applies once, a replay adds nothing", async () => {
  const { user, schoolId, campusId } = await fixture();
  await within(user, async () => {
    const ctx = await ctxFor(user, campusId);
    const first = await confirmRun(ctx, "staff.apply_hierarchy_preset", { type: "SCHOOL" });
    assert.ok(first.preview.counts.designations > 0);
    assert.equal(first.receipt.counts.designations, first.preview.counts.designations);
    assert.equal(first.receipt.counts.departments, first.preview.counts.departments);
    const ranks = await db.staffDesignation.count({ where: { schoolId } });
    const replay = await confirmRun(ctx, "staff.apply_hierarchy_preset", { type: "SCHOOL" });
    assert.equal(replay.preview.counts.designations, 0);
    assert.equal(replay.receipt.counts.designations, 0);
    assert.equal(await db.staffDesignation.count({ where: { schoolId } }), ranks);
  });
});

test("hand-offs open the screen with the record prefilled and write nothing", async () => {
  const { user, schoolId, campusId } = await fixture();
  const classId = randomUUID();
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "5", section: "A", academicYear: 2026, status: "ACTIVE" } });
  const studentId = randomUUID();
  await db.student.create({ data: { id: studentId, schoolId, campusId, classId, fullName: "Synthetic Ayesha Khan", rollNo: "R-01", gender: "FEMALE", status: "active", enrollmentDate: new Date("2026-04-01Z") } as never });
  const relationship = await db.guardianRelationship.create({ data: { schoolId, campusId, studentId, createdByUserId: user.userId, fullName: "Synthetic Tariq Khan", email: "tariq@example.invalid", relationship: "father", status: "ACTIVE" } });
  const expires = new Date(Date.now() + 7 * 86_400_000);
  const unsent = await db.staffInvitation.create({ data: { schoolId, campusId, email: "new.teacher@example.invalid", role: "TEACHER", token: randomUUID(), expiresAt: expires, profile: { fullName: "Synthetic Bilal Ahmed" } } });
  const sent = await db.staffInvitation.create({ data: { schoolId, campusId, email: "accounts@example.invalid", role: "ACCOUNTANT", token: randomUUID(), expiresAt: expires, deliveryStatus: "sent", lastDeliveryAt: new Date() } });
  const form = await db.admissionForm.create({ data: { schoolId, campusId, name: "Synthetic form", draft: {}, currentVersion: 1, publicToken: randomUUID() } });
  const version = await db.admissionFormVersion.create({ data: { schoolId, campusId, formId: form.id, version: 1, definition: {}, publishedById: user.userId } });
  const application = await db.admissionApplication.create({ data: { schoolId, campusId, formVersionId: version.id, reference: `APP-${randomUUID().slice(0, 6)}`, status: "UNDER_REVIEW", answers: {}, childName: "Synthetic Hamza Ali", submittedAt: new Date() } });
  const teacherId = randomUUID(), clerkId = randomUUID();
  await db.user.create({ data: { id: teacherId, schoolId, campusId, email: `${teacherId}@example.invalid`, fullName: "Synthetic Sana Riaz", role: "TEACHER", isActive: true } });
  await db.user.create({ data: { id: clerkId, schoolId, campusId, email: `${clerkId}@example.invalid`, fullName: "Synthetic Omar Clerk", role: "RECEPTIONIST", isActive: true } });
  const type = await db.leaveType.create({ data: { schoolId, campusId, name: "Casual Leave", defaultDays: 100 } });
  const sana = await db.leaveRequest.create({ data: { schoolId, campusId, userId: teacherId, leaveTypeId: type.id, fromDate: new Date("2026-11-05T00:00:00Z"), toDate: new Date("2026-11-06T00:00:00Z"), days: 20 } });
  await db.leaveRequest.create({ data: { schoolId, campusId, userId: teacherId, leaveTypeId: type.id, fromDate: new Date("2026-12-01T00:00:00Z"), toDate: new Date("2026-12-01T00:00:00Z"), days: 10 } });
  const omar = await db.leaveRequest.create({ data: { schoolId, campusId, userId: clerkId, leaveTypeId: type.id, fromDate: new Date("2026-11-10T00:00:00Z"), toDate: new Date("2026-11-10T00:00:00Z"), days: 10 } });
  const own = await db.leaveRequest.create({ data: { schoolId, campusId, userId: user.userId, leaveTypeId: type.id, fromDate: new Date("2026-11-20T00:00:00Z"), toDate: new Date("2026-11-20T00:00:00Z"), days: 10 } });

  const snapshot = async () => JSON.stringify({
    invites: await db.staffInvitation.findMany({ where: { schoolId }, orderBy: { id: "asc" } }),
    guardians: await db.guardianRelationship.findMany({ where: { schoolId }, orderBy: { id: "asc" } }),
    guardianEvents: await db.guardianAccessEvent.count({ where: { schoolId } }),
    applications: await db.admissionApplication.findMany({ where: { schoolId }, orderBy: { id: "asc" } }),
    applicationEvents: await db.admissionApplicationEvent.count({ where: { schoolId } }),
    leave: await db.leaveRequest.findMany({ where: { schoolId }, orderBy: { id: "asc" } }),
  });
  const before = await snapshot();

  await within(user, async () => {
    const ctx = await ctxFor(user, campusId);
    const prepare = async (key: string, input: unknown) => handoff(key).handoff.prepare(ctx, await resolved(ctx, key, input), { idempotencyKey: KEY() });

    // A campus admin without the membership delegation is refused, as the route's assertStaffWriter does.
    assert.equal((await runGates(ctx, handoff("staff.invite_send").gates)).ok, false);
    const delegated = await ctxFor({ ...user, canManageMemberships: true }, campusId);
    assert.equal((await runGates(delegated, handoff("staff.invite_send").gates)).ok, true);
    const toSend = await handoff("staff.invite_send").handoff.prepare(delegated, {}, { idempotencyKey: KEY() });
    assert.equal(toSend.kind, "DOMAIN_SCREEN");
    assert.equal(toSend.link, "/admin?view=teachers");
    assert.deepEqual(toSend.prefill.inviteIds, [unsent.id], "only the invitation that was never delivered");
    const resend = await handoff("staff.resend_invitation").handoff.prepare(delegated, await resolved(delegated, "staff.resend_invitation", { role: "ACCOUNTANT" }), { idempotencyKey: KEY() });
    assert.equal(resend.link, "/admin?view=leadership");
    assert.deepEqual(resend.prefill.inviteIds, [sent.id]);
    assert.equal(await code(resolved(delegated, "staff.invite_send", { people: ["Bilal"] })), "OK");
    assert.equal(await code(resolved(delegated, "staff.invite_send", { people: ["Zainab"] })), "INPUT:/people/0=INVITATION_UNSENT_NOT_FOUND");

    const guardian = await prepare("guardians.change_access", { student: "Ayesha", change: "SUSPEND", guardian: "Tariq", reason: "Court order received today" });
    assert.equal(guardian.link, `/admin?view=guardians&student=${studentId}`);
    assert.equal(guardian.prefill.relationshipId, relationship.id);
    assert.equal(guardian.prefill.change, "SUSPEND");
    assert.equal(await code(resolved(ctx, "guardians.change_access", { student: "Nobody Here", change: "REVOKE", guardian: "Tariq" })), "INPUT:/student=PUPIL_NOT_FOUND");

    const decide = await prepare("admissions.decide_application", { applicant: "Hamza", decision: "OFFER" });
    assert.equal(decide.link, "/admin?view=admissions&tab=applications");
    assert.equal(decide.prefill.recordId, application.id);
    assert.equal(decide.prefill.action, "offer");
    assert.equal(await code(resolved(ctx, "admissions.decide_application", { applicant: "Hamza", decision: "RECORD_ACCEPTANCE" })), "DOMAIN_REFUSED");

    assert.equal(await code(resolved(ctx, "leave.review", { staff: "Sana" })), "INPUT:/staff=LEAVE_REQUEST_AMBIGUOUS");
    const teacherLeave = await prepare("leave.review", { staff: "Sana", from: "2026-11-05", to: "2026-11-06", decision: "APPROVE" });
    assert.equal(teacherLeave.prefill.recordId, sana.id);
    assert.equal(teacherLeave.link, "/admin?view=leave&tab=queue", "no principal in post: the operator decides teachers' leave");
    assert.deepEqual(teacherLeave.targetRoles, []);
    const office = await prepare("leave.review", { staff: "Omar", from: "2026-11-10" });
    assert.equal(office.prefill.recordId, omar.id);
    assert.equal(await code(resolved(ctx, "leave.review", { staff: "Synthetic operator", from: "2026-11-20" })), "DOMAIN_REFUSED");
    assert.ok(own.id);
  });

  // With a principal in post, a teacher's leave goes to the principal's screen.
  await db.user.create({ data: { schoolId, campusId, email: `${randomUUID()}@example.invalid`, fullName: "Synthetic Principal", role: "PRINCIPAL", isActive: true } });
  await within(user, async () => {
    const ctx = await ctxFor(user, campusId);
    const routed = await handoff("leave.review").handoff.prepare(ctx, await resolved(ctx, "leave.review", { staff: "Sana", from: "2026-11-05" }), { idempotencyKey: KEY() });
    assert.deepEqual(routed.targetRoles, ["PRINCIPAL"]);
    assert.equal(routed.link, "/principal?view=leave&tab=queue");
  });

  assert.equal(await snapshot(), before, "no hand-off changes a domain record");
});
