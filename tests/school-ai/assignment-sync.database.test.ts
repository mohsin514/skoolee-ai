import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { deleteSubjectWithTimetableSync, updateClassWithTeacherAssignment, updateSubjectWithTeacherAssignment } from "../../src/lib/api/teacher-assignments";
import { schoolAiTransaction } from "../../src/lib/school-ai/transaction";
import { syncTimetableSlotsForSubjects } from "../../src/lib/api/timetable-sync";
import { lockTimetableCampus } from "../../src/lib/timetable/locking";
import { createWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { executeSchoolAiTool, previewSchoolAiExecution } from "../../src/lib/school-ai/execution";

const local = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== local || process.env.DIRECT_URL !== local) throw new Error("Use only the isolated school AI PostgreSQL fixture.");
const db = new PrismaClient(), schoolId = `assignment-sync-${randomUUID()}`;
before(async () => { await db.school.create({ data: { id: schoolId, name: "Synthetic assignment school", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Test", status: "ACTIVE" } }); });
after(async () => { await db.schoolAiExecution.deleteMany({ where: { schoolId } }); await db.school.delete({ where: { id: schoolId } }); await db.$disconnect(); await prisma.$disconnect(); });
async function fixture() {
  const campusId = randomUUID(), actorId = randomUUID(), oldTeacherId = randomUUID(), newTeacherId = randomUUID();
  await db.campus.create({ data: { id: campusId, schoolId, name: "Assignment campus", regId: campusId, city: "Test" } });
  await db.user.createMany({ data: [{ id: actorId, schoolId, campusId, role: "CAMPUS_ADMIN", fullName: "Planner", email: `${actorId}@example.invalid` }, ...[oldTeacherId, newTeacherId].map((id, index) => ({ id, schoolId, campusId, role: "TEACHER" as const, fullName: index ? "New teacher" : "Existing teacher", email: `${id}@example.invalid`, isActive: true }))] });
  const user: AuthUser = { userId: actorId, schoolId, campusId, role: "CAMPUS_ADMIN", email: `${actorId}@example.invalid` };
  return { campusId, user, oldTeacherId, newTeacherId };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function asUser<T>(user: AuthUser, work: () => Promise<T>) { return runWithTenantContext({ schoolId: user.schoolId, campusId: user.campusId, userId: user.userId, role: user.role }, work); }
async function board(f: Fixture, options: { year?: number; term?: string; day?: number; period?: number; start?: string; end?: string; teacherId?: string; roomId?: string; single?: boolean } = {}) {
  const teacherId = options.teacherId ?? f.oldTeacherId;
  const cls = await db.class.create({ data: { schoolId, campusId: f.campusId, name: `Class ${randomUUID().slice(0, 8)}`, academicYear: options.year ?? 2026, teachingMode: options.single ? "SINGLE" : "SUBJECT", classTeacherId: teacherId } });
  const subject = await db.subject.create({ data: { schoolId, campusId: f.campusId, classId: cls.id, name: "Mathematics", teacherId } });
  const table = await db.timetable.create({ data: { schoolId, campusId: f.campusId, classId: cls.id, academicYear: cls.academicYear, term: options.term ?? "TERM_1", status: "PUBLISHED", slots: { create: { schoolId, subjectId: subject.id, teacherId, roomId: options.roomId, dayOfWeek: options.day ?? 1, periodNumber: options.period ?? 1, startTime: options.start ?? "08:00", endTime: options.end ?? "08:40", slotType: "CLASS" } } }, include: { slots: true } });
  return { cls, subject, table };
}
function assign(f: Fixture, id: string, teacherId = f.newTeacherId) { return asUser(f.user, () => updateSubjectWithTeacherAssignment(f.user, { id, teacherId })); }

test("subject assignment commits teacher, published slots and one audit together", async () => {
  const f = await fixture(), b = await board(f);
  const result = await assign(f, b.subject.id);
  assert.equal(result.subject.teacherId, f.newTeacherId); assert.deepEqual(result.clashes, []);
  assert.equal((await db.timetableSlot.findUniqueOrThrow({ where: { id: b.table.slots[0].id } })).teacherId, f.newTeacherId);
  assert.equal((await db.timetable.findUniqueOrThrow({ where: { id: b.table.id } })).status, "PUBLISHED");
  assert.equal(await db.auditLog.count({ where: { schoolId, recordId: b.subject.id } }), 1);
  assert.equal(await db.notification.count({ where: { schoolId } }), 0);
});

test("actual-time conflict rolls back SINGLE teacher, all subjects, slots and audit", async () => {
  const f = await fixture(), b = await board(f, { single: true });
  const second = await db.subject.create({ data: { schoolId, campusId: f.campusId, classId: b.cls.id, name: "Science", teacherId: f.oldTeacherId } });
  const extraSlot = await db.timetableSlot.create({ data: { schoolId, timetableId: b.table.id, subjectId: second.id, teacherId: f.oldTeacherId, dayOfWeek: 2, periodNumber: 1, startTime: "08:00", endTime: "08:40" } });
  await board(f, { teacherId: f.newTeacherId, period: 7, start: "08:20", end: "09:00" });
  await assert.rejects(() => asUser(f.user, () => updateClassWithTeacherAssignment(f.user, { id: b.cls.id, classTeacherId: f.newTeacherId })), { status: 409 });
  assert.equal((await db.class.findUniqueOrThrow({ where: { id: b.cls.id } })).classTeacherId, f.oldTeacherId);
  assert.deepEqual((await db.subject.findMany({ where: { classId: b.cls.id } })).map(subject => subject.teacherId), [f.oldTeacherId, f.oldTeacherId]);
  assert((await db.timetableSlot.findMany({ where: { id: { in: [b.table.slots[0].id, extraSlot.id] } } })).every(slot => slot.teacherId === f.oldTeacherId));
  assert.equal(await db.auditLog.count({ where: { schoolId, recordId: b.cls.id } }), 0);
});

test("SINGLE assignment updates every subject and lesson on success", async () => {
  const f = await fixture(), b = await board(f, { single: true });
  const subject = await db.subject.create({ data: { schoolId, campusId: f.campusId, classId: b.cls.id, name: "Science", teacherId: f.oldTeacherId } });
  await db.timetableSlot.create({ data: { schoolId, timetableId: b.table.id, subjectId: subject.id, teacherId: f.oldTeacherId, dayOfWeek: 2, periodNumber: 1, startTime: "08:00", endTime: "08:40" } });
  const result = await asUser(f.user, () => updateClassWithTeacherAssignment(f.user, { id: b.cls.id, classTeacherId: f.newTeacherId }));
  assert.equal(result.cls.classTeacher?.id, f.newTeacherId); assert.deepEqual(result.clashes, []);
  assert((await db.subject.findMany({ where: { classId: b.cls.id } })).every(row => row.teacherId === f.newTeacherId));
  assert((await db.timetableSlot.findMany({ where: { timetableId: b.table.id } })).every(row => row.teacherId === f.newTeacherId));
  assert.equal(await db.auditLog.count({ where: { schoolId, recordId: b.cls.id } }), 1);
});

test("SINGLE assignment cannot merge different teachers into overlapping legacy lessons", async () => {
  const f = await fixture(), b = await board(f, { single: true });
  const subject = await db.subject.create({ data: { schoolId, campusId: f.campusId, classId: b.cls.id, name: "Overlapping legacy subject", teacherId: f.newTeacherId } });
  await db.timetableSlot.create({ data: { schoolId, timetableId: b.table.id, subjectId: subject.id, teacherId: f.newTeacherId, dayOfWeek: 1, periodNumber: 7, startTime: "08:20", endTime: "09:00" } });
  await assert.rejects(() => asUser(f.user, () => updateClassWithTeacherAssignment(f.user, { id: b.cls.id, classTeacherId: f.newTeacherId })), { status: 409 });
  assert.equal((await db.class.findUniqueOrThrow({ where: { id: b.cls.id } })).classTeacherId, f.oldTeacherId);
  assert.equal((await db.subject.findUniqueOrThrow({ where: { id: b.subject.id } })).teacherId, f.oldTeacherId);
});

test("full resulting board validation catches a room clash on an unchanged lesson", async () => {
  const f = await fixture(), b = await board(f);
  const room = await db.classRoom.create({ data: { schoolId, campusId: f.campusId, roomNumber: "R1", capacity: 30 } });
  await db.timetableSlot.create({ data: { schoolId, timetableId: b.table.id, dayOfWeek: 2, periodNumber: 1, startTime: "08:00", endTime: "08:40", roomId: room.id } });
  await board(f, { day: 2, roomId: room.id, teacherId: f.newTeacherId });
  await assert.rejects(() => assign(f, b.subject.id), { status: 409 });
  assert.equal((await db.subject.findUniqueOrThrow({ where: { id: b.subject.id } })).teacherId, f.oldTeacherId);
});

test("distinct years and disjoint terms remain available; mode-only changes preserve assignments", async () => {
  const f = await fixture(), b = await board(f, { term: "TERM_2" });
  await board(f, { year: 2025, term: "ANNUAL", teacherId: f.newTeacherId });
  await board(f, { term: "TERM_1", teacherId: f.newTeacherId });
  await assign(f, b.subject.id);
  await asUser(f.user, () => updateClassWithTeacherAssignment(f.user, { id: b.cls.id, teachingMode: "SINGLE" }));
  assert.equal((await db.subject.findUniqueOrThrow({ where: { id: b.subject.id } })).teacherId, f.newTeacherId);
  assert.equal((await db.class.findUniqueOrThrow({ where: { id: b.cls.id } })).classTeacherId, f.oldTeacherId);
});

test("assignment and low-level sync reject foreign campus references without mutating schedules", async () => {
  const f = await fixture(), foreign = await fixture(), b = await board(f), other = await board(foreign);
  await assert.rejects(() => assign(f, other.subject.id), { status: 404 });
  await assert.rejects(() => assign(f, b.subject.id, foreign.newTeacherId), { status: 400 });
  await assert.rejects(() => schoolAiTransaction(f.user, async tx => { await lockTimetableCampus(tx, schoolId, f.campusId); await syncTimetableSlotsForSubjects(tx, { schoolId, campusId: f.campusId }, [other.subject.id], f.newTeacherId); }), { status: 403 });
  assert.equal((await db.timetableSlot.findUniqueOrThrow({ where: { id: other.table.slots[0].id } })).teacherId, foreign.oldTeacherId);
  await assert.rejects(() => asUser(f.user, () => updateSubjectWithTeacherAssignment(f.user, { id: b.subject.id, classId: other.cls.id })), { status: 404 });
});

test("scheduled subjects and classes cannot move out of their timetable scope", async () => {
  const f = await fixture(), b = await board(f), other = await board(f, { day: 2 });
  await assert.rejects(() => asUser(f.user, () => updateSubjectWithTeacherAssignment(f.user, { id: b.subject.id, classId: other.cls.id })), { status: 409 });
  await assert.rejects(() => asUser(f.user, () => updateClassWithTeacherAssignment(f.user, { id: b.cls.id, academicYear: 2027 })), { status: 409 });
  assert.equal((await db.subject.findUniqueOrThrow({ where: { id: b.subject.id } })).classId, b.cls.id);
  assert.equal((await db.class.findUniqueOrThrow({ where: { id: b.cls.id } })).academicYear, 2026);
});

test("fresh account and module revocation block scheduled assignments immediately", async () => {
  const f = await fixture(), b = await board(f);
  for (const permissionModule of ["exams", "timetable"]) {
    const grant = await db.rolePermission.create({ data: { schoolId, role: "CAMPUS_ADMIN", module: permissionModule, canView: true, canAdd: true, canEdit: false, canDelete: true } });
    try { await assert.rejects(() => assign(f, b.subject.id), { status: 403 }); } finally { await db.rolePermission.delete({ where: { id: grant.id } }); }
  }
  const studentGrant = await db.rolePermission.create({ data: { schoolId, role: "CAMPUS_ADMIN", module: "students", canView: true, canAdd: true, canEdit: false, canDelete: true } });
  try { await assert.rejects(() => asUser(f.user, () => updateClassWithTeacherAssignment(f.user, { id: b.cls.id, classTeacherId: f.newTeacherId })), { status: 403 }); } finally { await db.rolePermission.delete({ where: { id: studentGrant.id } }); }
  await db.user.update({ where: { id: f.user.userId }, data: { accessVersion: { increment: 1 } } });
  await assert.rejects(() => asUser({ ...f.user, accessVersion: 0 }, () => updateSubjectWithTeacherAssignment({ ...f.user, accessVersion: 0 }, { id: b.subject.id, teacherId: f.newTeacherId })), { status: 403 });
  assert.equal((await db.subject.findUniqueOrThrow({ where: { id: b.subject.id } })).teacherId, f.oldTeacherId);
});

test("two concurrent subject assignments cannot reserve the same teacher twice", async () => {
  const f = await fixture(), first = await board(f), second = await board(f);
  const results = await Promise.allSettled([assign(f, first.subject.id), assign(f, second.subject.id)]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(results.filter(result => result.status === "rejected").length, 1);
  assert.equal(await db.timetableSlot.count({ where: { schoolId, teacherId: f.newTeacherId } }), 1);
  assert.equal(await db.auditLog.count({ where: { schoolId, recordId: { in: [first.subject.id, second.subject.id] } } }), 1);
});

test("manual teacher reassignment and reviewed AI schedule creation share the same reservation fence", async () => {
  const f = await fixture(), b = await board(f);
  const cls = await db.class.create({ data: { schoolId, campusId: f.campusId, name: "AI proposed class", academicYear: 2026, teachingMode: "SUBJECT" } });
  const subject = await db.subject.create({ data: { schoolId, campusId: f.campusId, classId: cls.id, name: "Language", teacherId: f.newTeacherId } });
  const room = await db.classRoom.create({ data: { schoolId, campusId: f.campusId, roomNumber: "AI room", capacity: 30 } });
  const proposal = { operation: "timetable.create_draft", classId: cls.id, academicYear: 2026, term: "TERM_1", slots: [{ id: "ai-lesson", dayOfWeek: 1, periodNumber: 1, startTime: "08:00", endTime: "08:40", slotType: "CLASS", subjectId: subject.id, teacherId: f.newTeacherId, roomId: room.id }] };
  const record = await createWorkspaceRecord(f.user, { kind: "WORKFLOW", title: "Reviewed competing reservation", campusId: f.campusId, idempotencyKey: randomUUID(), data: { goal: "Create one draft lesson", steps: [{ id: "schedule", title: "Create draft", status: "ready", module: "timetable" }], sourceIds: [], missingInformation: [], proposal } });
  const approved = await updateWorkspaceRecord(f.user, record.id, { version: record.version, action: "approve" });
  const preview = await previewSchoolAiExecution(f.user, record.id, "timetable.create_draft", approved.version);
  const results = await Promise.allSettled([assign(f, b.subject.id), executeSchoolAiTool(f.user, record.id, { operation: "timetable.create_draft", version: approved.version, previewHash: preview.previewHash, idempotencyKey: randomUUID() })]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(results.filter(result => result.status === "rejected").length, 1);
  assert.equal(await db.timetableSlot.count({ where: { schoolId, teacherId: f.newTeacherId } }), 1);
});

test("subject deletion preserves booked teacher and times while clearing its reference atomically", async () => {
  const f = await fixture(), b = await board(f);
  const grant = await db.rolePermission.create({ data: { schoolId, role: "CAMPUS_ADMIN", module: "timetable", canView: true, canAdd: true, canEdit: false, canDelete: true } });
  try { await assert.rejects(() => asUser(f.user, () => deleteSubjectWithTimetableSync(f.user, b.subject.id)), { status: 403 }); } finally { await db.rolePermission.delete({ where: { id: grant.id } }); }
  assert(await db.subject.findUnique({ where: { id: b.subject.id } }));
  await asUser(f.user, () => deleteSubjectWithTimetableSync(f.user, b.subject.id));
  const slot = await db.timetableSlot.findUniqueOrThrow({ where: { id: b.table.slots[0].id } });
  assert.equal(slot.subjectId, null); assert.equal(slot.teacherId, f.oldTeacherId); assert.equal(slot.startTime, "08:00");
  assert.equal(await db.auditLog.count({ where: { schoolId, recordId: b.subject.id } }), 1);
});
