import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { validateStoredTimetable } from "../../src/lib/timetable/validate";
import { createWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { executeSchoolAiTool, listSchoolAiExecutions, previewSchoolAiExecution } from "../../src/lib/school-ai/execution";
import { getTimetableSetupOptions } from "../../src/lib/school-ai/timetable-setup-service";
import type { TimetableSetupProposal } from "../../src/lib/school-ai/timetable-setup";
import { createDraftTimetableSlot } from "../../src/lib/timetable/draft-slot";
import { getAvailableRooms, getAvailableTeachers } from "../../src/lib/academic/availability";
import { createManualTimetable, saveManualTimetable, changeManualTimetableStatus, deleteManualTimetable, applyManualTimetableSuggestion } from "../../src/lib/timetable/manual";

const local = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== local || process.env.DIRECT_URL !== local) throw new Error("Use only the isolated school AI PostgreSQL fixture.");
const db = new PrismaClient(), schoolId = `timetable-ai-${randomUUID()}`;
before(async () => { await db.school.create({ data: { id: schoolId, name: "Synthetic timetable school", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Test", status: "ACTIVE" } }); });
after(async () => { await db.schoolAiExecution.deleteMany({ where: { schoolId } }); await db.school.delete({ where: { id: schoolId } }); await db.$disconnect(); await prisma.$disconnect(); });
async function fixture() {
  const campusId = randomUUID(), classId = randomUUID(), subjectId = randomUUID(), roomId = randomUUID(), teacherId = randomUUID(), actorId = randomUUID();
  await db.campus.create({ data: { id: campusId, schoolId, name: "Synthetic timetable campus", regId: campusId, city: "Test" } });
  await db.user.createMany({ data: [{ id: actorId, schoolId, campusId, email: `${actorId}@example.invalid`, fullName: "Planner", role: "CAMPUS_ADMIN" }, { id: teacherId, schoolId, campusId, email: `${teacherId}@example.invalid`, fullName: "Assigned teacher", role: "TEACHER", isActive: true }] });
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Grade 8", section: "A", academicYear: 2026, teachingMode: "SUBJECT" } });
  await db.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Mathematics", teacherId } });
  await db.classRoom.create({ data: { id: roomId, schoolId, campusId, roomNumber: "A-1", capacity: 30 } });
  const user: AuthUser = { userId: actorId, schoolId, campusId, role: "CAMPUS_ADMIN", email: `${actorId}@example.invalid` };
  const proposal: TimetableSetupProposal = { operation: "timetable.create_draft", classId, academicYear: 2026, term: "ANNUAL", slots: [{ id: "lesson-one", dayOfWeek: 1, periodNumber: 1, startTime: "08:00", endTime: "08:40", slotType: "CLASS", subjectId, teacherId, roomId }] };
  return { campusId, classId, subjectId, roomId, teacherId, user, proposal };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function draft(f: Fixture, proposal = f.proposal) { return createWorkspaceRecord(f.user, { kind: "WORKFLOW", title: "Reviewed timetable", campusId: f.campusId, idempotencyKey: randomUUID(), data: { goal: "Create a reviewed draft timetable", steps: [{ id: "schedule", title: "Check and create draft periods", status: "ready", module: "timetable" }], sourceIds: [], missingInformation: [], proposal } }); }
async function approved(f: Fixture, proposal = f.proposal) { const record = await draft(f, proposal); return updateWorkspaceRecord(f.user, record.id, { version: record.version, action: "approve" }); }
async function preview(f: Fixture, record: Awaited<ReturnType<typeof approved>>) { return previewSchoolAiExecution(f.user, record.id, "timetable.create_draft", record.version); }
async function apply(f: Fixture, record: Awaited<ReturnType<typeof approved>>, hash: string, key = randomUUID()) { return executeSchoolAiTool(f.user, record.id, { operation: "timetable.create_draft", version: record.version, previewHash: hash, idempotencyKey: key }); }
async function otherSchedule(f: Fixture, patch: Partial<TimetableSetupProposal["slots"][number]> = {}, year = 2026, term = "ANNUAL") {
  const cls = await db.class.create({ data: { schoolId, campusId: f.campusId, name: "Grade 9", academicYear: year } });
  const { id: _, ...slot } = { ...f.proposal.slots[0], ...patch };
  return db.timetable.create({ data: { schoolId, campusId: f.campusId, classId: cls.id, academicYear: year, term, status: "PUBLISHED", slots: { create: { ...slot, schoolId } } }, include: { slots: true } });
}
async function applied(f: Fixture) {
  const record = await approved(f);
  return apply(f, record, (await preview(f, record)).previewHash);
}
const emptyTuesday = { dayOfWeek: 2, periodNumber: 1, startTime: "08:00", endTime: "08:40" };
async function manualBoard(f: Fixture, label: string, period = 1, start = "08:00", end = "08:40") {
  const cls = await db.class.create({ data: { schoolId, campusId: f.campusId, name: label, academicYear: 2026, teachingMode: "SUBJECT" } });
  const subject = await db.subject.create({ data: { schoolId, campusId: f.campusId, classId: cls.id, name: "Math", teacherId: f.teacherId } });
  const board = await createManualTimetable(f.user, f.campusId, { classId: cls.id, academicYear: 2026, periods: [{ period, start, end }] });
  return { board, subject, slot: board.slots.find(item => item.dayOfWeek === 1)! };
}
test("competing manual saves cannot both reserve the same teacher or room", async () => {
  const f = await fixture(), first = await manualBoard(f, "First"), second = await manualBoard(f, "Second");
  const results = await Promise.allSettled([first, second].map(item => saveManualTimetable(f.user, f.campusId, item.board.id, [{ id: item.slot.id, subjectId: item.subject.id, teacherId: f.teacherId, roomId: f.roomId }])));
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  const failed = results.find(result => result.status === "rejected"); assert(failed?.status === "rejected"); assert.equal(failed.reason.status, 409);
  assert.equal(await db.timetableSlot.count({ where: { schoolId, timetable: { campusId: f.campusId }, dayOfWeek: 1, teacherId: f.teacherId } }), 1);
});
test("manual save and reviewed AI execution share one campus fence even across different period numbers", async () => {
  const f = await fixture(), manual = await manualBoard(f, "Manual", 7, "08:20", "09:00"), record = await approved(f), checked = await preview(f, record);
  const results = await Promise.allSettled([
    saveManualTimetable(f.user, f.campusId, manual.board.id, [{ id: manual.slot.id, subjectId: manual.subject.id, teacherId: f.teacherId, roomId: f.roomId }]),
    apply(f, record, checked.previewHash),
  ]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(await db.timetableSlot.count({ where: { schoolId, timetable: { campusId: f.campusId }, dayOfWeek: 1, teacherId: f.teacherId } }), 1);
});
test("manual create and AI draft execution cannot create overlapping class schedules", async () => {
  const f = await fixture(), record = await approved(f), checked = await preview(f, record);
  const results = await Promise.allSettled([
    createManualTimetable(f.user, f.campusId, { classId: f.classId, academicYear: 2026, term: "TERM_1", periods: [{ period: 1, start: "08:00", end: "08:40" }] }),
    apply(f, record, checked.previewHash),
  ]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(await db.timetable.count({ where: { schoolId, campusId: f.campusId, classId: f.classId } }), 1);
});
test("partial manual edits validate the merged board and suggestion moves rollback both halves on a clash", async () => {
  const f = await fixture(), record = await approved(f), receipt = await apply(f, record, (await preview(f, record)).previewHash);
  const board = await db.timetable.findUniqueOrThrow({ where: { id: receipt.timetableId }, include: { slots: true } });
  const target = await createDraftTimetableSlot(f.user, board.id, emptyTuesday);
  const other = await otherSchedule(f, { dayOfWeek: 2 });
  await assert.rejects(() => applyManualTimetableSuggestion(f.user, f.campusId, board.id, { type: "MOVE_SLOT", slotId: board.slots[0].id, targetSlotId: target.id }), { status: 409 });
  assert.equal((await db.timetableSlot.findUniqueOrThrow({ where: { id: board.slots[0].id } })).subjectId, f.subjectId);
  assert.equal((await db.timetableSlot.findUniqueOrThrow({ where: { id: target.id } })).subjectId, null);
  await db.timetable.delete({ where: { id: other.id } });
  await otherSchedule(f, { dayOfWeek: 1 });
  const moved = await applyManualTimetableSuggestion(f.user, f.campusId, board.id, { type: "MOVE_SLOT", slotId: board.slots[0].id, targetSlotId: target.id });
  assert.equal(moved.data.slots.find(slot => slot.id === target.id)?.subjectId, f.subjectId);
  assert.equal(moved.data.slots.find(slot => slot.id === board.slots[0].id)?.subjectId, null);
  // Patch IDs cannot lie about their stored day/period; only whitelisted values merge.
  await assert.rejects(() => saveManualTimetable(f.user, f.campusId, board.id, [{ id: board.slots[0].id, dayOfWeek: 4, periodNumber: 9, subjectId: f.subjectId, teacherId: f.teacherId, roomId: f.roomId }]), { status: 409 });
});
test("manual mutations honor fresh grants and publish retries produce one committed transition", async () => {
  const f = await fixture(), manual = await manualBoard(f, "Manual");
  await saveManualTimetable(f.user, f.campusId, manual.board.id, [{ id: manual.slot.id, subjectId: manual.subject.id, teacherId: f.teacherId, roomId: f.roomId }]);
  const results = await Promise.all([1, 2, 3].map(() => changeManualTimetableStatus(f.user, f.campusId, manual.board.id, "publish")));
  assert.equal(results.filter(result => result.changed).length, 1);
  assert.equal((await changeManualTimetableStatus(f.user, f.campusId, manual.board.id, "unpublish")).data.status, "DRAFT");
  const grant = await db.rolePermission.create({ data: { schoolId, role: "CAMPUS_ADMIN", module: "timetable", canView: true, canAdd: true, canEdit: false, canDelete: true } });
  try { await assert.rejects(() => saveManualTimetable(f.user, f.campusId, manual.board.id, [{ id: manual.slot.id, roomId: null }]), { status: 403 }); } finally { await db.rolePermission.delete({ where: { id: grant.id } }); }
  const foreign = await fixture();
  await assert.rejects(() => saveManualTimetable(foreign.user, foreign.campusId, manual.board.id, [{ id: manual.slot.id, teacherId: null }]), { status: 404 });
  await deleteManualTimetable(f.user, f.campusId, manual.board.id);
  assert.equal(await db.timetable.count({ where: { id: manual.board.id } }), 0);
});

test("a reviewed sparse timetable can gain an owned blank cell without changing existing lessons", async () => {
  const f = await fixture(), receipt = await applied(f);
  const original = await db.timetableSlot.findMany({ where: { timetableId: receipt.timetableId } });
  const slot = await createDraftTimetableSlot(f.user, receipt.timetableId, emptyTuesday);
  assert.equal(slot.timetableId, receipt.timetableId); assert.equal(slot.slotType, "CLASS");
  assert.equal(slot.subjectId, null); assert.equal(slot.teacherId, null); assert.equal(slot.roomId, null);
  assert.equal(slot.subject, null); assert.equal(slot.teacher, null); assert.equal(slot.room, null);
  assert.deepEqual(await db.timetableSlot.findMany({ where: { id: { in: original.map(item => item.id) } } }), original);
  assert.equal(await db.timetableSlot.count({ where: { id: slot.id, timetableId: receipt.timetableId, schoolId } }), 1);
  assert.equal(await db.auditLog.count({ where: { schoolId, tableName: "timetable_slots", recordId: slot.id } }), 1);
  assert.equal((await db.timetable.findUniqueOrThrow({ where: { id: receipt.timetableId } })).status, "DRAFT");
  // A later assignment must survive an exact retry of the earlier blank-cell request.
  await db.timetableSlot.update({ where: { id: slot.id }, data: { subjectId: f.subjectId, teacherId: f.teacherId, roomId: f.roomId } });
  const retry = await createDraftTimetableSlot(f.user, receipt.timetableId, emptyTuesday);
  assert.equal(retry.id, slot.id); assert.equal(retry.subjectId, f.subjectId); assert.equal(retry.teacherId, f.teacherId);
  assert.equal(await db.auditLog.count({ where: { schoolId, tableName: "timetable_slots", recordId: slot.id } }), 1);
});
test("concurrent blank-cell retries create one slot and one audit; changed times cannot overwrite it", async () => {
  const f = await fixture(), receipt = await applied(f);
  const results = await Promise.all([1, 2, 3].map(() => createDraftTimetableSlot(f.user, receipt.timetableId, emptyTuesday)));
  assert.equal(new Set(results.map(item => item.id)).size, 1);
  assert.equal(await db.timetableSlot.count({ where: { timetableId: receipt.timetableId } }), 2);
  assert.equal(await db.auditLog.count({ where: { schoolId, tableName: "timetable_slots", recordId: results[0].id } }), 1);
  await assert.rejects(() => createDraftTimetableSlot(f.user, receipt.timetableId, { ...emptyTuesday, endTime: "08:50" }), { code: "TIMETABLE_SLOT_EXISTS" });
});
test("blank-cell creation enforces current calendar, period windows and class lifecycle", async () => {
  const f = await fixture(), receipt = await applied(f);
  await assert.rejects(() => createDraftTimetableSlot(f.user, receipt.timetableId, { ...emptyTuesday, startTime: "09:00", endTime: "09:40" }), { code: "TIMETABLE_PERIOD_INCONSISTENT" });
  await assert.rejects(() => createDraftTimetableSlot(f.user, receipt.timetableId, { ...emptyTuesday, dayOfWeek: 1, periodNumber: 2, startTime: "08:20", endTime: "09:00" }), { code: "TIMETABLE_SLOT_OVERLAP" });
  const weekend = await db.weekend.create({ data: { schoolId, campusId: f.campusId, dayOfWeek: 2 } });
  await assert.rejects(() => createDraftTimetableSlot(f.user, receipt.timetableId, emptyTuesday), { code: "TIMETABLE_WEEKEND" });
  await db.weekend.delete({ where: { id: weekend.id } });
  const period = await db.periodDefinition.create({ data: { schoolId, campusId: f.campusId, periodNumber: 1, timeType: "CLASS", startTime: "09:00", endTime: "09:40" } });
  await assert.rejects(() => createDraftTimetableSlot(f.user, receipt.timetableId, emptyTuesday), { code: "TIMETABLE_PERIOD_CHANGED" });
  await db.periodDefinition.delete({ where: { id: period.id } });
  await db.class.update({ where: { id: f.classId }, data: { archivedAt: new Date() } });
  await assert.rejects(() => createDraftTimetableSlot(f.user, receipt.timetableId, emptyTuesday), { code: "TIMETABLE_SCOPE" });
  await db.class.update({ where: { id: f.classId }, data: { archivedAt: null } });
  await db.academicCycle.create({ data: { schoolId, campusId: f.campusId, academicYear: 2026, label: "Ended synthetic year", status: "ENDED" } });
  await assert.rejects(() => createDraftTimetableSlot(f.user, receipt.timetableId, emptyTuesday), { code: "TIMETABLE_SCOPE" });
  assert.equal(await db.timetableSlot.count({ where: { timetableId: receipt.timetableId } }), 1);
});
test("blank-cell creation requires draft status, current membership, campus and freshly granted edit permission", async () => {
  const f = await fixture(), receipt = await applied(f), other = await fixture();
  await assert.rejects(() => createDraftTimetableSlot(other.user, receipt.timetableId, emptyTuesday), { status: 404 });
  await assert.rejects(() => createDraftTimetableSlot({ ...f.user, role: "TEACHER" }, receipt.timetableId, emptyTuesday), { status: 403 });
  await db.user.update({ where: { id: f.user.userId }, data: { isActive: false } });
  await assert.rejects(() => createDraftTimetableSlot(f.user, receipt.timetableId, emptyTuesday), { code: "PERMISSION_DENIED" });
  await db.user.update({ where: { id: f.user.userId }, data: { isActive: true } });
  const grant = await db.rolePermission.create({ data: { schoolId, role: "CAMPUS_ADMIN", module: "timetable", canView: true, canAdd: true, canEdit: false, canDelete: false } });
  try { await assert.rejects(() => createDraftTimetableSlot(f.user, receipt.timetableId, emptyTuesday), { code: "PERMISSION_DENIED" }); } finally { await db.rolePermission.delete({ where: { id: grant.id } }); }
  await db.timetable.update({ where: { id: receipt.timetableId }, data: { status: "PUBLISHED", publishedAt: new Date() } });
  await assert.rejects(() => createDraftTimetableSlot(f.user, receipt.timetableId, emptyTuesday), { code: "TIMETABLE_DRAFT_REQUIRED" });
  assert.equal(await db.timetableSlot.count({ where: { timetableId: receipt.timetableId } }), 1);
});

test("approved timetable applies exact slots to one draft with an atomic receipt and no publication", async () => {
  const f = await fixture(), record = await draft(f);
  await assert.rejects(() => preview(f, record), { code: "STALE_WORKSPACE_VERSION" });
  const ready = await updateWorkspaceRecord(f.user, record.id, { version: record.version, action: "approve" });
  const checked = await preview(f, ready);
  assert.equal(await db.timetable.count({ where: { campusId: f.campusId } }), 0);
  assert.equal(checked.slots[0].teacherName, "Assigned teacher");
  const key = randomUUID(), receipt = await apply(f, ready, checked.previewHash, key);
  assert.deepEqual(await apply(f, ready, checked.previewHash, key), receipt);
  const saved = await db.timetable.findUniqueOrThrow({ where: { id: receipt.timetableId }, include: { slots: true } });
  assert.equal(saved.status, "DRAFT"); assert.equal(saved.publishedAt, null); assert.equal(saved.slots.length, 1);
  assert.equal(saved.slots[0].subjectId, f.subjectId); assert.equal(saved.slots[0].teacherId, f.teacherId); assert.equal(saved.slots[0].roomId, f.roomId);
  assert.equal(await db.auditLog.count({ where: { schoolId, recordId: receipt.id } }), 1);
  assert.equal((await listSchoolAiExecutions(f.user, ready.id)).length, 1);
  await assert.rejects(() => apply(f, ready, "f".repeat(64), key), { code: "EXECUTION_KEY_CONFLICT" });
});
test("existing class schedules are preserved and annual schedules conflict with overlapping terms", async () => {
  const f = await fixture();
  const current = await db.timetable.create({ data: { schoolId, campusId: f.campusId, classId: f.classId, academicYear: 2026, term: "TERM_1", status: "PUBLISHED" } });
  await assert.rejects(() => approved(f).then(record => preview(f, record)), { code: "TIMETABLE_EXISTS" });
  assert.deepEqual(await db.timetable.findUniqueOrThrow({ where: { id: current.id } }), current);
  const second = await approved(f, { ...f.proposal, term: "TERM_2" });
  assert.equal((await preview(f, second)).term, "TERM_2");
});
test("clash checks include actual overlapping times across different period numbers and same-period reservations", async () => {
  for (const patch of [{ periodNumber: 7, startTime: "08:20", endTime: "09:00" }, { periodNumber: 1, startTime: "10:00", endTime: "10:40" }]) {
    const f = await fixture(), record = await approved(f), other = await otherSchedule(f, patch);
    await assert.rejects(() => preview(f, record), { code: "TIMETABLE_CLASH" });
    assert.deepEqual(await db.timetable.findUniqueOrThrow({ where: { id: other.id }, include: { slots: true } }), other);
  }
});
test("historical years and disjoint terms do not produce invented clashes", async () => {
  const f = await fixture(); await otherSchedule(f, {}, 2025); await otherSchedule(f, {}, 2026, "TERM_1");
  const record = await approved(f, { ...f.proposal, term: "TERM_2" });
  const checked = await preview(f, record);
  assert.equal(checked.warnings.length, 0);
  const created = await apply(f, record, checked.previewHash);
  assert.equal((await runWithTenantContext({ schoolId, campusId: f.campusId, userId: f.user.userId, role: f.user.role }, () => validateStoredTimetable(created.timetableId, f.campusId))).canPublish, true);
  await db.timetable.delete({ where: { id: created.timetableId } });
  await otherSchedule(f, {}, 2026, "Legacy term with unknown dates");
  await assert.rejects(() => preview(f, record), { code: "TIMETABLE_CLASH" });
});
test("manual editor availability uses the selected timetable year and overlapping term", async () => {
  const f = await fixture();
  await otherSchedule(f, {}, 2025); await otherSchedule(f, {}, 2026, "TERM_1");
  const current = await db.timetable.create({ data: { schoolId, campusId: f.campusId, classId: f.classId, academicYear: 2026, term: "TERM_2" } });
  const options = () => runWithTenantContext({ schoolId, campusId: f.campusId, userId: f.user.userId, role: f.user.role }, () => Promise.all([getAvailableTeachers(f.campusId, 1, 1, current.id), getAvailableRooms(f.campusId, 1, 1, current.id)]));
  const [teachers, rooms] = await options();
  assert(teachers.some(item => item.id === f.teacherId)); assert(rooms.some(item => item.id === f.roomId));
  await db.timetable.update({ where: { id: current.id }, data: { term: "Legacy custom term" } });
  const [blockedTeachers, blockedRooms] = await options();
  assert(!blockedTeachers.some(item => item.id === f.teacherId)); assert(!blockedRooms.some(item => item.id === f.roomId));
  const foreign = await fixture();
  await assert.rejects(() => runWithTenantContext({ schoolId, campusId: foreign.campusId, userId: foreign.user.userId, role: foreign.user.role }, () => getAvailableRooms(foreign.campusId, 1, 1, current.id)), { status: 404 });
});
test("current class subject, active teacher, campus room and assignment references are authoritative", async () => {
  const f = await fixture(), foreign = await fixture();
  for (const patch of [{ subjectId: foreign.subjectId }, { teacherId: foreign.teacherId }, { roomId: foreign.roomId }]) {
    const record = await approved(f, { ...f.proposal, slots: [{ ...f.proposal.slots[0], ...patch }] });
    await assert.rejects(() => preview(f, record), { code: "TIMETABLE_REFERENCE" });
  }
  const record = await approved(f);
  await db.subject.update({ where: { id: f.subjectId }, data: { teacherId: null } });
  await assert.rejects(() => preview(f, record), { code: "TIMETABLE_ASSIGNMENT" });
  await db.subject.update({ where: { id: f.subjectId }, data: { teacherId: f.teacherId } });
  await db.user.update({ where: { id: f.teacherId }, data: { isActive: false } });
  await assert.rejects(() => preview(f, record), { code: "TIMETABLE_REFERENCE" });
});
test("single-teacher classes use their assigned class teacher and archived classes or closed cycles cannot apply", async () => {
  const f = await fixture(), record = await approved(f);
  await db.class.update({ where: { id: f.classId }, data: { teachingMode: "SINGLE", classTeacherId: null } });
  await assert.rejects(() => preview(f, record), { code: "TIMETABLE_ASSIGNMENT" });
  await db.class.update({ where: { id: f.classId }, data: { classTeacherId: f.teacherId } });
  assert.equal((await preview(f, record)).slots[0].teacherName, "Assigned teacher");
  await db.class.update({ where: { id: f.classId }, data: { archivedAt: new Date() } });
  await assert.rejects(() => preview(f, record), { code: "TIMETABLE_SCOPE" });
  await db.class.update({ where: { id: f.classId }, data: { archivedAt: null } });
  await db.academicCycle.create({ data: { schoolId, campusId: f.campusId, academicYear: 2026, label: "Closed synthetic year", status: "ENDED" } });
  await assert.rejects(() => preview(f, record), { code: "TIMETABLE_SCOPE" });
});
test("period definitions and invalid existing times fail visibly rather than claiming a valid timetable", async () => {
  const f = await fixture(), record = await approved(f);
  const definition = await db.periodDefinition.create({ data: { schoolId, campusId: f.campusId, periodNumber: 1, startTime: "09:00", endTime: "09:40", timeType: "CLASS" } });
  await assert.rejects(() => preview(f, record), { code: "TIMETABLE_PERIOD_CHANGED" });
  await db.periodDefinition.delete({ where: { id: definition.id } });
  await otherSchedule(f, { startTime: "invalid" });
  await assert.rejects(() => preview(f, record), { code: "TIMETABLE_EXISTING_INVALID" });
});
test("different times for one period across days cannot create a misleading weekly draft", async () => {
  const f = await fixture();
  assert.equal(await db.periodDefinition.count({ where: { schoolId, campusId: f.campusId } }), 0);
  const inconsistent: TimetableSetupProposal = { ...f.proposal, slots: [f.proposal.slots[0], { ...f.proposal.slots[0], id: "tuesday", dayOfWeek: 2, startTime: "09:00", endTime: "09:40" }] };
  await assert.rejects(() => draft(f, inconsistent), (error: unknown) => error instanceof Error && error.message.includes("same start and end times"));
  assert.equal(await db.schoolAiRecord.count({ where: { schoolId, campusId: f.campusId } }), 0);
  assert.equal(await db.timetable.count({ where: { schoolId, campusId: f.campusId } }), 0);
  assert.equal(await db.schoolAiExecution.count({ where: { schoolId, campusId: f.campusId } }), 0);
});
test("room capacity is an explicit reviewed warning, and changing it invalidates the prior preview", async () => {
  const f = await fixture(), record = await approved(f);
  await db.classRoom.update({ where: { id: f.roomId }, data: { capacity: 0 } });
  const before = await preview(f, record); assert.equal(before.warnings[0].code, "ROOM_CAPACITY_UNKNOWN");
  await db.classRoom.update({ where: { id: f.roomId }, data: { capacity: 1 } });
  await db.student.createMany({ data: [1, 2].map(index => ({ schoolId, campusId: f.campusId, classId: f.classId, fullName: `Synthetic ${index}`, rollNo: String(index), gender: "OTHER" as const })) });
  await assert.rejects(() => apply(f, record, before.previewHash), { code: "STALE_EXECUTION_PREVIEW" });
  const after = await preview(f, record); assert.equal(after.warnings[0].code, "ROOM_CAPACITY"); assert.equal(after.warnings[0].classSize, 2);
});
test("concurrent same-version retries create one timetable, slot set and receipt", async () => {
  const f = await fixture(), record = await approved(f), checked = await preview(f, record);
  const [one, two] = await Promise.all([apply(f, record, checked.previewHash), apply(f, record, checked.previewHash)]);
  assert.equal(one.id, two.id); assert.equal(await db.timetable.count({ where: { campusId: f.campusId } }), 1); assert.equal(await db.timetableSlot.count({ where: { timetableId: one.timetableId } }), 1);
});
test("concurrent distinct reviewed proposals cannot reserve the same class twice", async () => {
  const f = await fixture(), records = await Promise.all([approved(f), approved(f)]);
  const previews = await Promise.all(records.map(record => preview(f, record)));
  const results = await Promise.allSettled(records.map((record, index) => apply(f, record, previews[index].previewHash)));
  assert.equal(results.filter(item => item.status === "fulfilled").length, 1);
  assert.equal(await db.timetable.count({ where: { campusId: f.campusId } }), 1);
  assert.equal(await db.schoolAiExecution.count({ where: { schoolId, campusId: f.campusId } }), 1);
});
test("timetable execution rejects cross-campus access, families, teachers and freshly revoked module grants", async () => {
  const f = await fixture(), record = await approved(f), checked = await preview(f, record), other = await fixture();
  await assert.rejects(() => previewSchoolAiExecution(other.user, record.id, "timetable.create_draft", record.version), { status: 404 });
  for (const role of ["TEACHER", "PARENT", "STUDENT"] as const) await assert.rejects(() => previewSchoolAiExecution({ ...f.user, role }, record.id, "timetable.create_draft", record.version), { status: 403 });
  const principal = { ...f.user, role: "PRINCIPAL" as const };
  await previewSchoolAiExecution(principal, record.id, "timetable.create_draft", record.version);
  const grant = await db.rolePermission.create({ data: { schoolId, role: "PRINCIPAL", module: "timetable", canView: true, canAdd: false, canEdit: false, canDelete: false } });
  try { await assert.rejects(() => executeSchoolAiTool(principal, record.id, { operation: "timetable.create_draft", version: record.version, previewHash: checked.previewHash, idempotencyKey: randomUUID() }), { status: 403 }); } finally { await db.rolePermission.delete({ where: { id: grant.id } }); }
  await updateWorkspaceRecord(f.user, record.id, { version: record.version, title: "Revised plan" });
  await assert.rejects(() => apply(f, record, checked.previewHash), { code: "STALE_WORKSPACE_VERSION" });
});
test("concurrent plans for different classes cannot double-book a shared teacher and room", async () => {
  const f = await fixture();
  const otherClass = await db.class.create({ data: { schoolId, campusId: f.campusId, name: "Grade 9", academicYear: 2026, teachingMode: "SUBJECT" } });
  const otherSubject = await db.subject.create({ data: { schoolId, campusId: f.campusId, classId: otherClass.id, name: "Science", teacherId: f.teacherId } });
  const second = { ...f.proposal, classId: otherClass.id, slots: [{ ...f.proposal.slots[0], subjectId: otherSubject.id }] };
  const records = [await approved(f), await approved(f, second)];
  const checked = await Promise.all(records.map(record => preview(f, record)));
  const results = await Promise.allSettled(records.map((record, index) => apply(f, record, checked[index].previewHash)));
  assert.equal(results.filter(item => item.status === "fulfilled").length, 1);
  const failed = results.find(item => item.status === "rejected") as PromiseRejectedResult;
  assert.equal(failed.reason.code, "TIMETABLE_CLASH");
  assert.equal(await db.timetable.count({ where: { campusId: f.campusId } }), 1);
  assert.equal(await db.schoolAiExecution.count({ where: { schoolId, campusId: f.campusId } }), 1);
});
test("timetable options reuse only active records in the authorized campus", async () => {
  const f = await fixture(), other = await fixture();
  const options = await getTimetableSetupOptions(f.user, f.campusId);
  assert.deepEqual(options.classes.map(item => item.id), [f.classId]); assert.deepEqual(options.subjects.map(item => item.id), [f.subjectId]);
  assert(!options.teachers.some(item => item.id === other.teacherId)); assert(!options.rooms.some(item => item.id === other.roomId));
  await assert.rejects(() => getTimetableSetupOptions(f.user, other.campusId), { status: 403 });
  await assert.rejects(() => getTimetableSetupOptions({ ...f.user, role: "TEACHER" }, f.campusId), { status: 403 });
});
test("live weekend policies reject non-working days and invalidate previews when the calendar changes", async () => {
  const f = await fixture(), record = await approved(f), checked = await preview(f, record);
  const policy = await db.localePolicy.create({ data: { schoolId, campusId: f.campusId, scopeKey: `campus:${f.campusId}`, status: "ACTIVE", effectiveAt: new Date(Date.now() - 1000), settings: { weekend: [2] }, createdBy: f.user.userId } });
  assert.deepEqual((await getTimetableSetupOptions(f.user, f.campusId)).weekendDays, [2]);
  await assert.rejects(() => apply(f, record, checked.previewHash), { code: "STALE_EXECUTION_PREVIEW" });
  await db.localePolicy.update({ where: { id: policy.id }, data: { settings: { weekend: [1] } } });
  await assert.rejects(() => preview(f, record), { code: "TIMETABLE_WEEKEND" });
  assert.equal(await db.timetable.count({ where: { campusId: f.campusId } }), 0);
});
test("execution history does not reveal earlier operation receipts after module access is revoked", async () => {
  const f = await fixture(), record = await approved(f), checked = await preview(f, record);
  const timetable = await apply(f, record, checked.previewHash);
  const changed = await updateWorkspaceRecord(f.user, record.id, { version: record.version, data: { goal: "Reviewed academic setup", steps: [{ id: "academic", title: "Create classes", status: "ready", module: "academics" }], sourceIds: [], missingInformation: [], proposal: { operation: "academics.setup_year", academicYear: 2027, label: "2027", startDate: null, endDate: null, classes: [{ id: "grade-one", name: "Grade 1", section: null, teachingMode: "SINGLE" }] } } });
  const principal = { ...f.user, role: "PRINCIPAL" as const };
  assert((await listSchoolAiExecutions(principal, changed.id)).some(item => item.id === timetable.id));
  const grant = await db.rolePermission.create({ data: { schoolId, role: "PRINCIPAL", module: "timetable", canView: false, canAdd: false, canEdit: false, canDelete: false } });
  try { assert.deepEqual(await listSchoolAiExecutions(principal, changed.id), []); } finally { await db.rolePermission.delete({ where: { id: grant.id } }); }
});

test("unpublish and delete remain available for archived schedules without allowing new bookings", async () => {
  const f = await fixture(), manual = await manualBoard(f, "Historical cleanup");
  await changeManualTimetableStatus(f.user, f.campusId, manual.board.id, "publish");
  await db.class.update({ where: { id: manual.board.classId }, data: { archivedAt: new Date() } });
  await db.campus.update({ where: { id: f.campusId }, data: { archivedAt: new Date() } });
  await assert.rejects(() => saveManualTimetable(f.user, f.campusId, manual.board.id, [{ id: manual.slot.id, teacherId: null }]), { status: 404 });
  await assert.rejects(() => changeManualTimetableStatus(f.user, f.campusId, manual.board.id, "publish"), { status: 404 });
  assert.equal((await changeManualTimetableStatus(f.user, f.campusId, manual.board.id, "unpublish")).data.status, "DRAFT");
  await deleteManualTimetable(f.user, f.campusId, manual.board.id);
  assert.equal(await db.timetable.count({ where: { id: manual.board.id } }), 0);
});

test("suggestions progressively repair independent clashes without replacing a removed conflict with a new booking", async () => {
  const f = await fixture(), manual = await manualBoard(f, "Repair legacy board");
  await saveManualTimetable(f.user, f.campusId, manual.board.id, [{ id: manual.slot.id, subjectId: manual.subject.id, teacherId: f.teacherId, roomId: f.roomId }]);
  const goodTeacher = randomUUID(), busyTeacher = randomUUID();
  await db.user.createMany({ data: [goodTeacher, busyTeacher].map(id => ({ id, schoolId, campusId: f.campusId, email: `${id}@example.invalid`, fullName: "Same display name", role: "TEACHER" as const, isActive: true })) });
  const goodRoom = await db.classRoom.create({ data: { schoolId, campusId: f.campusId, roomNumber: "Free room", capacity: 50 } });
  await otherSchedule(f, { roomId: null });
  await otherSchedule(f, { roomId: null });
  await otherSchedule(f, { teacherId: null });
  await otherSchedule(f, { teacherId: busyTeacher, roomId: null });
  const current = () => runWithTenantContext({ schoolId, campusId: f.campusId, userId: f.user.userId, role: f.user.role }, () => validateStoredTimetable(manual.board.id, f.campusId));
  assert.equal((await current()).counts.critical, 3);
  // Regular save remains strict even when it would remove two of three clashes.
  await assert.rejects(() => saveManualTimetable(f.user, f.campusId, manual.board.id, [{ id: manual.slot.id, teacherId: goodTeacher }]), { status: 409 });
  // Three existing clashes becoming two is insufficient when one is a NEW resource reservation.
  await assert.rejects(() => applyManualTimetableSuggestion(f.user, f.campusId, manual.board.id, { type: "REASSIGN_TEACHER", slotId: manual.slot.id, teacherId: busyTeacher }), { status: 409 });
  assert.equal((await db.timetableSlot.findUniqueOrThrow({ where: { id: manual.slot.id } })).teacherId, f.teacherId);
  const first = await applyManualTimetableSuggestion(f.user, f.campusId, manual.board.id, { type: "REASSIGN_TEACHER", slotId: manual.slot.id, teacherId: goodTeacher });
  assert.equal(first.validation.counts.critical, 1);
  await assert.rejects(() => changeManualTimetableStatus(f.user, f.campusId, manual.board.id, "publish"), { status: 409 });
  const second = await applyManualTimetableSuggestion(f.user, f.campusId, manual.board.id, { type: "REASSIGN_ROOM", slotId: manual.slot.id, roomId: goodRoom.id });
  assert.equal(second.validation.counts.critical, 0);
  await assert.rejects(() => applyManualTimetableSuggestion(f.user, f.campusId, manual.board.id, { type: "REASSIGN_ROOM", slotId: manual.slot.id, roomId: goodRoom.id }), { status: 409 });
  assert.equal((await changeManualTimetableStatus(f.user, f.campusId, manual.board.id, "publish")).data.status, "PUBLISHED");
});

test("warning-only suggestions still complete missing assignments without introducing critical bookings", async () => {
  const f = await fixture(), manual = await manualBoard(f, "Incomplete board");
  await saveManualTimetable(f.user, f.campusId, manual.board.id, [{ id: manual.slot.id, subjectId: manual.subject.id, roomId: f.roomId }]);
  const fixed = await applyManualTimetableSuggestion(f.user, f.campusId, manual.board.id, { type: "REASSIGN_TEACHER", slotId: manual.slot.id, teacherId: f.teacherId });
  assert.equal(fixed.validation.counts.critical, 0);
  assert.equal(fixed.validation.counts.warning, 0);
});
