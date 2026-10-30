import type { SchoolAiRecord } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { runWithTenantContext } from "@/lib/db/tenant-context";
import { resolveCampusId } from "@/lib/api/scope";
import { resolveAcademicModelVersionForTerm } from "@/lib/academic/model-service";
import { roomCapacity } from "@/lib/academic/room-capacity";
import { assertExamReservations } from "@/lib/academic/exam-bookings";
import { assertExamSchedulingAccess } from "@/lib/academic/exam-scheduling-write";
import { assertSchoolAiAccess, assertWorkspacePermission, loadWorkspacePermissionSnapshot, SchoolAiError } from "./access";
import { workspaceRequestHash } from "./repository";
import { examSessionPlanProposalSchema, type ExamSessionPlanOptions, type ExamSessionPlanPreview } from "./exam-session-plan";
import { allocateSupportedSeats } from "./exam-seat-support";
function fail(message: string, code: string): never { throw new SchoolAiError(message, 409, code); }
const roomSelect = { id: true, roomNumber: true, capacity: true, rows: true, benchesPerRow: true, seatsPerBench: true, examSeatsPerBench: true } as const;
export async function assertExamSessionPlanAccess(user: AuthUser, db: TxClient, campusId?: string) {
  const campus = campusId ?? user.campusId;
  if (!campus) throw new SchoolAiError("Choose a campus first.", 400, "CAMPUS_REQUIRED");
  await assertExamSchedulingAccess(user, campus, "add", db);
  const permissions = await loadWorkspacePermissionSnapshot(user, db);
  await assertSchoolAiAccess(user, "edit", permissions);
  for (const [module, action] of [["ai", "view"], ["exams", "view"], ["exams", "edit"], ["students", "view"]] as const) await assertWorkspacePermission(user, module, action, permissions);
}
export async function getExamSessionPlanOptions(user: AuthUser, requestedCampusId?: string | null): Promise<ExamSessionPlanOptions> {
  return runWithTenantContext({ schoolId: user.schoolId, campusId: user.campusId, userId: user.userId, role: user.role }, async () => {
    const campusId = await resolveCampusId(user, requestedCampusId);
    await assertExamSessionPlanAccess(user, prisma, campusId);
    const scope = { schoolId: user.schoolId, campusId };
    const [classes, subjects, rooms, teachers, periods] = await Promise.all([
      prisma.class.findMany({ where: { ...scope, status: "ACTIVE", archivedAt: null, campus: { archivedAt: null } }, select: { id: true, name: true, section: true, academicYear: true, _count: { select: { students: { where: { status: "active", archivedAt: null } } } } }, orderBy: [{ academicYear: "desc" }, { name: "asc" }, { id: "asc" }], take: 501 }),
      prisma.subject.findMany({ where: { ...scope, class: { status: "ACTIVE", archivedAt: null } }, select: { id: true, name: true, classId: true, totalMarks: true }, orderBy: [{ name: "asc" }, { id: "asc" }], take: 4001 }),
      prisma.classRoom.findMany({ where: scope, select: roomSelect, orderBy: [{ roomNumber: "asc" }, { id: "asc" }], take: 501 }),
      prisma.user.findMany({ where: { ...scope, isActive: true, role: { in: ["TEACHER", "PRINCIPAL"] } }, select: { id: true, fullName: true }, orderBy: [{ fullName: "asc" }, { id: "asc" }], take: 1001 }),
      prisma.periodDefinition.findMany({ where: { ...scope, timeType: "EXAM" }, select: { id: true, periodNumber: true, startTime: true, endTime: true }, orderBy: [{ periodNumber: "asc" }, { id: "asc" }], take: 101 }),
    ]);
    if (classes.length > 500 || subjects.length > 4000 || rooms.length > 500 || teachers.length > 1000 || periods.length > 100) fail("This campus needs a narrower planning scope.", "EXAM_PLAN_LIMIT");
    return { campusId, classes: classes.map(({ _count, ...cls }) => ({ ...cls, studentCount: _count.students })), subjects, rooms: rooms.map(room => ({ id: room.id, roomNumber: room.roomNumber, capacity: roomCapacity(room).exam, hasLayout: roomCapacity(room).hasLayout })), teachers, periods };
  });
}
export async function getExamSeatingCandidates(user:AuthUser,requestedCampusId:string|null,classId:string){
 return runWithTenantContext({schoolId:user.schoolId,campusId:user.campusId,userId:user.userId,role:user.role},async()=>{const campusId=await resolveCampusId(user,requestedCampusId);await assertExamSessionPlanAccess(user,prisma,campusId);const cls=await prisma.class.findFirst({where:{id:classId,schoolId:user.schoolId,campusId,status:"ACTIVE",archivedAt:null}});if(!cls)throw new SchoolAiError("Class unavailable in this campus.",404,"EXAM_PLAN_REFERENCE");const students=await prisma.student.findMany({where:{schoolId:user.schoolId,campusId,classId,status:"active",archivedAt:null},select:{id:true,fullName:true,rollNo:true},orderBy:[{rollNo:"asc"},{id:"asc"}],take:1001});if(students.length>1000)fail("Choose a class with at most 1000 active candidates.","EXAM_PLAN_LIMIT");return students;});
}
export async function previewExamSessionPlan(user: AuthUser, record: SchoolAiRecord & { campusId: string }, db: TxClient): Promise<ExamSessionPlanPreview> {
  await assertExamSessionPlanAccess(user, db, record.campusId);
  const parsed = examSessionPlanProposalSchema.safeParse((record.data as { proposal?: unknown }).proposal);
  if (!parsed.success) fail("Save a complete reviewed exam-session proposal first.", "EXAM_PLAN_PROPOSAL");
  const proposal = parsed.data;
  const scope = { schoolId: user.schoolId, campusId: record.campusId };
  const classIds = [...new Set(proposal.papers.map(paper => paper.classId))], roomIds = [...new Set(proposal.papers.flatMap(paper => paper.rooms.map(room => room.roomId)))], teacherIds = [...new Set(proposal.papers.flatMap(paper => paper.rooms.map(room => room.invigilatorId)))];
  const [classes, subjects, students, rooms, teachers, cycle, existing] = await Promise.all([
    db.class.findMany({ where: { ...scope, id: { in: classIds }, academicYear: proposal.academicYear, status: "ACTIVE", archivedAt: null, campus: { archivedAt: null } }, select: { id: true, name: true, section: true }, orderBy: { id: "asc" } }),
    db.subject.findMany({ where: { ...scope, classId: { in: classIds } }, select: { id: true, name: true, classId: true, totalMarks: true }, orderBy: { id: "asc" } }),
    db.student.findMany({ where: { ...scope, classId: { in: classIds }, status: "active", archivedAt: null }, select: { id: true, fullName: true, rollNo: true, classId: true }, orderBy: [{ rollNo: "asc" }, { fullName: "asc" }, { id: "asc" }], take: 1001 }),
    db.classRoom.findMany({ where: { ...scope, id: { in: roomIds } }, select: roomSelect, orderBy: { id: "asc" } }),
    db.user.findMany({ where: { ...scope, id: { in: teacherIds }, isActive: true, role: { in: ["TEACHER", "PRINCIPAL"] } }, select: { id: true, fullName: true }, orderBy: { id: "asc" } }),
    db.academicCycle.findFirst({ where: { ...scope, academicYear: proposal.academicYear }, select: { id: true, status: true, startDate: true, endDate: true, updatedAt: true } }),
    db.exam.findMany({ where: { ...scope, classId: { in: classIds }, academicYear: proposal.academicYear, examType: proposal.examType, term: { equals: proposal.term, mode: "insensitive" } }, select: { id: true }, take: 1 }),
  ]);
  if (classes.length !== classIds.length || rooms.length !== roomIds.length || teachers.length !== teacherIds.length) fail("A selected class, room or active invigilator is unavailable in this campus.", "EXAM_PLAN_REFERENCE");
  if (existing.length) fail("A selected class already has this exam type and term. Edit the existing session; this tool preserves it.", "EXAM_PLAN_EXISTS");
  if (cycle && !["DRAFT", "ACTIVE"].includes(cycle.status)) fail("This academic year is paused or ended.", "EXAM_PLAN_YEAR");
  if (students.length > 1000) fail("Plan at most 1000 candidate seat assignments in one session.", "EXAM_PLAN_LIMIT");
  const paperSubjects = new Set(proposal.papers.map(paper => paper.subjectId));
  if (subjects.length !== paperSubjects.size || subjects.some(subject => !paperSubjects.has(subject.id)) || proposal.papers.some(paper => !subjects.some(subject => subject.id === paper.subjectId && subject.classId === paper.classId))) fail("Include every current subject exactly once for each selected class.", "EXAM_PLAN_SUBJECTS");
  if (subjects.some(subject => !Number.isSafeInteger(subject.totalMarks) || subject.totalMarks < 1)) fail("Record positive total marks for every selected subject first.", "EXAM_PLAN_MARKS");
  const checks = await assertExamReservations(db, scope, proposal.papers.map(paper => ({ ...paper, academicYear: proposal.academicYear, term: proposal.term, roomIds: paper.rooms.map(room => room.roomId), teacherIds: paper.rooms.map(room => room.invigilatorId) })));
  const modelIds = new Map(await Promise.all(classes.map(async cls => [cls.id, await resolveAcademicModelVersionForTerm({ campusId: record.campusId, classId: cls.id, academicYear: proposal.academicYear, term: proposal.term }, db)] as const)));
  const warnings: ExamSessionPlanPreview["warnings"] = [];
  const papers: ExamSessionPlanPreview["papers"] = proposal.papers.map(paper => {
    const cls = classes.find(item => item.id === paper.classId)!, subject = subjects.find(item => item.id === paper.subjectId)!;
    const candidates = students.filter(student => student.classId === cls.id);
    if (!candidates.length) fail("Every selected class needs at least one active student.", "EXAM_PLAN_ROSTER");
    const date = new Date(`${paper.date}T00:00:00Z`);
    if (cycle && (cycle.startDate && date < cycle.startDate || cycle.endDate && date > cycle.endDate)) fail("A paper falls outside the configured academic year.", "EXAM_PLAN_YEAR");
    const period = checks!.periods.find(item => item.id === paper.periodDefinitionId)!;
    const selectedRooms=paper.rooms.map(choice=>rooms.find(room=>room.id===choice.roomId)!);
    for(const room of selectedRooms){const capacity=roomCapacity(room);if(capacity.unmeasured||capacity.exam<1)fail("Record the exam seating capacity for every selected room.","EXAM_PLAN_CAPACITY");}
    if(!paper.seatingSupport?.length){let remaining=candidates.length;for(const room of selectedRooms){if(remaining<=0)fail("Remove rooms that would receive no candidates.","EXAM_PLAN_EMPTY_ROOM");remaining-=roomCapacity(room).exam;}if(remaining>0)fail("Selected rooms cannot seat every active candidate at exam spacing.","EXAM_PLAN_CAPACITY");}
    let seating:ReturnType<typeof allocateSupportedSeats>;
    try{seating=allocateSupportedSeats(candidates,selectedRooms,paper.seatingSupport??[]);}catch(error){fail(error instanceof Error?error.message:"The seating constraints cannot be satisfied.","EXAM_PLAN_ACCESSIBILITY");}
    const allocated=paper.rooms.map(choice=>{const room=rooms.find(item=>item.id===choice.roomId)!,teacher=teachers.find(item=>item.id===choice.invigilatorId)!,capacity=roomCapacity(room);
      if(!capacity.hasLayout&&!warnings.some(item=>item.roomNumber===room.roomNumber))warnings.push({code:"EXAM_LAYOUT_INFERRED",roomNumber:room.roomNumber});
      return{roomId:room.id,roomNumber:room.roomNumber,invigilatorId:teacher.id,invigilatorName:teacher.fullName,capacity:capacity.exam,hasLayout:capacity.hasLayout,seats:seating.filter(row=>row.roomId===room.id).sort((a,b)=>a.seat.seatNumber-b.seat.seatNumber).map(row=>{const student=candidates.find(item=>item.id===row.studentId)!;return{studentId:student.id,fullName:student.fullName,rollNo:student.rollNo,...row.seat,rowNo:capacity.hasLayout?row.seat.rowNo:0,benchNo:capacity.hasLayout?row.seat.benchNo:0,seatOnBench:capacity.hasLayout?row.seat.seatOnBench:0};})};
    });
    return { academicModelVersionId: modelIds.get(cls.id) ?? null, id: paper.id, classId: cls.id, className: [cls.name, cls.section].filter(Boolean).join(" · "), subjectId: subject.id, subjectName: subject.name, totalMarks: subject.totalMarks, date: paper.date, periodDefinitionId: period.id, periodNumber: period.periodNumber, startTime: period.startTime, endTime: period.endTime, rooms: allocated, seatingSupport:paper.seatingSupport??[] };
  });
  const candidateSeatCount = papers.reduce((total, paper) => total + paper.rooms.reduce((sum, room) => sum + room.seats.length, 0), 0);
  if (candidateSeatCount > 1000) fail("Plan at most 1000 candidate seat assignments in one session.", "EXAM_PLAN_LIMIT");
  const dates = papers.map(paper => paper.date).sort();
  const preview = { operation: proposal.operation, recordId: record.id, version: record.version, campusId: record.campusId, title: proposal.title, term: proposal.term, academicYear: proposal.academicYear, examType: proposal.examType, startDate: dates[0], endDate: dates[dates.length - 1], candidateSeatCount, papers, warnings };
  // Hash the exact current dependencies, never just counts: roster, layout,
  // permissions are revalidated, and any booking/calendar edit requires review.
  return { ...preview, previewHash: workspaceRequestHash(JSON.parse(JSON.stringify({ preview, classes, subjects, students, rooms, teachers, cycle, checks }))) };
}
export async function applyExamSessionPlan(user: AuthUser, preview: ExamSessionPlanPreview, db: TxClient) {
  const scope = { schoolId: user.schoolId, campusId: preview.campusId };
  const session = await db.examSession.create({ data: { ...scope, title: preview.title, term: preview.term, academicYear: preview.academicYear, examType: preview.examType, startDate: new Date(`${preview.startDate}T00:00:00Z`), endDate: new Date(`${preview.endDate}T00:00:00Z`), status: "PLANNING", createdBy: user.userId } });
  const examIds: string[] = [], scheduleIds: string[] = [];
  let seatCount = 0, invigilationCount = 0;
  for (const classId of [...new Set(preview.papers.map(paper => paper.classId))]) {
    const papers = preview.papers.filter(paper => paper.classId === classId);
    const exam = await db.exam.create({ data: { ...scope, classId, academicModelVersionId: papers[0].academicModelVersionId, sessionId: session.id, title: preview.title, term: preview.term, academicYear: preview.academicYear, examType: preview.examType, totalMarks: papers.reduce((sum, paper) => sum + paper.totalMarks, 0), status: "ACTIVE", activatedAt: new Date() } });
    examIds.push(exam.id);
    for (const paper of papers) {
      const schedule = await db.examSchedule.create({ data: { ...scope, examId: exam.id, subjectId: paper.subjectId, date: new Date(`${paper.date}T00:00:00Z`), periodDefinitionId: paper.periodDefinitionId, roomId: paper.rooms[0].roomId } });
      scheduleIds.push(schedule.id);
      for (const [index, room] of paper.rooms.entries()) {
        const allocated = await db.examRoom.create({ data: { ...scope, examScheduleId: schedule.id, roomId: room.roomId, isPrimary: index === 0 } });
        await db.examSeat.createMany({ data: room.seats.map(seat => ({ ...scope, examScheduleId: schedule.id, examRoomId: allocated.id, studentId: seat.studentId, seatNumber: seat.seatNumber, rowNo: seat.rowNo, benchNo: seat.benchNo, seatOnBench: seat.seatOnBench })) });
        await db.examInvigilation.create({ data: { ...scope, examRoomId: allocated.id, teacherId: room.invigilatorId, createdById: user.userId } });
        seatCount += room.seats.length; invigilationCount++;
      }
    }
  }
  // SKO-500: the plan's papers are requested at once (one per grade and subject); authors hear from the Papers step.
  const { createSlotsInTransaction } = await import("./paper-slot-service");
  const slots = await createSlotsInTransaction(user, { id: session.id, campusId: preview.campusId, title: session.title, paperDueOn: null }, db);
  return { sessionId: session.id, examIds, scheduleIds, seatCount, invigilationCount, paperSlots: slots.created.length, sessionStatus: "PLANNING" as const, examStatus: "ACTIVE" as const };
}
