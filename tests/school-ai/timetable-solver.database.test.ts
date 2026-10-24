import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { suggestTimetable } from "../../src/lib/school-ai/timetable-solver-service";
import { createWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { executeSchoolAiTool, previewSchoolAiExecution } from "../../src/lib/school-ai/execution";
const local = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== local || process.env.DIRECT_URL !== local) throw new Error("Use only the isolated school AI PostgreSQL fixture.");
const db = new PrismaClient(), schoolId = `solver-${randomUUID()}`;
before(async () => { await db.school.create({ data: { id: schoolId, name: "Synthetic solver school", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Test", status: "ACTIVE" } }); });
after(async () => { await db.schoolAiExecution.deleteMany({ where: { schoolId } }); await db.school.delete({ where: { id: schoolId } }); await db.$disconnect(); await prisma.$disconnect(); });
async function fixture() {
  const campusId = randomUUID(), classId = randomUUID(), subjectId = randomUUID(), roomId = randomUUID(), teacherId = randomUUID(), actorId = randomUUID();
  await db.campus.create({ data: { id: campusId, schoolId, name: "Planner", regId: campusId, city: "Test" } });
  await db.user.createMany({ data: [{ id: actorId, schoolId, campusId, email: `${actorId}@example.invalid`, fullName: "Planner", role: "CAMPUS_ADMIN" }, { id: teacherId, schoolId, campusId, email: `${teacherId}@example.invalid`, fullName: "Teacher", role: "TEACHER" }] });
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Grade 6", academicYear: 2026, teachingMode: "SUBJECT" } });
  await db.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Math", teacherId } });
  await db.classRoom.create({ data: { id: roomId, schoolId, campusId, roomNumber: "A1", capacity: 25 } });
  await db.periodDefinition.createMany({ data: [{ schoolId, campusId, timeType: "CLASS", periodNumber: 1, startTime: "08:00", endTime: "08:40" }, { schoolId, campusId, timeType: "CLASS", periodNumber: 2, startTime: "09:00", endTime: "09:40" }] });
  const user: AuthUser = { userId: actorId, schoolId, campusId, role: "CAMPUS_ADMIN", email: `${actorId}@example.invalid` };
  return { campusId, classId, subjectId, roomId, teacherId, user, input: { campusId, classId, term: "ANNUAL" as const, days: [1, 2], roomIds: [roomId], requirements: [{ subjectId, periodsPerWeek: 2, maxPerDay: 1 }] } };
}
test("suggestion is read-only; exact saved, approved suggestion executes once as a draft", async () => {
  const f = await fixture(), suggestion = await suggestTimetable(f.user, f.input);
  assert.equal(suggestion.status, "SOLVED"); assert(suggestion.proposal);
  assert.equal(await db.timetable.count({ where: { campusId: f.campusId } }), 0);
  assert.equal(await db.schoolAiRecord.count({ where: { campusId: f.campusId } }), 0);
  const saved = await createWorkspaceRecord(f.user, { kind: "WORKFLOW", title: "Suggested week", campusId: f.campusId, data: { goal: "Review a suggested week", steps: [{ id: "review", title: "Review", status: "ready", module: "timetable" }], sourceIds: [], missingInformation: [], proposal: suggestion.proposal }, idempotencyKey: randomUUID() });
  const approved = await updateWorkspaceRecord(f.user, saved.id, { version: saved.version, action: "approve" });
  const preview = await previewSchoolAiExecution(f.user, saved.id, "timetable.create_draft", approved.version);
  const request = { operation: "timetable.create_draft" as const, version: approved.version, previewHash: preview.previewHash, idempotencyKey: randomUUID() };
  const receipt = await executeSchoolAiTool(f.user, saved.id, request);
  assert.equal(receipt.slotCount, 2); assert.equal(receipt.timetableStatus, "DRAFT");
  assert.deepEqual(await executeSchoolAiTool(f.user, saved.id, request), receipt);
  await assert.rejects(() => suggestTimetable(f.user, f.input), { code: "TIMETABLE_EXISTS" });
});
test("solver excludes unknown room capacity and respects current teacher assignment and weekends", async () => {
  const f = await fixture();
  await db.classRoom.update({ where: { id: f.roomId }, data: { capacity: 0 } });
  await assert.rejects(() => suggestTimetable(f.user, f.input), { code: "SOLVER_CAPACITY" });
  await db.classRoom.update({ where: { id: f.roomId }, data: { capacity: 25 } });
  await db.subject.update({ where: { id: f.subjectId }, data: { teacherId: null } });
  await assert.rejects(() => suggestTimetable(f.user, f.input), { code: "TIMETABLE_ASSIGNMENT" });
  await db.subject.update({ where: { id: f.subjectId }, data: { teacherId: f.teacherId } });
  await db.weekend.create({ data: { schoolId, campusId: f.campusId, dayOfWeek: 1 } });
  await assert.rejects(() => suggestTimetable(f.user, f.input), { code: "TIMETABLE_WEEKEND" });
});
test("solver requires configured class periods and fresh scoped permissions", async () => {
  const f = await fixture(), foreign = await fixture();
  await assert.rejects(() => suggestTimetable(f.user, foreign.input), { status: 403 });
  const grant = await db.rolePermission.create({ data: { schoolId, role: "CAMPUS_ADMIN", module: "timetable", canView: true, canAdd: false, canEdit: true } });
  try { await assert.rejects(() => suggestTimetable(f.user, f.input), { status: 403 }); } finally { await db.rolePermission.delete({ where: { id: grant.id } }); }
  await db.periodDefinition.deleteMany({ where: { campusId: f.campusId } });
  await assert.rejects(() => suggestTimetable(f.user, f.input), { code: "SOLVER_PERIODS_REQUIRED" });
});
test("real occupied teaching windows produce a truthful unsatisfied response without partial writes", async () => {
  const f = await fixture();
  const other = await db.class.create({ data: { schoolId, campusId: f.campusId, name: "Other", academicYear: 2026 } });
  await db.timetable.create({ data: { schoolId, campusId: f.campusId, classId: other.id, academicYear: 2026, term: "ANNUAL", slots: { create: [1, 2].flatMap(dayOfWeek => [1, 2].map(periodNumber => ({ schoolId, dayOfWeek, periodNumber, startTime: periodNumber === 1 ? "08:00" : "09:00", endTime: periodNumber === 1 ? "08:40" : "09:40", slotType: "CLASS", teacherId: f.teacherId, roomId: f.roomId }))) } } });
  const result = await suggestTimetable(f.user, f.input);
  assert.equal(result.status, "NO_SOLUTION"); assert.equal(result.proposal, null);
  assert.equal(await db.timetable.count({ where: { classId: f.classId } }), 0);
});
