import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { approveReadiness, readinessView, rehearsalPreview, switchAdoptionMode, updateReadinessTask } from "../../src/lib/readiness/service";

const local = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== local || process.env.DIRECT_URL !== local) throw new Error("Use only isolated PG55438.");
const db = new PrismaClient(), schoolIds: string[] = [];
after(async () => { await db.school.deleteMany({ where: { id: { in: schoolIds } } }); await db.$disconnect(); await prisma.$disconnect(); });
const DAY = 86_400_000;

async function school(mode: "FULL_OPERATIONS" | "EXAM_STUDIO") {
  const schoolId = `ready397-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID();
  schoolIds.push(schoolId);
  await db.school.create({ data: { id: schoolId, name: "Synthetic readiness school", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Synthetic", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Synthetic campus", regId: campusId, city: "Synthetic" } });
  const person = async (role: AuthUser["role"], extra: { owner?: boolean; campus?: boolean } = {}): Promise<AuthUser> => {
    const userId = randomUUID(), email = `${userId}@example.invalid`;
    await db.user.create({ data: { id: userId, email, password: "x", fullName: `Synthetic ${role}`, role, schoolId, campusId: extra.campus === false ? null : campusId, isActive: true, onboardingComplete: true, isInstitutionOwner: !!extra.owner } });
    return { userId, email, role, schoolId, campusId: extra.campus === false ? null : campusId, accessVersion: 0, isInstitutionOwner: !!extra.owner };
  };
  const owner = await person("ADMIN", { owner: true }), delegate = await person("PRINCIPAL"), teacher = await person("TEACHER"), accountant = await person("ACCOUNTANT");
  await db.institutionSetup.create({ data: { schoolId, institutionType: "STANDALONE", adoptionMode: mode, status: "COMPLETED", draft: { school: {}, campuses: [] }, delegateUserId: delegate.userId } });
  return { schoolId, campusId, classId, owner, delegate, teacher, accountant, person };
}
type School = Awaited<ReturnType<typeof school>>;

/** Everything a full-operations school needs, except the rehearsal. */
async function configure(s: School, { guardians = true } = {}) {
  await db.localePolicy.create({ data: { schoolId: s.schoolId, scopeKey: "school", status: "ACTIVE", effectiveAt: new Date(Date.now() - DAY), createdBy: s.owner.userId, settings: { country: "SA", currency: "SAR", timezone: "Asia/Riyadh" } } });
  await db.academicCycle.create({ data: { schoolId: s.schoolId, campusId: s.campusId, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  await db.class.create({ data: { id: s.classId, schoolId: s.schoolId, campusId: s.campusId, name: "Grade 4", academicYear: 2026, classTeacherId: s.teacher.userId } });
  await db.subject.create({ data: { schoolId: s.schoolId, campusId: s.campusId, classId: s.classId, name: "Mathematics", teacherId: s.teacher.userId } });
  const studentId = randomUUID();
  await db.student.create({ data: { id: studentId, schoolId: s.schoolId, campusId: s.campusId, classId: s.classId, fullName: "Synthetic pupil", rollNo: "1", gender: "FEMALE", enrollmentDate: new Date("2026-09-01Z") } });
  if (guardians) await db.guardianRelationship.create({ data: { schoolId: s.schoolId, campusId: s.campusId, studentId, guardianUserId: s.owner.userId, createdByUserId: s.owner.userId, fullName: "Synthetic guardian", email: s.owner.email, relationship: "Parent", status: "ACTIVE", verifiedAt: new Date() } });
  await db.feeStructure.create({ data: { schoolId: s.schoolId, campusId: s.campusId, classId: s.classId, monthlyFee: 1000, activeFrom: new Date("2026-09-01Z") } });
}
const rehearse = async (user: AuthUser) => { for (const step of ["attendance", "assessment", "family"]) await rehearsalPreview(user, { step }); };

test("required checks follow the school's own configuration and import state; approval waits for all of them", async () => {
  const s = await school("FULL_OPERATIONS");
  const empty = await readinessView(s.owner);
  assert.equal(empty.lead, true);
  if (!empty.lead) return;
  assert.equal(empty.ready, false);
  assert.equal(empty.nextRequired, "locale", "the platform default locale is not accepted as a choice");
  await configure(s, { guardians: false });
  await db.importBatch.create({ data: { schoolId: s.schoolId, campusId: s.campusId, kind: "STUDENT_ROSTER", fingerprint: randomUUID(), targetScope: s.campusId, sourceName: "roster.csv", state: "STAGED", createdById: s.owner.userId, expiresAt: new Date(Date.now() + DAY),
    data: { rows: [{ state: "ACCEPTED", errors: [] }, { state: "REJECTED", errors: ["classId: Class is outside the selected campus or does not exist"] }, { state: "UNRESOLVED", errors: ["rollNo: conflict"] }] } } });
  const staged = await readinessView(s.owner);
  if (!staged.lead) return;
  assert.equal(staged.nextRequired, "imports");
  assert.deepEqual(staged.facts.imports.batches.map(b => [b.total, b.accepted, b.rejected, b.unresolved, b.unknownClass]), [[3, 1, 1, 1, 1]]);
  assert.equal(staged.facts.studentsWithoutGuardian, 1);
  await assert.rejects(() => approveReadiness(s.owner, { expectedVersion: staged.readiness.version }), { status: 409 });
  await db.importBatch.updateMany({ where: { schoolId: s.schoolId }, data: { state: "COMMITTED", committedAt: new Date() } });
  const guardians = await readinessView(s.owner);
  if (!guardians.lead) return;
  assert.equal(guardians.nextRequired, "guardians");
  assert.equal(guardians.facts.imports.unknownClassRows, 1, "decided batches keep their unknown-class rows visible");
});

test("the practice rehearsal previews configured data with synthetic learners and writes no school records", async () => {
  const s = await school("FULL_OPERATIONS");
  await configure(s);
  const counts = () => Promise.all([db.attendance.count({ where: { schoolId: s.schoolId } }), db.notification.count({ where: { schoolId: s.schoolId } }), db.parentCommunication.count({ where: { schoolId: s.schoolId } }), db.payment.count({ where: { schoolId: s.schoolId } }), db.ledgerEntry.count({ where: { schoolId: s.schoolId } }), db.exam.count({ where: { schoolId: s.schoolId } }), db.invoice.count({ where: { schoolId: s.schoolId } })]);
  const before = await counts();
  const family = await rehearsalPreview(s.owner, { step: "family" });
  assert.equal(family.nothingSaved, true);
  assert.equal(family.className, "Grade 4");
  assert.deepEqual(family.subjects, ["Mathematics"]);
  assert.equal(family.currency, "SAR");
  assert.ok(family.learners.every(learner => learner.synthetic && learner.name.startsWith("Practice learner")));
  await rehearsalPreview(s.owner, { step: "attendance" }); await rehearsalPreview(s.owner, { step: "assessment" });
  assert.deepEqual(await counts(), before, "no attendance, messages, payments, ledger, exams or invoices were created");
  await assert.rejects(() => rehearsalPreview(s.teacher, { step: "attendance" }), { status: 403 });
});

test("approval records the approver, time, evidence and open follow-ups, then cannot be rewritten", async () => {
  const s = await school("FULL_OPERATIONS");
  await configure(s); await rehearse(s.owner);
  const view = await readinessView(s.owner);
  if (!view.lead) return;
  assert.equal(view.ready, true);
  assert.ok(view.tasks.some(task => task.key === "feesPayroll"), "optional work from onboarding is seeded");
  await assert.rejects(() => approveReadiness(s.owner, { expectedVersion: view.readiness.version - 1 }), { status: 409 }, "a stale screen cannot approve");
  await assert.rejects(() => approveReadiness(s.teacher, { expectedVersion: view.readiness.version }), { status: 403 });
  const approved = await approveReadiness(s.owner, { expectedVersion: view.readiness.version });
  assert.equal(approved.status, "READY");
  assert.equal(approved.approvedById, s.owner.userId);
  const evidence = approved.evidence as { approvedFor: string; outstandingOptional: Array<{ key: string }> };
  assert.equal(evidence.approvedFor, "FULL_OPERATIONS");
  assert.ok(evidence.outstandingOptional.some(task => task.key === "roster"));
  await assert.rejects(() => approveReadiness(s.owner, { expectedVersion: approved.version }), { status: 409 });
  await assert.rejects(() => db.schoolReadiness.update({ where: { schoolId: s.schoolId }, data: { approvedById: s.teacher.userId } }), /cannot be changed/);
  assert.equal(await db.auditLog.count({ where: { schoolId: s.schoolId, tableName: "school_readiness" } }), 1);
});

test("the setup delegate leads; other staff see and close only follow-ups they own", async () => {
  const s = await school("EXAM_STUDIO");
  const lead = await readinessView(s.delegate);
  assert.equal(lead.lead, true, "the named setup delegate is an implementation lead");
  if (!lead.lead) return;
  await assert.rejects(() => readinessView(s.teacher), { status: 403 }, "no tasks, no access");
  const roster = lead.tasks.find(task => task.key === "roster")!;
  await updateReadinessTask(s.delegate, { action: "assign", taskId: roster.id, ownerId: s.teacher.userId });
  await assert.rejects(() => updateReadinessTask(s.delegate, { action: "assign", taskId: roster.id, ownerId: randomUUID() }), { status: 400 });
  const teacherView = await readinessView(s.teacher);
  assert.equal(teacherView.lead, false);
  assert.deepEqual(teacherView.tasks.map(task => task.id), [roster.id]);
  await assert.rejects(() => updateReadinessTask(s.teacher, { action: "status", taskId: roster.id, status: "DEFERRED" }), { status: 403 });
  const other = lead.tasks.find(task => task.key === "curriculum")!;
  await assert.rejects(() => updateReadinessTask(s.teacher, { action: "status", taskId: other.id, status: "DONE" }), { status: 403 });
  assert.equal((await updateReadinessTask(s.teacher, { action: "status", taskId: roster.id, status: "DONE" })).completedById, s.teacher.userId);
  await assert.rejects(() => updateReadinessTask(s.accountant, { action: "create", title: "Unauthorized follow-up", ownerId: null }), { status: 403 });
});

test("an Exam Studio school can go live without fees or verified guardians", async () => {
  const s = await school("EXAM_STUDIO");
  await configure(s, { guardians: false });
  await db.feeStructure.deleteMany({ where: { schoolId: s.schoolId } });
  await rehearse(s.delegate);
  const view = await readinessView(s.delegate);
  if (!view.lead) return;
  assert.equal(view.ready, true);
  assert.equal((await approveReadiness(s.delegate, { expectedVersion: view.readiness.version })).status, "READY");
});

test("SKAI-154: an empty second campus blocks full-operations approval; campus and school scope hold", async () => {
  const s = await school("FULL_OPERATIONS"), other = await school("FULL_OPERATIONS");
  await configure(s); await rehearse(s.owner); await configure(other);
  // The group admin is not bound to one campus, so their readiness view covers every campus of this school.
  const lead: AuthUser = { ...(await s.person("SUPER_ADMIN", { campus: false })), institutionKind: "GROUP" };
  const south = randomUUID();
  await db.campus.create({ data: { id: south, schoolId: s.schoolId, name: "Synthetic south campus", regId: south, city: "Synthetic" } });
  const blocked = await readinessView(lead);
  if (!blocked.lead) return;
  assert.equal(blocked.nextRequired, "campusCoverage");
  assert.deepEqual(blocked.campuses.map(campus => [campus.name, campus.classes, campus.students, campus.ready]),
    [["Synthetic campus", 1, 1, true], ["Synthetic south campus", 0, 0, false]], "only this school's campuses, each with its own counts");
  await assert.rejects(() => approveReadiness(lead, { expectedVersion: blocked.readiness.version }), { status: 409 }, "approval re-checks every campus");
  const campusBound = await readinessView(s.owner);
  if (!campusBound.lead) return;
  assert.deepEqual(campusBound.campuses.map(campus => campus.id), [s.campusId], "a campus-bound lead sees only their own campus");
  await db.campus.update({ where: { id: south }, data: { archivedAt: new Date() } });
  const ready = await readinessView(lead);
  if (!ready.lead) return;
  assert.equal(ready.ready, true, "an archived campus no longer blocks go-live");
});

test("SKAI-912: the institution authority switches adoption mode before go-live; data stays, other roles and schools cannot", async () => {
  const s = await school("EXAM_STUDIO"), other = await school("EXAM_STUDIO");
  await configure(s, { guardians: false });
  await rehearsalPreview(s.owner, { step: "assessment" });
  const before = await readinessView(s.owner);
  if (!before.lead) throw new Error("owner leads");
  assert.equal(before.ready, true, "an Exam Studio pilot needs only the assessment rehearsal");
  assert.equal(before.canSwitchMode, true);
  const version = before.readiness.version;
  // The setup delegate, a teacher and a stale screen are all refused; nothing changes.
  await assert.rejects(() => switchAdoptionMode(s.delegate, { mode: "FULL_OPERATIONS", expectedVersion: version }), { status: 403 });
  await assert.rejects(() => switchAdoptionMode(s.teacher, { mode: "FULL_OPERATIONS", expectedVersion: version }), { status: 403 });
  await assert.rejects(() => switchAdoptionMode(s.owner, { mode: "FULL_OPERATIONS", expectedVersion: version - 1 }), { status: 409 });
  const switched = await switchAdoptionMode(s.owner, { mode: "FULL_OPERATIONS", expectedVersion: version });
  assert.equal(switched.mode, "FULL_OPERATIONS");
  // The other school is untouched; this school's data, follow-ups and rehearsal are kept.
  assert.equal((await db.institutionSetup.findUnique({ where: { schoolId: other.schoolId } }))!.adoptionMode, "EXAM_STUDIO");
  const after = await readinessView(s.owner);
  if (!after.lead) throw new Error("owner leads");
  assert.equal(after.ready, false, "full operations re-gates guardians and the whole rehearsal");
  assert.equal(after.checks.find(c => c.id === "roster")!.passed, true);
  assert.ok((after.readiness.rehearsal as Record<string, string>).assessment, "the assessment rehearsal is kept");
  assert.ok(after.tasks.some(task => task.key === "feesPayroll"), "fees and payroll become a follow-up");
  // A screen opened under the old mode cannot approve.
  await assert.rejects(() => approveReadiness(s.owner, { expectedVersion: version }), { status: 409 });
  // Switching back keeps everything, and the follow-up is not deleted.
  await switchAdoptionMode(s.owner, { mode: "EXAM_STUDIO", expectedVersion: after.readiness.version });
  const back = await readinessView(s.owner);
  if (!back.lead) throw new Error("owner leads");
  assert.equal(back.ready, true);
  assert.ok(back.tasks.some(task => task.key === "feesPayroll"));
  await approveReadiness(s.owner, { expectedVersion: back.readiness.version });
  await assert.rejects(() => switchAdoptionMode(s.owner, { mode: "FULL_OPERATIONS", expectedVersion: back.readiness.version + 1 }), { status: 409 }, "no switch after go-live");
});

test("setup task tracking (SKAI-155): due dates, in-progress, stale edits, reminders, audit trail and two-school isolation", async () => {
  const s = await school("FULL_OPERATIONS"), other = await school("FULL_OPERATIONS");
  const view = await readinessView(s.owner);
  if (!view.lead) return assert.fail("owner leads");
  const area = view.tasks.find(task => task.key.startsWith("area:") || task.key === "roster")!;
  const now = new Date("2026-11-01T09:00:00Z");
  await assert.rejects(() => updateReadinessTask(s.owner, { action: "schedule", taskId: area.id, dueOn: "2026-10-31", expectedVersion: area.version }, now), { status: 400 }, "no past due date");
  await assert.rejects(() => updateReadinessTask(s.owner, { action: "schedule", taskId: area.id, dueOn: "2026-02-30" }, now), { status: 400 }, "no impossible date");
  await assert.rejects(() => updateReadinessTask(s.owner, { action: "remind", taskId: area.id }, now), { status: 409 }, "nobody to remind yet");
  const assigned = await updateReadinessTask(s.owner, { action: "assign", taskId: area.id, ownerId: s.teacher.userId, expectedVersion: area.version }, now);
  const scheduled = await updateReadinessTask(s.owner, { action: "schedule", taskId: area.id, dueOn: "2026-11-15", expectedVersion: assigned.version }, now);
  assert.equal(scheduled.dueOn?.toISOString().slice(0, 10), "2026-11-15");
  await assert.rejects(() => updateReadinessTask(s.owner, { action: "assign", taskId: area.id, ownerId: null, expectedVersion: assigned.version }, now), { status: 409 }, "a stale tab cannot overwrite");
  // Reminders: one notification per owner and task, at most once a day.
  await updateReadinessTask(s.owner, { action: "remind", taskId: area.id }, now);
  await assert.rejects(() => updateReadinessTask(s.owner, { action: "remind", taskId: area.id }, new Date(now.getTime() + 3_600_000)), { status: 409 });
  await updateReadinessTask(s.owner, { action: "remind", taskId: area.id }, new Date(now.getTime() + DAY + 1));
  const notices = await db.notification.findMany({ where: { userId: s.teacher.userId, dedupeKey: `readiness-task:${area.id}` } });
  assert.deepEqual(notices.map(n => [n.reminderCount, n.category, n.resolvedAt]), [[2, "ACTION", null]]);
  // The owner moves their own task along; only the lead plans it.
  await assert.rejects(() => updateReadinessTask(s.teacher, { action: "schedule", taskId: area.id, dueOn: null }, now), { status: 403 });
  await assert.rejects(() => updateReadinessTask(s.teacher, { action: "remind", taskId: area.id }, now), { status: 403 });
  assert.equal((await updateReadinessTask(s.teacher, { action: "status", taskId: area.id, status: "IN_PROGRESS" }, now)).status, "IN_PROGRESS");
  assert.equal((await updateReadinessTask(s.teacher, { action: "status", taskId: area.id, status: "DONE" }, now)).status, "DONE");
  assert.ok((await db.notification.findFirstOrThrow({ where: { userId: s.teacher.userId, dedupeKey: `readiness-task:${area.id}` } })).resolvedAt, "done resolves the reminder");
  // Another school's lead cannot see or touch the task.
  await assert.rejects(() => updateReadinessTask(other.owner, { action: "status", taskId: area.id, status: "OPEN" }, now), { status: 404 });
  await assert.rejects(() => updateReadinessTask(other.owner, { action: "remind", taskId: area.id }, now), { status: 404 });
  const after = await readinessView(s.owner);
  if (!after.lead) return;
  const tracked = after.tasks.find(task => task.id === area.id)!;
  assert.deepEqual(tracked.history.map(entry => entry.action), ["status:DONE", "status:IN_PROGRESS", "remind", "remind", "schedule"], "the latest five, newest first");
  assert.ok(await db.auditLog.count({ where: { schoolId: s.schoolId, tableName: "readiness_tasks", recordId: area.id, newValue: { path: ["action"], equals: "assign" } } }), "every change is audited");
  assert.equal(tracked.dueOn, "2026-11-15");
  const otherView = await readinessView(other.owner);
  if (!otherView.lead) return;
  assert.ok(otherView.tasks.every(task => task.history.length === 0 && task.id !== area.id), "no history leaks across schools");
});
