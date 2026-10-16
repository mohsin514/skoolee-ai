import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { createWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { executeSchoolAiTool, previewSchoolAiExecution, listSchoolAiExecutions } from "../../src/lib/school-ai/execution";
import { suggestSchoolTimetable, getSchoolOperationsOptions } from "../../src/lib/school-ai/school-operations-service";
import type { SchoolOperationsProposal, SchoolOperationsPreview, SchoolOperationsReceipt } from "../../src/lib/school-ai/school-operations";
import { saveManualTimetable, changeManualTimetableStatus, deleteManualTimetable } from "../../src/lib/timetable/manual";
import { schoolAiTransaction } from "../../src/lib/school-ai/transaction";
import { assertExamReservations } from "../../src/lib/academic/exam-bookings";
import { writeObservedAttendance } from "../../src/lib/school-ai/school-operations-register-write";
import { riskModules } from "../../src/lib/school-ai/school-operations-risk";
import { inspectRiskEvidence } from "../../src/lib/school-ai/school-operations-risk-service";
import { calendarDateIn } from "../../src/lib/datetime";
import { getLocalePackage } from "../../src/lib/locale/store";
import { writeAcademicCycle } from "../../src/lib/school-ai/school-operations-cycle-write";

// Result-risk evidence is dated in the campus timezone, not UTC.
const schoolToday = async (f: { user: AuthUser; schoolId: string; campusId: string }) => calendarDateIn((await schoolAiTransaction(f.user, tx => getLocalePackage(f.schoolId, f.campusId, new Date(), undefined, tx))).timezone);
const local = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== local || process.env.DIRECT_URL !== local) throw new Error("Use only the isolated School AI PostgreSQL fixture.");
const db = new PrismaClient(); after(async () => { await db.$disconnect(); await prisma.$disconnect(); });
async function fixture() {
  const schoolId = `school-ops-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), teacherId = randomUUID(), coverId = randomUUID(), actorId = randomUUID(), roomId = randomUUID(), subjectId = randomUUID();
  await db.school.create({ data: { id: schoolId, name: "Operations synthetic school", slug: schoolId, regId: schoolId, city: "Test", contactEmail: `${schoolId}@example.invalid`, status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Synthetic operations campus", regId: campusId, city: "Test" } });
  await db.user.createMany({ data: [[actorId, "CAMPUS_ADMIN", "Manager"], [teacherId, "TEACHER", "Original teacher"], [coverId, "TEACHER", "Available substitute"]].map(([id, role, fullName]) => ({ id, role: role as "CAMPUS_ADMIN" | "TEACHER", fullName, schoolId, campusId, email: `${id}@example.invalid`, isActive: true })) });
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Grade 7", section: "A", academicYear: 2026, teachingMode: "SUBJECT" } });
  await db.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Mathematics", teacherId } });
  await db.classRoom.create({ data: { id: roomId, schoolId, campusId, roomNumber: "Room 1", capacity: 40 } });
  await db.periodDefinition.createMany({ data: [{ periodNumber: 1, startTime: "08:00", endTime: "08:40" }, { periodNumber: 2, startTime: "08:40", endTime: "09:20" }].map(item => ({ ...item, schoolId, campusId, timeType: "CLASS" })) });
  const user: AuthUser = { userId: actorId, schoolId, campusId, role: "CAMPUS_ADMIN", email: `${actorId}@example.invalid`, accessVersion: 0 };
  return { schoolId, campusId, classId, teacherId, coverId, actorId, roomId, subjectId, user };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function school(work: (f: Fixture) => Promise<void>) { const f = await fixture(); try { await work(f); } finally { await db.schoolAiSubstituteDuty.deleteMany({ where: { schoolId: f.schoolId } }); await db.schoolAiExecution.deleteMany({ where: { schoolId: f.schoolId } }); await db.attendance.deleteMany({ where: { schoolId: f.schoolId } }); await db.studentEnrollment.deleteMany({ where: { schoolId: f.schoolId } }); await db.school.delete({ where: { id: f.schoolId } }); } }
async function approved(f: Fixture, proposal: SchoolOperationsProposal) { const draft = await createWorkspaceRecord(f.user, { kind: "WORKFLOW", title: "Reviewed school operation", campusId: f.campusId, idempotencyKey: randomUUID(), data: { goal: "Review and apply an explicit operation", steps: [{ id: "operation", title: "Check current records", status: "ready", module: proposal.operation === "operations.record_risk_decision" ? riskModules(proposal.indicator)[0] : proposal.operation === "attendance.record_register" ? "attendance" : proposal.operation === "academics.transition_year" ? "exams" : proposal.operation === "students.promote_enrollment" ? "students" : "timetable" }], sourceIds: [], missingInformation: [], proposal } }); return updateWorkspaceRecord(f.user, draft.id, { version: draft.version, action: "approve" }); }
async function preview(f: Fixture, record: Awaited<ReturnType<typeof approved>>, proposal: SchoolOperationsProposal) { return await previewSchoolAiExecution(f.user, record.id, proposal.operation, record.version) as SchoolOperationsPreview; }
async function apply(f: Fixture, record: Awaited<ReturnType<typeof approved>>, p: SchoolOperationsPreview, key = randomUUID()) { return await executeSchoolAiTool(f.user, record.id, { operation: p.operation, version: record.version, previewHash: p.previewHash, idempotencyKey: key }) as SchoolOperationsReceipt; }
async function pupil(f: Fixture) { return db.student.create({ data: { schoolId: f.schoolId, campusId: f.campusId, classId: f.classId, fullName: "Observed pupil", rollNo: "1", gender: "OTHER", enrollmentDate: new Date("2026-01-01Z") } }); }
const attendance = (f: Fixture, studentId: string): SchoolOperationsProposal => ({ operation: "attendance.record_register", classId: f.classId, date: "2026-10-05", observationConfirmed: true, entries: [{ studentId, status: "PRESENT", note: "Checked classroom register" }] });
async function lesson(f: Fixture) { return db.timetable.create({ data: { schoolId: f.schoolId, campusId: f.campusId, classId: f.classId, academicYear: 2026, status: "PUBLISHED", slots: { create: { schoolId: f.schoolId, subjectId: f.subjectId, teacherId: f.teacherId, roomId: f.roomId, slotType: "CLASS", dayOfWeek: 1, periodNumber: 1, startTime: "08:00", endTime: "08:40" } } }, include: { slots: true } }); }
function futureMonday() { const date = new Date(); date.setUTCDate(date.getUTCDate() + 14 + (8 - date.getUTCDay()) % 7); return date.toISOString().slice(0, 10); }
const substitute = (f: Fixture, slotId: string): SchoolOperationsProposal => ({ operation: "timetable.assign_substitutes", date: futureMonday(), duties: [{ slotId, teacherId: f.coverId, reason: "Original teacher at training" }] });
test("joint solver creates all reviewed draft schedules atomically and exact retries have one receipt", () => school(async f => {
  const cls = await db.class.create({ data: { schoolId: f.schoolId, campusId: f.campusId, name: "Grade 8", academicYear: 2026, teachingMode: "SUBJECT" } }); const subject = await db.subject.create({ data: { schoolId: f.schoolId, campusId: f.campusId, classId: cls.id, name: "Mathematics", teacherId: f.teacherId } });
  const result = await suggestSchoolTimetable(f.user, { campusId: f.campusId, classes: [[f.classId, f.subjectId], [cls.id, subject.id]].map(([classId, subjectId]) => ({ classId, term: "ANNUAL", days: [1], roomIds: [f.roomId], requirements: [{ subjectId, periodsPerWeek: 1, maxPerDay: 1 }] })) });
  assert.equal(result.status, "SOLVED"); assert(result.proposal); const record = await approved(f, result.proposal), p = await preview(f, record, result.proposal), key = randomUUID();
  const receipts = await Promise.all([apply(f, record, p, key), apply(f, record, p, key)]); assert.equal(receipts[0].id, receipts[1].id); assert.equal(receipts[0].count, 2);
  const boards = await db.timetable.findMany({ where: { schoolId: f.schoolId }, include: { slots: true } }); assert(boards.every(board => board.status === "DRAFT")); assert.notEqual(boards[0].slots[0].periodNumber, boards[1].slots[0].periodNumber); assert.equal((await listSchoolAiExecutions(f.user, record.id)).length, 1);
}));
test("a changed room or competing class schedule rejects the whole reviewed school batch", () => school(async f => {
  const result = await suggestSchoolTimetable(f.user, { campusId: f.campusId, classes: [{ classId: f.classId, term: "ANNUAL", days: [1], roomIds: [f.roomId], requirements: [{ subjectId: f.subjectId, periodsPerWeek: 1, maxPerDay: 1 }] }] }); assert(result.proposal); const record = await approved(f, result.proposal), p = await preview(f, record, result.proposal);
  await db.classRoom.update({ where: { id: f.roomId }, data: { capacity: 39 } }); await assert.rejects(() => apply(f, record, p), { code: "STALE_EXECUTION_PREVIEW" }); assert.equal(await db.timetable.count({ where: { schoolId: f.schoolId } }), 0);
}));
test("observed attendance uses verified enrollment and preserves immutable edit evidence", () => school(async f => {
  const student = await pupil(f), proposal = attendance(f, student.id), record = await approved(f, proposal), p = await preview(f, record, proposal); const receipt = await apply(f, record, p); assert.equal(receipt.count, 1);
  const saved = await db.attendance.findFirstOrThrow({ where: { schoolId: f.schoolId } }); assert(saved.enrollmentId); assert.equal(saved.status, "PRESENT"); assert.equal(saved.notes, "Checked classroom register");
  assert.equal((await apply(f, record, p)).id, receipt.id);
  if (proposal.operation !== "attendance.record_register") throw new Error("fixture"); proposal.entries[0].status = "ABSENT"; const edited = await approved(f, proposal); await apply(f, edited, await preview(f, edited, proposal));
  assert.equal(await db.attendanceEditHistory.count({ where: { schoolId: f.schoolId, oldStatus: "PRESENT", newStatus: "ABSENT" } }), 1); assert.equal(await db.parentCommunication.count({ where: { schoolId: f.schoolId } }), 0);
}));
test("attendance refuses future observations, locked registers, foreign pupils and enrollment gaps", () => school(async f => {
  const student = await pupil(f), proposal = attendance(f, student.id); if (proposal.operation !== "attendance.record_register") throw new Error("fixture");
  const future = { ...proposal, date: futureMonday() }, futureRecord = await approved(f, future); await assert.rejects(() => preview(f, futureRecord, future), { code: "SCHOOL_OPERATIONS_DATE" });
  const record = await approved(f, proposal); await apply(f, record, await preview(f, record, proposal)); await db.attendance.updateMany({ where: { schoolId: f.schoolId }, data: { isLocked: true } }); const second = await approved(f, proposal); await assert.rejects(() => preview(f, second, proposal), { code: "SCHOOL_OPERATIONS_REGISTER_LOCKED" });
  const unknown = { ...proposal, entries: [{ ...proposal.entries[0], studentId: randomUUID() }] }, unknownRecord = await approved(f, unknown); await assert.rejects(() => preview(f, unknownRecord, unknown), { code: "SCHOOL_OPERATIONS_ENROLLMENT" });
}));
test("stale register preview cannot overwrite a concurrent observed correction", () => school(async f => {
  const student = await pupil(f), proposal = attendance(f, student.id), record = await approved(f, proposal), p = await preview(f, record, proposal);
  await db.attendance.create({ data: { schoolId: f.schoolId, campusId: f.campusId, classId: f.classId, studentId: student.id, date: new Date("2026-10-05Z"), status: "LEAVE", enrollmentId: (await db.studentEnrollment.findFirstOrThrow({ where: { studentId: student.id } })).id } });
  await assert.rejects(() => apply(f, record, p), { code: "STALE_EXECUTION_PREVIEW" }); assert.equal((await db.attendance.findFirstOrThrow({ where: { schoolId: f.schoolId } })).status, "LEAVE");
}));
test("fresh module revocation blocks previews, execution and old receipt reads", () => school(async f => {
  const student = await pupil(f), proposal = attendance(f, student.id), record = await approved(f, proposal), p = await preview(f, record, proposal); await apply(f, record, p);
  await db.rolePermission.create({ data: { schoolId: f.schoolId, role: "CAMPUS_ADMIN", module: "attendance", canView: false, canAdd: false, canEdit: false } });
  await assert.rejects(() => apply(f, record, p), { status: 403 }); await assert.rejects(() => listSchoolAiExecutions(f.user, record.id), { status: 403 }); await assert.rejects(() => getSchoolOperationsOptions(f.user, f.campusId, proposal.operation, f.classId, "2026-10-05"), { status: 403 });
}));
test("dated substitute assignment and cancellation preserve weekly teacher and replay one version", () => school(async f => {
  const board = await lesson(f), proposal = substitute(f, board.slots[0].id), record = await approved(f, proposal), p = await preview(f, record, proposal); const [first, retry] = await Promise.all([apply(f, record, p), apply(f, record, p)]); assert.equal(first.id, retry.id); assert.equal((await db.timetableSlot.findUniqueOrThrow({ where: { id: board.slots[0].id } })).teacherId, f.teacherId);
  const duty = await db.schoolAiSubstituteDuty.findFirstOrThrow({ where: { schoolId: f.schoolId } }); assert.equal(duty.teacherId, f.coverId); assert.equal(duty.version, 1);
  if (proposal.operation !== "timetable.assign_substitutes") throw new Error("fixture"); proposal.duties[0].teacherId = null; const cancel = await approved(f, proposal); await apply(f, cancel, await preview(f, cancel, proposal)); assert.equal((await db.schoolAiSubstituteDuty.findUniqueOrThrow({ where: { id: duty.id } })).status, "CANCELLED"); assert.equal((await db.schoolAiSubstituteDuty.findUniqueOrThrow({ where: { id: duty.id } })).version, 2);
}));
test("substitutes cannot double-book teachers or consume an approved leave day", () => school(async f => {
  const board = await lesson(f), proposal = substitute(f, board.slots[0].id), leaveType = await db.leaveType.create({ data: { schoolId: f.schoolId, campusId: f.campusId, name: "Training" } }); if (proposal.operation !== "timetable.assign_substitutes") throw new Error("fixture");
  await db.leaveRequest.create({ data: { schoolId: f.schoolId, campusId: f.campusId, userId: f.coverId, leaveTypeId: leaveType.id, fromDate: new Date(proposal.date), toDate: new Date(proposal.date), status: "APPROVED" } }); const record = await approved(f, proposal); await assert.rejects(() => preview(f, record, proposal), { code: "SCHOOL_OPERATIONS_LEAVE" });
  const options = await getSchoolOperationsOptions(f.user, f.campusId, proposal.operation, null, proposal.date); assert(!options.lessons[0].availableTeacherIds.includes(f.coverId));
}));
test("ordinary lesson edits, unpublishing, deletion and exam bookings honor dated cover", () => school(async f => {
  const board = await lesson(f), proposal = substitute(f, board.slots[0].id), record = await approved(f, proposal); await apply(f, record, await preview(f, record, proposal));
  await assert.rejects(() => saveManualTimetable(f.user, f.campusId, board.id, [{ id: board.slots[0].id, teacherId: f.coverId }]), { code: "SCHOOL_OPERATIONS_COVER_EXISTS" }); await assert.rejects(() => changeManualTimetableStatus(f.user, f.campusId, board.id, "unpublish"), { code: "SCHOOL_OPERATIONS_COVER_EXISTS" }); await assert.rejects(() => deleteManualTimetable(f.user, f.campusId, board.id), { status: 409 });
  const period = await db.periodDefinition.create({ data: { schoolId: f.schoolId, campusId: f.campusId, timeType: "EXAM", periodNumber: 9, startTime: "08:20", endTime: "09:00" } });
  if (proposal.operation !== "timetable.assign_substitutes") throw new Error("fixture");
  await assert.rejects(() => schoolAiTransaction(f.user, tx => assertExamReservations(tx, { schoolId: f.schoolId, campusId: f.campusId }, [{ id: "new", classId: f.classId, academicYear: 2026, term: "ANNUAL", date: proposal.date, periodDefinitionId: period.id, roomIds: [f.roomId], teacherIds: [f.coverId] } ])), { code: "SCHOOL_OPERATIONS_TEACHER_CLASH" });
}));
test("owner must choose an owned campus and stale actor sessions cannot operate", () => school(async f => {
  const student = await pupil(f), proposal = attendance(f, student.id), record = await approved(f, proposal), p = await preview(f, record, proposal); await db.user.update({ where: { id: f.actorId }, data: { accessVersion: 1 } }); await assert.rejects(() => apply(f, record, p), { status: 403 });
  await assert.rejects(() => getSchoolOperationsOptions({ ...f.user, accessVersion: 1 }, randomUUID(), proposal.operation), { status: 403 });
}));
test("reviewed academic transitions preserve approved dates and refuse an unfinished year closure", () => school(async f => {
  const cycle = await db.academicCycle.create({ data: { schoolId: f.schoolId, campusId: f.campusId, academicYear: 2026, label: "Reviewed year", status: "DRAFT", startDate: new Date("2026-01-01Z"), endDate: new Date("2026-12-31Z") } });
  for (const action of ["activate", "pause", "resume"] as const) { const proposal: SchoolOperationsProposal = { operation: "academics.transition_year", cycleId: cycle.id, action, reason: "Reviewed school calendar decision" }; const record = await approved(f, proposal); const p = await preview(f, record, proposal); const receipt = await apply(f, record, p); assert.equal(receipt.count, 1); const current = await db.academicCycle.findUniqueOrThrow({ where: { id: cycle.id } }); assert.equal(current.startDate?.toISOString(), cycle.startDate?.toISOString()); assert.equal(current.endDate?.toISOString(), cycle.endDate?.toISOString()); assert.equal(current.status, action === "pause" ? "PAUSED" : "ACTIVE"); }
  const close: SchoolOperationsProposal = { operation: "academics.transition_year", cycleId: cycle.id, action: "close", reason: "Finish the academic year" }, record = await approved(f, close); await assert.rejects(() => preview(f, record, close), { code: "SCHOOL_OPERATIONS_CLOSURE" });
}));
test("competing reviewed and ordinary year activations cannot make two active cycles", () => school(async f => {
  const cycles = await Promise.all([2026, 2027].map(academicYear => db.academicCycle.create({ data: { schoolId: f.schoolId, campusId: f.campusId, academicYear, label: String(academicYear), status: "DRAFT", startDate: new Date("2026-01-01Z"), endDate: new Date("2027-12-31Z") } })));
  const proposal: SchoolOperationsProposal = { operation: "academics.transition_year", cycleId: cycles[0].id, action: "activate", reason: "Start reviewed year" }, record = await approved(f, proposal), p = await preview(f, record, proposal);
  const results = await Promise.allSettled([apply(f, record, p), writeAcademicCycle(f.user, f.campusId, { action: "activate", cycleId: cycles[1].id })]); assert.equal(results.filter(result => result.status === "fulfilled").length, 1); assert.equal(await db.academicCycle.count({ where: { schoolId: f.schoolId, status: "ACTIVE" } }), 1);
}));
test("promotion creates a new enrollment while historical attendance and original identity remain unchanged", () => school(async f => {
  const student = await pupil(f), original = await db.studentEnrollment.findFirstOrThrow({ where: { studentId: student.id } }), target = await db.class.create({ data: { schoolId: f.schoolId, campusId: f.campusId, name: "Grade 8", academicYear: 2027 } });
  await db.academicCycle.createMany({ data: [{ academicYear: 2026, label: "Closed", status: "ENDED", startDate: new Date("2026-01-01Z"), endDate: new Date("2026-10-10Z") }, { academicYear: 2027, label: "Next year", status: "DRAFT", startDate: new Date("2026-10-11Z"), endDate: new Date("2027-12-31Z") }].map(cycle => ({ ...cycle, schoolId: f.schoolId, campusId: f.campusId })) });
  const attendance = await db.attendance.create({ data: { schoolId: f.schoolId, campusId: f.campusId, classId: f.classId, studentId: student.id, date: new Date("2026-10-05Z"), status: "PRESENT", enrollmentId: original.id } });
  const proposal: SchoolOperationsProposal = { operation: "students.promote_enrollment", fromClassId: f.classId, targetClassId: target.id, effectiveDate: "2026-10-12", reason: "Published results reviewed by principal", capacityConfirmed: true, entries: [{ studentId: student.id, fromEnrollmentId: original.id, rollNo: "NEXT-001" }] };
  const record = await approved(f, proposal), p = await preview(f, record, proposal), receipt = await apply(f, record, p); assert.equal(receipt.count, 1); assert.equal((await apply(f, record, p)).id, receipt.id); assert.deepEqual(await db.attendance.findUniqueOrThrow({ where: { id: attendance.id } }), attendance); assert.equal((await db.student.findUniqueOrThrow({ where: { id: student.id } })).classId, target.id); assert.equal((await db.studentEnrollment.findUniqueOrThrow({ where: { id: original.id } })).endDate?.toISOString().slice(0, 10), "2026-10-12"); assert.equal(await db.studentClassHistory.count({ where: { schoolId: f.schoolId, status: "PROMOTED" } }), 1);
}));
test("promotion rejects existing post-boundary history and unavailable target years without moving the pupil", () => school(async f => {
  const student = await pupil(f), original = await db.studentEnrollment.findFirstOrThrow({ where: { studentId: student.id } }), target = await db.class.create({ data: { schoolId: f.schoolId, campusId: f.campusId, name: "Next class", academicYear: 2027 } });
  await db.academicCycle.createMany({ data: [{ academicYear: 2026, label: "Closed", status: "ENDED" }, { academicYear: 2027, label: "Target", status: "DRAFT" }].map(cycle => ({ ...cycle, schoolId: f.schoolId, campusId: f.campusId })) });
  await db.attendance.create({ data: { schoolId: f.schoolId, campusId: f.campusId, classId: f.classId, studentId: student.id, enrollmentId: original.id, date: new Date("2026-10-12Z"), status: "ABSENT" } });
  const proposal: SchoolOperationsProposal = { operation: "students.promote_enrollment", fromClassId: f.classId, targetClassId: target.id, effectiveDate: "2026-10-12", reason: "Reviewed promotion", capacityConfirmed: true, entries: [{ studentId: student.id, fromEnrollmentId: original.id, rollNo: "NEXT-1" }] }, record = await approved(f, proposal); await assert.rejects(() => preview(f, record, proposal), { status: 409 }); assert.equal((await db.student.findUniqueOrThrow({ where: { id: student.id } })).classId, f.classId);
}));
test("ordinary quick-mark and copy paths preserve evidence notes and cannot overwrite locked reviewed attendance", () => school(async f => {
  const student = await pupil(f), proposal = attendance(f, student.id), record = await approved(f, proposal); await apply(f, record, await preview(f, record, proposal));
  await writeObservedAttendance(f.user, { campusId: f.campusId, classId: f.classId, date: "2026-10-05", entries: [{ studentId: student.id, status: "LEAVE" }] }); const row = await db.attendance.findFirstOrThrow({ where: { schoolId: f.schoolId } }); assert.equal(row.notes, "Checked classroom register"); assert.equal(row.status, "LEAVE");
  await db.attendance.update({ where: { id: row.id }, data: { isLocked: true } }); await assert.rejects(() => writeObservedAttendance(f.user, { campusId: f.campusId, classId: f.classId, date: "2026-10-05", copyFrom: "2026-10-05" }), { code: "SCHOOL_OPERATIONS_REGISTER_LOCKED" });
}));

test("factual attendance risk decisions pin evidence, record accountable history and replay once", () => school(async f => {
  const student = await pupil(f), scope = { campusId: f.campusId, indicator: "ATTENDANCE_GAPS" as const, scopeId: f.classId, date: "2026-10-05" };
  const evidence = await inspectRiskEvidence(f.user, scope); assert.equal(evidence.count, 1); assert.equal(evidence.items[0].label, student.fullName);
  const proposal: SchoolOperationsProposal = { operation: "operations.record_risk_decision", indicator: scope.indicator, scopeId: scope.scopeId, date: scope.date, evidenceHash: evidence.evidenceHash, ownerId: f.actorId, dueDate: "2099-10-05", decision: "ACTION", note: "Ask the class teacher to complete the observed register." };
  const record = await approved(f, proposal), p = await preview(f, record, proposal), key = randomUUID(); const receipts = await Promise.all([apply(f, record, p, key), apply(f, record, p, key)]); assert.equal(receipts[0].id, receipts[1].id);
  assert.equal(await db.auditLog.count({ where: { schoolId: f.schoolId, tableName: "school_ai_risk_decisions" } }), 1); assert.equal(await db.attendance.count({ where: { schoolId: f.schoolId } }), 0);
  const observed = attendance(f, student.id), observedRecord = await approved(f, observed); await apply(f, observedRecord, await preview(f, observedRecord, observed));
  const stale = await approved(f, { ...proposal, decision: "MONITOR" }); await assert.rejects(() => preview(f, stale, proposal), { code: "SCHOOL_OPERATIONS_RISK_STALE" });
  const current = await inspectRiskEvidence(f.user, scope), resolved: SchoolOperationsProposal = { ...proposal, decision: "RESOLVE", evidenceHash: current.evidenceHash, note: "Verified the actual register now contains the observed attendance." }, resolvedRecord = await approved(f, resolved), resolution = await preview(f, resolvedRecord, resolved);
  assert.equal(resolution.operation, "operations.record_risk_decision"); if (resolution.operation !== "operations.record_risk_decision") throw new Error("fixture"); assert.equal(resolution.evidence.count, 0); assert.equal(resolution.previousDecisions.length, 1); assert.equal(resolution.previousDecisions[0].ownerName, "Manager"); await apply(f, resolvedRecord, resolution);
  assert.equal(await db.auditLog.count({ where: { schoolId: f.schoolId, tableName: "school_ai_risk_decisions" } }), 2);
}));
test("risk review rejects unresolved findings, foreign scope, unauthorized owners and revoked history access", () => school(async f => {
  await pupil(f); const scope = { campusId: f.campusId, indicator: "ATTENDANCE_GAPS" as const, scopeId: f.classId, date: "2026-10-05" }, evidence = await inspectRiskEvidence(f.user, scope);
  const proposal: SchoolOperationsProposal = { operation: "operations.record_risk_decision", ...scope, evidenceHash: evidence.evidenceHash, ownerId: f.actorId, dueDate: "2099-10-05", decision: "RESOLVE", note: "I reviewed the records with the classroom teacher." };
  delete (proposal as unknown as { campusId?: string }).campusId;
  const unresolved = await approved(f, proposal); await assert.rejects(() => preview(f, unresolved, proposal), { code: "SCHOOL_OPERATIONS_RISK_UNRESOLVED" });
  const wrongOwner = { ...proposal, decision: "ACTION" as const, ownerId: f.teacherId }, ownerRecord = await approved(f, wrongOwner); await assert.rejects(() => preview(f, ownerRecord, wrongOwner), { code: "SCHOOL_OPERATIONS_RISK_OWNER" });
  await assert.rejects(() => inspectRiskEvidence(f.user, { ...scope, scopeId: randomUUID() }), { code: "SCHOOL_OPERATIONS_SCOPE" });
  const action = { ...proposal, decision: "ACTION" as const }, record = await approved(f, action), p = await preview(f, record, action); await apply(f, record, p);
  await db.rolePermission.create({ data: { schoolId: f.schoolId, role: "CAMPUS_ADMIN", module: "students", canView: false, canAdd: false, canEdit: false } });
  await assert.rejects(() => inspectRiskEvidence(f.user, scope), { status: 403 }); await assert.rejects(() => listSchoolAiExecutions(f.user, record.id), { status: 403 });
}));
test("lesson risk detects approved leave and clears only when dated available cover exists", () => school(async f => {
  const board = await lesson(f), date = futureMonday(), leaveType = await db.leaveType.create({ data: { schoolId: f.schoolId, campusId: f.campusId, name: "Training" } }); await db.leaveRequest.create({ data: { schoolId: f.schoolId, campusId: f.campusId, userId: f.teacherId, leaveTypeId: leaveType.id, fromDate: new Date(date), toDate: new Date(date), reason: "Training", status: "APPROVED" } });
  const scope = { campusId: f.campusId, indicator: "UNCOVERED_LESSONS" as const, scopeId: f.classId, date }, before = await inspectRiskEvidence(f.user, scope); assert.equal(before.count, 1); assert.equal(before.items[0].id, board.slots[0].id);
  const proposal = substitute(f, board.slots[0].id), record = await approved(f, proposal); await apply(f, record, await preview(f, record, proposal)); const after = await inspectRiskEvidence(f.user, scope); assert.equal(after.count, 0); assert.notEqual(before.evidenceHash, after.evidenceHash);
}));
test("current result risk reports factual unreleased exams and cannot resolve an empty year", () => school(async f => {
  const cycle = await db.academicCycle.create({ data: { schoolId: f.schoolId, campusId: f.campusId, academicYear: 2026, label: "2026 results", status: "ACTIVE" } }), date = await schoolToday(f), scope = { campusId: f.campusId, indicator: "UNRELEASED_RESULTS" as const, scopeId: cycle.id, date };
  const empty = await inspectRiskEvidence(f.user, scope); assert.equal(empty.total, 0);
  const proposal: SchoolOperationsProposal = { operation: "operations.record_risk_decision", indicator: scope.indicator, scopeId: scope.scopeId, date, evidenceHash: empty.evidenceHash, ownerId: f.actorId, dueDate: date, decision: "RESOLVE", note: "Checked whether the configured year contains released results." }, record = await approved(f, proposal); await assert.rejects(() => preview(f, record, proposal), { code: "SCHOOL_OPERATIONS_RISK_UNRESOLVED" });
  await db.exam.create({ data: { schoolId: f.schoolId, campusId: f.campusId, academicYear: 2026, title: "Final term results", status: "MARKS_ENTRY", examType: "FINAL", term: "TERM_1", classId: f.classId } });
  const evidence = await inspectRiskEvidence(f.user, scope); assert.equal(evidence.count, 1); assert.equal(evidence.items[0].detail, "MARKS_ENTRY");
}));
test("editing a risk record to another indicator cannot expose the original receipt after old-domain revocation", () => school(async f => {
  await pupil(f); const evidence = await inspectRiskEvidence(f.user, { campusId: f.campusId, indicator: "ATTENDANCE_GAPS", scopeId: f.classId, date: "2026-10-05" }), proposal: SchoolOperationsProposal = { operation: "operations.record_risk_decision", indicator: "ATTENDANCE_GAPS", scopeId: f.classId, date: "2026-10-05", evidenceHash: evidence.evidenceHash, ownerId: f.actorId, dueDate: "2099-10-05", decision: "ACTION", note: "Review missing classroom register observations." }, record = await approved(f, proposal), p = await preview(f, record, proposal); await apply(f, record, p);
  const cycle = await db.academicCycle.create({ data: { schoolId: f.schoolId, campusId: f.campusId, academicYear: 2026, label: "Risk test year", status: "ACTIVE" } }), date = await schoolToday(f), results = await inspectRiskEvidence(f.user, { campusId: f.campusId, indicator: "UNRELEASED_RESULTS", scopeId: cycle.id, date });
  await updateWorkspaceRecord(f.user, record.id, { version: record.version, action: "save", data: { ...record.data, proposal: { ...proposal, indicator: "UNRELEASED_RESULTS", scopeId: cycle.id, date, evidenceHash: results.evidenceHash } } });
  await db.rolePermission.create({ data: { schoolId: f.schoolId, role: "CAMPUS_ADMIN", module: "students", canView: false, canAdd: false, canEdit: false } });
  await assert.rejects(() => apply(f, record, p), { status: 403 }); assert.deepEqual(await listSchoolAiExecutions(f.user, record.id), []);
}));
test("reviewed timetable publication is atomic, visible, audited and idempotent", () => school(async f => {
  const board = await lesson(f); await db.timetable.update({ where: { id: board.id }, data: { status: "DRAFT", publishedAt: null } });
  const cls = await db.class.create({ data: { schoolId: f.schoolId, campusId: f.campusId, name: "Second publication class", academicYear: 2026 } }), subject = await db.subject.create({ data: { schoolId: f.schoolId, campusId: f.campusId, classId: cls.id, name: "Science", teacherId: f.teacherId } }), second = await db.timetable.create({ data: { schoolId: f.schoolId, campusId: f.campusId, classId: cls.id, academicYear: 2026, status: "DRAFT", slots: { create: { schoolId: f.schoolId, subjectId: subject.id, teacherId: f.teacherId, roomId: f.roomId, slotType: "CLASS", dayOfWeek: 1, periodNumber: 2, startTime: "08:40", endTime: "09:20" } } } });
  const proposal: SchoolOperationsProposal = { operation: "timetable.publish_reviewed", timetableIds: [board.id, second.id], reason: "The school reviewed all weekly assignments and room capacity." }, record = await approved(f, proposal), p = await preview(f, record, proposal), key = randomUUID();
  if (p.operation !== "timetable.publish_reviewed") throw new Error("fixture"); assert.equal(p.timetables[0].slots[0].teacherName, "Original teacher"); const receipts = await Promise.all([apply(f, record, p, key), apply(f, record, p, key)]); assert.equal(receipts[0].id, receipts[1].id); assert.equal(receipts[0].count, 2); assert.equal((await db.timetable.findUniqueOrThrow({ where: { id: second.id } })).status, "PUBLISHED");
  assert.equal((await db.timetable.findUniqueOrThrow({ where: { id: board.id } })).status, "PUBLISHED"); assert.equal(await db.auditLog.count({ where: { schoolId: f.schoolId, tableName: "timetables", recordId: board.id } }), 1);
}));
test("publication rejects incomplete capacity and changed reviewed schedules before any publication", () => school(async f => {
  const board = await lesson(f); await db.timetable.update({ where: { id: board.id }, data: { status: "DRAFT", publishedAt: null } });
  const proposal: SchoolOperationsProposal = { operation: "timetable.publish_reviewed", timetableIds: [board.id], reason: "Reviewed the full class timetable before publication." }, record = await approved(f, proposal), p = await preview(f, record, proposal);
  await db.timetableSlot.update({ where: { id: board.slots[0].id }, data: { teacherId: f.coverId } }); await assert.rejects(() => apply(f, record, p), { code: "STALE_EXECUTION_PREVIEW" }); assert.equal((await db.timetable.findUniqueOrThrow({ where: { id: board.id } })).status, "DRAFT");
  await db.classRoom.update({ where: { id: f.roomId }, data: { capacity: 0 } }); await assert.rejects(() => preview(f, record, proposal), { status: 409 });
  await db.classRoom.update({ where: { id: f.roomId }, data: { capacity: 40 } }); await db.timetableSlot.update({ where: { id: board.slots[0].id }, data: { subjectId: null } }); await assert.rejects(() => preview(f, record, proposal), { status: 409 });
}));
test("risk decision permissions follow its indicator without requiring unrelated timetable access", () => school(async f => {
  await pupil(f); await db.rolePermission.create({ data: { schoolId: f.schoolId, role: "CAMPUS_ADMIN", module: "timetable", canView: false, canAdd: false, canEdit: false } });
  const evidence = await inspectRiskEvidence(f.user, { campusId: f.campusId, indicator: "ATTENDANCE_GAPS", scopeId: f.classId, date: "2026-10-05" }), proposal: SchoolOperationsProposal = { operation: "operations.record_risk_decision", indicator: "ATTENDANCE_GAPS", scopeId: f.classId, date: "2026-10-05", evidenceHash: evidence.evidenceHash, ownerId: f.actorId, dueDate: "2099-10-05", decision: "ACTION", note: "Please complete the observed classroom register." }, record = await approved(f, proposal); await apply(f, record, await preview(f, record, proposal)); assert.equal((await listSchoolAiExecutions(f.user, record.id)).length, 1);
}));
test("past snapshotted substitute history survives later weekly edits while history deletion stays blocked", () => school(async f => {
  const board = await lesson(f), proposal = substitute(f, board.slots[0].id), record = await approved(f, proposal); await apply(f, record, await preview(f, record, proposal)); const duty = await db.schoolAiSubstituteDuty.findFirstOrThrow({ where: { schoolId: f.schoolId } });
  await db.schoolAiSubstituteDuty.update({ where: { id: duty.id }, data: { date: new Date("2020-10-05Z") } }); await saveManualTimetable(f.user, f.campusId, board.id, [{ id: board.slots[0].id, teacherId: f.coverId }]); assert.deepEqual((await db.schoolAiSubstituteDuty.findUniqueOrThrow({ where: { id: duty.id } })).lessonSnapshot, duty.lessonSnapshot); await assert.rejects(() => deleteManualTimetable(f.user, f.campusId, board.id), { status: 409 });
}));
