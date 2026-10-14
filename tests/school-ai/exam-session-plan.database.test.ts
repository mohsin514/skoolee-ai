import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { reviewQueue, approveVersions, reviewExam, publishExam } from "../../src/lib/academic/report-versions";
import { generateReportCardsForLockedExam } from "../../src/lib/academic/report-cards";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { createWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { executeSchoolAiTool, previewSchoolAiExecution } from "../../src/lib/school-ai/execution";
import { getExamSessionPlanOptions } from "../../src/lib/school-ai/exam-session-plan-service";
import type { ExamSessionPlanProposal } from "../../src/lib/school-ai/exam-session-plan";
import { listExamInvigilation, updateExamInvigilation } from "../../src/lib/academic/exam-invigilation";
import { resolveExamSchedulingCampus, withExamSchedulingWrite } from "../../src/lib/academic/exam-scheduling-write";
import { validateStoredExamSchedules } from "../../src/lib/academic/exam-bookings";
import { allocateExamRooms } from "../../src/lib/academic/exam-rooms";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";

const local = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== local || process.env.DIRECT_URL !== local) throw new Error("Use only the isolated School AI database.");
const db = new PrismaClient(), schoolId = `exam-plan-${randomUUID()}`;
before(async () => { await db.school.create({ data: { id: schoolId, name: "Synthetic exam operations", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Test", status: "ACTIVE" } }); });
after(async () => { await db.schoolAiExecution.deleteMany({ where: { schoolId } }); await db.school.delete({ where: { id: schoolId } }); await db.$disconnect(); await prisma.$disconnect(); });
async function fixture() {
  const campusId = randomUUID(), classId = randomUUID(), subjectId = randomUUID(), roomId = randomUUID(), teacherId = randomUUID(), actorId = randomUUID(), periodId = randomUUID();
  await db.campus.create({ data: { id: campusId, schoolId, name: "Exam campus", regId: campusId, city: "Test" } });
  await db.user.createMany({ data: [{ id: actorId, schoolId, campusId, email: `${actorId}@example.invalid`, fullName: "Planner", role: "CAMPUS_ADMIN" }, { id: teacherId, schoolId, campusId, email: `${teacherId}@example.invalid`, fullName: "Invigilator", role: "TEACHER" }] });
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Grade 8", academicYear: 2026 } });
  await db.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Mathematics", totalMarks: 100 } });
  await db.classRoom.create({ data: { id: roomId, schoolId, campusId, roomNumber: "A-1", capacity: 30, rows: 2, benchesPerRow: 2, seatsPerBench: 3, examSeatsPerBench: 1 } });
  await db.student.createMany({ data: Array.from({ length: 3 }, (_, n) => ({ schoolId, campusId, classId, fullName: `Candidate ${n + 1}`, rollNo: `${n + 1}`, admissionNo: randomUUID(), gender: "MALE", dateOfBirth: new Date("2013-01-01") })) });
  await db.periodDefinition.create({ data: { id: periodId, schoolId, campusId, timeType: "EXAM", periodNumber: 1, startTime: "09:00", endTime: "10:00" } });
  const user: AuthUser = { userId: actorId, schoolId, campusId, role: "CAMPUS_ADMIN", email: `${actorId}@example.invalid` };
  const proposal: ExamSessionPlanProposal = { operation: "exams.create_session_plan", title: "Term one", term: "TERM_1", academicYear: 2026, examType: "MID_TERM", papers: [{ id: "paper-one", classId, subjectId, date: "2026-10-14", periodDefinitionId: periodId, rooms: [{ roomId, invigilatorId: teacherId }] }] };
  return { campusId, classId, subjectId, roomId, teacherId, periodId, user, proposal };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function approved(f: Fixture, proposal = f.proposal) { const record = await createWorkspaceRecord(f.user, { kind: "WORKFLOW", title: "Exam plan", campusId: f.campusId, idempotencyKey: randomUUID(), data: { goal: "Review exam operations", steps: [{ id: "plan", title: "Review dates and seats", module: "exams", status: "ready" }], sourceIds: [], missingInformation: [], proposal } }); return updateWorkspaceRecord(f.user, record.id, { version: record.version, action: "approve" }); }
async function preview(f: Fixture, record: Awaited<ReturnType<typeof approved>>) { return previewSchoolAiExecution(f.user, record.id, "exams.create_session_plan", record.version); }
async function apply(f: Fixture, record: Awaited<ReturnType<typeof approved>>, hash: string, key = randomUUID()) { return executeSchoolAiTool(f.user, record.id, { operation: "exams.create_session_plan", version: record.version, previewHash: hash, idempotencyKey: key }); }
async function applied(f: Fixture) { const record = await approved(f); return apply(f, record, (await preview(f, record)).previewHash); }
async function teacher(f: Fixture) { const id = randomUUID(); await db.user.create({ data: { id, schoolId, campusId: f.campusId, fullName: "Alternate invigilator", email: `${id}@example.invalid`, role: "TEACHER" } }); return id; }
const context = <T>(f: Fixture, action: () => Promise<T>) => runWithTenantContext({ schoolId, campusId: f.user.campusId, userId: f.user.userId, role: f.user.role }, action);
test("reviewed seating adjustments allocate actual front-edge and separate-room seats with unchanged exact preview protection",async()=>{const f=await fixture(),students=await db.student.findMany({where:{schoolId,campusId:f.campusId},orderBy:{rollNo:"asc"}}),quiet=await db.classRoom.create({data:{schoolId,campusId:f.campusId,roomNumber:"Quiet",capacity:12,rows:2,benchesPerRow:2,seatsPerBench:3,examSeatsPerBench:1}}),invigilator=await teacher(f);await db.classRoom.update({where:{id:f.roomId},data:{rows:3,benchesPerRow:4}});const proposal={...f.proposal,papers:[{...f.proposal.papers[0],rooms:[...f.proposal.papers[0].rooms,{roomId:quiet.id,invigilatorId:invigilator}],seatingSupport:[{studentId:students[2].id,frontRow:true,edgeSeat:true,extraSpacing:true,separateRoomId:null,confirmed:true,approvalReference:"Approved support A"},{studentId:students[1].id,frontRow:false,edgeSeat:false,extraSpacing:false,separateRoomId:quiet.id,confirmed:true,approvalReference:"Approved support B"}]}]};const record=await approved(f,proposal),checked=await preview(f,record);assert.equal(checked.papers[0].seatingSupport.length,2);const main=checked.papers[0].rooms.find(row=>row.roomId===f.roomId)!,reserved=main.seats.find(row=>row.studentId===students[2].id)!;assert.equal(reserved.rowNo,1);assert.equal(reserved.benchNo,1);assert.equal(checked.papers[0].rooms.find(row=>row.roomId===quiet.id)?.seats.length,1);await apply(f,record,checked.previewHash);const actual=await db.examSeat.findFirstOrThrow({where:{campusId:f.campusId,studentId:students[2].id}});assert.equal(actual.rowNo,1);assert.equal(actual.benchNo,1);});
test("seating preview rejects unconfirmed and out-of-class support and stale recorded layout",async()=>{const f=await fixture(),student=await db.student.findFirstOrThrow({where:{campusId:f.campusId}}),support={studentId:student.id,frontRow:true,edgeSeat:false,extraSpacing:false,separateRoomId:null,confirmed:false,approvalReference:"Awaiting review"};const record=await approved(f,{...f.proposal,papers:[{...f.proposal.papers[0],seatingSupport:[support]}]});await assert.rejects(()=>preview(f,record),{status:409,code:"EXAM_PLAN_ACCESSIBILITY"});const confirmed=await approved(f,{...f.proposal,papers:[{...f.proposal.papers[0],seatingSupport:[{...support,confirmed:true}]}]});const checked=await preview(f,confirmed);await db.classRoom.update({where:{id:f.roomId},data:{rows:3}});await assert.rejects(()=>apply(f,confirmed,checked.previewHash),{status:409});const foreign=await approved(f,{...f.proposal,papers:[{...f.proposal.papers[0],seatingSupport:[{...support,studentId:randomUUID(),confirmed:true}]}]});await assert.rejects(()=>preview(f,foreign),{status:409,code:"EXAM_PLAN_ACCESSIBILITY"});assert.equal(await db.examSeat.count({where:{campusId:f.campusId}}),0);});
test("exact approved plan creates one draft session, stable seats and duties across concurrent retries", async () => {
  const f = await fixture(), record = await approved(f), checked = await preview(f, record);
  assert.equal(checked.candidateSeatCount, 3); assert.deepEqual(checked.papers[0].rooms[0].seats.map(seat => seat.label), ["R1-B1", "R1-B2", "R2-B1"]);
  const receipts = await Promise.all([1, 2, 3].map(() => apply(f, record, checked.previewHash)));
  assert.equal(new Set(receipts.map(item => item.id)).size, 1);
  const receipt = receipts[0]; assert.equal(receipt.seatCount, 3); assert.equal(receipt.invigilationCount, 1);
  assert.equal(await db.examSession.count({ where: { campusId: f.campusId, status: "PLANNING" } }), 1);
  assert.equal(await db.exam.count({ where: { campusId: f.campusId, status: "DRAFT", activatedAt: null } }), 1);
  assert.equal(await db.examSeat.count({ where: { campusId: f.campusId } }), 3);
  assert.equal(await db.examInvigilation.count({ where: { campusId: f.campusId, teacherId: f.teacherId } }), 1);
  assert.equal(await db.notification.count({ where: { schoolId, userId: f.teacherId } }), 0);
});
test("roster and room edits invalidate exact preview without partial creation", async () => {
  const f = await fixture(), record = await approved(f), checked = await preview(f, record);
  await db.student.updateMany({ where: { classId: f.classId, rollNo: "1" }, data: { fullName: "Corrected candidate" } });
  await assert.rejects(() => apply(f, record, checked.previewHash), { code: "STALE_EXECUTION_PREVIEW" });
  const next = await preview(f, record); await db.classRoom.update({ where: { id: f.roomId }, data: { rows: 3 } });
  await assert.rejects(() => apply(f, record, next.previewHash), { code: "STALE_EXECUTION_PREVIEW" });
  assert.equal(await db.examSession.count({ where: { campusId: f.campusId } }), 0);
});
test("exam capacity uses spacing, requires complete subjects and never silently omits candidates", async () => {
  const f = await fixture(), record = await approved(f);
  await db.classRoom.update({ where: { id: f.roomId }, data: { rows: 1 } });
  await assert.rejects(() => preview(f, record), { code: "EXAM_PLAN_CAPACITY" });
  await db.classRoom.update({ where: { id: f.roomId }, data: { rows: 2 } });
  await db.subject.create({ data: { schoolId, campusId: f.campusId, classId: f.classId, name: "Science" } });
  await assert.rejects(() => preview(f, record), { code: "EXAM_PLAN_SUBJECTS" });
});
test("overlapping clock windows reject shared rooms even with different period IDs", async () => {
  const f = await fixture(), receipt = await applied(f);
  const other = await db.class.create({ data: { schoolId, campusId: f.campusId, name: "Grade 9", academicYear: 2026 } });
  const subject = await db.subject.create({ data: { schoolId, campusId: f.campusId, classId: other.id, name: "Science" } });
  await db.student.create({ data: { schoolId, campusId: f.campusId, classId: other.id, fullName: "Another candidate", rollNo: "9", admissionNo: randomUUID(), gender: "MALE", dateOfBirth: new Date("2013-01-01") } });
  const period = await db.periodDefinition.create({ data: { schoolId, campusId: f.campusId, timeType: "EXAM", periodNumber: 2, startTime: "09:30", endTime: "10:30" } });
  const proposal = { ...f.proposal, papers: [{ ...f.proposal.papers[0], classId: other.id, subjectId: subject.id, periodDefinitionId: period.id }] };
  const record = await approved(f, proposal);
  await assert.rejects(() => preview(f, record), { code: "EXAM_PLAN_CLASH" });
  assert.equal(await db.examSession.count({ where: { campusId: f.campusId } }), 1);
  assert(receipt.sessionId);
});
test("calendar holidays, weekends, academic boundaries and invigilator leave are checked", async () => {
  const f = await fixture(), record = await approved(f);
  const holiday = await db.holiday.create({ data: { schoolId, campusId: f.campusId, name: "Closure", fromDate: new Date("2026-10-14"), toDate: new Date("2026-10-14") } });
  await assert.rejects(() => preview(f, record), { code: "EXAM_PLAN_HOLIDAY" }); await db.holiday.delete({ where: { id: holiday.id } });
  const weekend = await db.weekend.create({ data: { schoolId, campusId: f.campusId, dayOfWeek: 3 } });
  await assert.rejects(() => preview(f, record), { code: "EXAM_PLAN_WEEKEND" }); await db.weekend.delete({ where: { id: weekend.id } });
  const cycle = await db.academicCycle.create({ data: { schoolId, campusId: f.campusId, academicYear: 2026, label: "Closed cycle", status: "ENDED" } });
  await assert.rejects(() => preview(f, record), { code: "EXAM_PLAN_YEAR" }); await db.academicCycle.delete({ where: { id: cycle.id } });
  const leaveType = await db.leaveType.create({ data: { schoolId, campusId: f.campusId, name: "Casual" } });
  const leave = await db.leaveRequest.create({ data: { schoolId, campusId: f.campusId, userId: f.teacherId, fromDate: new Date("2026-10-14"), toDate: new Date("2026-10-14"), leaveTypeId: leaveType.id, reason: "Synthetic leave", status: "APPROVED" } });
  await assert.rejects(() => preview(f, record), { code: "EXAM_PLAN_LEAVE" }); await db.leaveRequest.delete({ where: { id: leave.id } });
});
test("fresh grants and owner null-campus resolution protect options, application and duty reads", async () => {
  const f = await fixture(), record = await approved(f), checked = await preview(f, record);
  const permission = await db.rolePermission.create({ data: { schoolId, role: "CAMPUS_ADMIN", module: "exams", canView: true, canAdd: true, canEdit: false, canDelete: true } });
  try { await assert.rejects(() => apply(f, record, checked.previewHash), { status: 403 }); await assert.rejects(() => getExamSessionPlanOptions(f.user, f.campusId), { status: 403 }); } finally { await db.rolePermission.delete({ where: { id: permission.id } }); }
  const receipt = await apply(f, record, checked.previewHash);
  const other = await fixture(); await assert.rejects(() => listExamInvigilation(other.user, receipt.sessionId), { status: 404 });
  await db.user.update({ where: { id: f.user.userId }, data: { role: "SUPER_ADMIN", campusId: null } });
  const owner = { ...f.user, role: "SUPER_ADMIN" as const, campusId: null };
  assert.equal((await listExamInvigilation(owner, receipt.sessionId)).duties.length, 1);
  await context({ ...f, user: owner }, async () => {
    assert.equal(await resolveExamSchedulingCampus(owner, null, { kind: "session", id: receipt.sessionId }), f.campusId);
    await assert.rejects(() => resolveExamSchedulingCampus(owner, other.campusId, { kind: "session", id: receipt.sessionId }), { status: 403 });
  });
  await db.user.update({ where: { id: f.user.userId }, data: { isActive: false } });
  await assert.rejects(() => listExamInvigilation(owner, receipt.sessionId), { status: 403 });
});
test("invigilator changes are conflict checked, stale-safe and explicitly cleared before removing rooms", async () => {
  const f = await fixture(), receipt = await applied(f), alternate = await teacher(f), { duties } = await listExamInvigilation(f.user, receipt.sessionId), duty = duties[0];
  const changed = await updateExamInvigilation(f.user, { examRoomId: duty.examRoomId, expectedHash: duty.expectedHash, teacherId: alternate });
  assert.equal(changed.duty.teacherId, alternate);
  await assert.rejects(() => updateExamInvigilation(f.user, { examRoomId: duty.examRoomId, expectedHash: duty.expectedHash, teacherId: f.teacherId }), { status: 409 });
  const replacement = await db.classRoom.create({ data: { schoolId, campusId: f.campusId, roomNumber: "B-1", capacity: 8 } });
  await assert.rejects(() => withExamSchedulingWrite(f.user, f.campusId, "edit", tx => allocateExamRooms({ db: tx, campusId: f.campusId, scheduleId: duty.scheduleId, roomIds: [replacement.id] })), { status: 409 });
  assert.equal(await db.examSeat.count({ where: { examScheduleId: duty.scheduleId } }), 3);
  await updateExamInvigilation(f.user, { examRoomId: duty.examRoomId, expectedHash: changed.duty.expectedHash, teacherId: null });
  await withExamSchedulingWrite(f.user, f.campusId, "edit", tx => allocateExamRooms({ db: tx, campusId: f.campusId, scheduleId: duty.scheduleId, roomIds: [replacement.id] }));
  assert.equal(await db.examInvigilation.count({ where: { campusId: f.campusId } }), 0);
  assert.equal(await db.examSeat.count({ where: { examScheduleId: duty.scheduleId } }), 3);
});
test("manual rescheduling shares the AI booking fence and rolls back conflicting moves", async () => {
  const f = await fixture(), receipt = await applied(f);
  const altTeacher = await teacher(f), room = await db.classRoom.create({ data: { schoolId, campusId: f.campusId, roomNumber: "Second", capacity: 10 } });
  const proposal = { ...f.proposal, term: "TERM_2", papers: [{ ...f.proposal.papers[0], date: "2026-10-15", rooms: [{ roomId: room.id, invigilatorId: altTeacher }] }] };
  const record = await approved(f, proposal), checked = await preview(f, record);
  // Both try to reserve this class on Thursday. A winner forces the other to reread.
  const results = await Promise.allSettled([
    apply(f, record, checked.previewHash),
    withExamSchedulingWrite(f.user, f.campusId, "edit", async tx => { await tx.examSchedule.update({ where: { id: receipt.scheduleIds[0] }, data: { date: new Date("2026-10-15") } }); await validateStoredExamSchedules(tx, { schoolId, campusId: f.campusId }, receipt.scheduleIds); }),
  ]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(await db.examSchedule.count({ where: { campusId: f.campusId, date: new Date("2026-10-15") } }), 1);
});
test("published class lessons and duplicate invigilators across allocated rooms are blocked", async () => {
  const f = await fixture(), record = await approved(f), alternate = await teacher(f), room = await db.classRoom.create({ data: { schoolId, campusId: f.campusId, roomNumber: "Other lesson room", capacity: 20 } });
  const board = await db.timetable.create({ data: { schoolId, campusId: f.campusId, classId: f.classId, academicYear: 2026, term: "TERM_1", status: "PUBLISHED", slots: { create: { schoolId, dayOfWeek: 3, periodNumber: 7, startTime: "09:30", endTime: "10:30", teacherId: alternate, roomId: room.id, subjectId: f.subjectId, slotType: "CLASS" } } } });
  await assert.rejects(() => preview(f, record), { code: "EXAM_PLAN_LESSON_CLASH" });
  await db.timetable.delete({ where: { id: board.id } });
  await db.classRoom.update({ where: { id: f.roomId }, data: { rows: 1 } });
  const split = await approved(f, { ...f.proposal, papers: [{ ...f.proposal.papers[0], rooms: [{ roomId: f.roomId, invigilatorId: f.teacherId }, { roomId: room.id, invigilatorId: alternate }] }] });
  const receipt = await apply(f, split, (await preview(f, split)).previewHash), { duties } = await listExamInvigilation(f.user, receipt.sessionId), change = duties.find(duty => duty.teacherId === alternate)!;
  await assert.rejects(() => updateExamInvigilation(f.user, { examRoomId: change.examRoomId, expectedHash: change.expectedHash, teacherId: f.teacherId }), { code: "EXAM_PLAN_CLASH" });
  assert.equal((await db.examInvigilation.findUniqueOrThrow({ where: { examRoomId: change.examRoomId } })).teacherId, alternate);
});
test("receipt replay does not bypass fresh role grants, and clearing a stale duty still releases it", async () => {
  const f = await fixture(), record = await approved(f), checked = await preview(f, record), key = randomUUID(), receipt = await apply(f, record, checked.previewHash, key);
  const permission = await db.rolePermission.create({ data: { schoolId, role: "CAMPUS_ADMIN", module: "students", canView: false, canAdd: true, canEdit: true, canDelete: true } });
  try { await assert.rejects(() => apply(f, record, checked.previewHash, key), { status: 403 }); } finally { await db.rolePermission.delete({ where: { id: permission.id } }); }
  await db.user.update({ where: { id: f.teacherId }, data: { isActive: false } });
  const { duties } = await listExamInvigilation(f.user, receipt.sessionId);
  const result = await updateExamInvigilation(f.user, { examRoomId: duties[0].examRoomId, expectedHash: duties[0].expectedHash, teacherId: null });
  assert.equal(result.duty.teacherId, null);
});

test("fenced report review and publication retain approved version workflow", async () => {
  const f = await fixture(), receipt = await applied(f), examId = receipt.examIds[0];
  const students = await db.student.findMany({ where: { classId: f.classId } });
  await db.mark.createMany({ data: students.map(student => ({ schoolId, campusId: f.campusId, examId, subjectId: f.subjectId, studentId: student.id, marksObtained: 80 })) });
  await db.exam.update({ where: { id: examId }, data: { status: "LOCKED", isLocked: true } });
  const generated = await withExamSchedulingWrite(f.user, f.campusId, "edit", tx => generateReportCardsForLockedExam(examId, tx));
  await db.reportCard.updateMany({ where: { examId }, data: { remarksEn: "Reviewed synthetic progress." } });
  await context(f, async () => {
    await assert.rejects(() => reviewExam(examId, f.user.userId), { status: 409 });
    const versions = await reviewQueue(generated.reportCards.map(report => report.id));
    await approveVersions(versions.map(version => ({ reportCardId: version.reportCardId, versionId: version.id })), f.user.userId);
    const reviewed = await reviewExam(examId, f.user.userId); assert.equal(reviewed.status, "PRINCIPAL_REVIEWED");
    const published = await publishExam(examId, f.user.userId); assert.equal(published.versions.length, students.length);
  });
  assert.equal((await db.exam.findUniqueOrThrow({ where: { id: examId } })).status, "PUBLISHED");
  assert.equal(await db.reportCard.count({ where: { examId, status: "PUBLISHED", publishedVersionId: { not: null } } }), students.length);
});

test("standalone service generation waits for rejection and cannot recreate withdrawn reports", async () => {
  const f = await fixture(), receipt = await applied(f), examId = receipt.examIds[0];
  const students = await db.student.findMany({ where: { classId: f.classId } });
  await db.mark.createMany({ data: students.map(student => ({ schoolId, campusId: f.campusId, examId, subjectId: f.subjectId, studentId: student.id, marksObtained: 80 })) });
  await db.exam.update({ where: { id: examId }, data: { status: "LOCKED", isLocked: true } });
  const serviceContext = { schoolId, campusId: f.campusId, role: "SERVICE" };
  const generated = await runWithTenantContext(serviceContext, () => generateReportCardsForLockedExam(examId));
  assert.equal(generated.generated, students.length);
  await assert.rejects(() => runWithTenantContext({ ...serviceContext, campusId: randomUUID() }, () => generateReportCardsForLockedExam(examId)), /Exam not found/);

  let releaseRejection!: () => void, signalFence!: (pid: number) => void;
  const gate = new Promise<void>(resolve => { releaseRejection = resolve; });
  const fence = new Promise<number>(resolve => { signalFence = resolve; });
  const rejection = withExamSchedulingWrite(f.user, f.campusId, "edit", async tx => {
    const [backend] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
    signalFence(backend.pid);
    await gate;
    await tx.reportCard.deleteMany({ where: { examId } });
    await tx.exam.update({ where: { id: examId }, data: { status: "MARKS_ENTRY", isLocked: false } });
  });
  const rejectionPid = await Promise.race([fence, rejection.then(() => { throw new Error("Rejection completed before its fence was observed"); })]);
  let generationSettled = false;
  const concurrentGeneration = runWithTenantContext(serviceContext, () => generateReportCardsForLockedExam(examId)).then(
    value => { generationSettled = true; return { status: "fulfilled" as const, value }; },
    reason => { generationSettled = true; return { status: "rejected" as const, reason }; },
  );
  try {
    // Observe the actual database wait instead of assuming a timing delay puts
    // generation between the rejection's source reads and commit.
    let waiting = false;
    for (let attempt = 0; attempt < 200; attempt++) {
      const blocked = await db.$queryRaw<Array<{ pid: number }>>`SELECT pid FROM pg_stat_activity WHERE ${rejectionPid} = ANY(pg_blocking_pids(pid))`;
      if (blocked.length) { waiting = true; break; }
      assert.equal(generationSettled, false, "Generation bypassed the rejection fence");
      await delay(10);
    }
    assert.equal(waiting, true, "Standalone generation must wait on the held campus fence");
  } finally {
    releaseRejection();
    await rejection;
    await concurrentGeneration;
  }
  const outcome = await concurrentGeneration;
  assert.equal(outcome.status, "rejected");
  if (outcome.status === "rejected") assert.match(String(outcome.reason), /only be generated from locked exams/);
  assert.equal((await db.exam.findUniqueOrThrow({ where: { id: examId } })).isLocked, false);
  assert.equal(await db.reportCard.count({ where: { examId } }), 0);
});
