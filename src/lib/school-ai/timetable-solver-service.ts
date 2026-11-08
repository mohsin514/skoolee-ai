import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";
import { getLocalePackage } from "@/lib/locale/store";
import { assertTimetableWriteAccess } from "@/lib/timetable/manual";
import { getExamBookingSlots } from "@/lib/academic/exam-bookings";
import { SchoolAiError, assertSchoolAiAccess, loadWorkspacePermissionSnapshot, resolveWorkspaceCampus } from "./access";
import { schoolAiTransaction } from "./transaction";
import { timetableSetupProposalSchema } from "./timetable-setup";
import { getSubstituteBookings } from "./school-operations-bookings";
import { solveTimetable, timetableSolveInputSchema, type TimetableSolveInput } from "./timetable-solver";

export async function suggestTimetable(user: AuthUser, raw: unknown) {
  const input = timetableSolveInputSchema.parse(raw);
  return schoolAiTransaction(user, async tx => {
    const context = await prepareTimetableSolver(user, input, tx);
    const solution = solveTimetable(context);
    return { ...solution, proposal: solution.status === "SOLVED" ? timetableSetupProposalSchema.parse({ operation: "timetable.create_draft", classId: context.classId, academicYear: context.academicYear, term: input.term, slots: solution.slots }) : null, excludedRoomIds: context.excludedRoomIds, constraintScope: "CURRENT_BOOKINGS_AND_EXPLICIT_REQUIREMENTS" as const };
  });
}

export async function prepareTimetableSolver(user: AuthUser, input: TimetableSolveInput, tx: TxClient) {
    await assertSchoolAiAccess(user, "add", await loadWorkspacePermissionSnapshot(user, tx));
    const campusId = await resolveWorkspaceCampus(user, input.campusId, tx);
    if (!campusId) throw new SchoolAiError("Choose a campus.", 400);
    await assertTimetableWriteAccess(user, campusId, "add", tx);
    const scope = { schoolId: user.schoolId, campusId };
    const cls = await tx.class.findFirst({ where: { ...scope, id: input.classId, status: "ACTIVE", archivedAt: null }, select: { id: true, academicYear: true, teachingMode: true, classTeacherId: true } });
    if (!cls) throw new SchoolAiError("Choose an active class in this campus.", 409, "TIMETABLE_SCOPE");
    const termFilter = input.term === "ANNUAL" ? {} : { OR: [{ term: { in: ["ANNUAL", input.term] } }, { term: { notIn: ["ANNUAL", "TERM_1", "TERM_2", "TERM_3"] } }] };
    const [subjects, rooms, periods, size, teachers, locale, existing, cycle] = await Promise.all([
      tx.subject.findMany({ where: { ...scope, classId: cls.id, id: { in: input.requirements.map(item => item.subjectId) } }, select: { id: true, teacherId: true } }),
      tx.classRoom.findMany({ where: { ...scope, id: { in: input.roomIds } }, select: { id: true, capacity: true }, orderBy: [{ capacity: "asc" }, { id: "asc" }] }),
      tx.periodDefinition.findMany({ where: { ...scope, timeType: "CLASS" }, select: { periodNumber: true, startTime: true, endTime: true }, orderBy: { periodNumber: "asc" }, take: 31 }),
      tx.student.count({ where: { ...scope, classId: cls.id } }),
      tx.user.findMany({ where: { ...scope, role: { in: ["TEACHER", "PRINCIPAL"] }, isActive: true }, select: { id: true }, take: 1001 }),
      getLocalePackage(user.schoolId, campusId, new Date(), undefined, tx),
      tx.timetable.findFirst({ where: { ...scope, classId: cls.id, academicYear: cls.academicYear, ...termFilter }, select: { id: true } }),
      tx.academicCycle.findFirst({ where: { ...scope, academicYear: cls.academicYear }, select: { status: true } }),
    ]);
    if (existing) throw new SchoolAiError("This class already has an overlapping schedule. Edit its existing timetable.", 409, "TIMETABLE_EXISTS");
    if (cycle && !["DRAFT", "ACTIVE"].includes(cycle.status)) throw new SchoolAiError("The academic year is paused or closed.", 409, "TIMETABLE_SCOPE");
    if (subjects.length !== input.requirements.length || rooms.length !== input.roomIds.length || teachers.length > 1000) throw new SchoolAiError("A selected subject or room is unavailable.", 409, "TIMETABLE_REFERENCE");
    const weekends = locale.weekend.map(day => day || 7);
    if (input.days.some(day => weekends.includes(day))) throw new SchoolAiError("Choose configured working days.", 409, "TIMETABLE_WEEKEND");
    const validTime = (time: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
    if (!periods.length || periods.length > 30 || periods.some(period => !validTime(period.startTime) || !validTime(period.endTime) || period.startTime >= period.endTime || period.periodNumber < 1 || period.periodNumber > 30) || new Set(periods.map(period => period.periodNumber)).size !== periods.length) throw new SchoolAiError("Configure valid class period definitions before generating a timetable.", 422, "SOLVER_PERIODS_REQUIRED");
    const availableRooms = rooms.filter(room => room.capacity > 0 && room.capacity >= size);
    if (!availableRooms.length) throw new SchoolAiError("Choose at least one room with a recorded capacity sufficient for this class.", 422, "SOLVER_CAPACITY");
    const requirements = input.requirements.map(requirement => {
      const teacherId = cls.teachingMode === "SINGLE" ? cls.classTeacherId : cls.teachingMode === "SUBJECT" ? subjects.find(subject => subject.id === requirement.subjectId)?.teacherId : null;
      if (!teacherId || !teachers.some(teacher => teacher.id === teacherId)) throw new SchoolAiError("Assign an active teacher to every requested subject first.", 409, "TIMETABLE_ASSIGNMENT");
      return { ...requirement, teacherId };
    });
    const bookings = await tx.timetableSlot.findMany({ where: { schoolId: user.schoolId, slotType: "CLASS", timetable: { ...scope, academicYear: cls.academicYear, ...termFilter }, OR: [{ teacherId: { in: requirements.map(item => item.teacherId) } }, { roomId: { in: availableRooms.map(room => room.id) } }] }, select: { dayOfWeek: true, periodNumber: true, startTime: true, endTime: true, teacherId: true, roomId: true }, take: 10001 });
    if (bookings.length > 10000) throw new SchoolAiError("Narrow the planning scope.", 422, "TIMETABLE_SCOPE_LIMIT");
    if (bookings.some(slot => !validTime(slot.startTime) || !validTime(slot.endTime) || slot.startTime >= slot.endTime)) throw new SchoolAiError("Correct invalid times on existing bookings first.", 409, "TIMETABLE_EXISTING_INVALID");
    const exams = await getExamBookingSlots(tx, { ...scope, academicYear: cls.academicYear, term: input.term });
    const substitutes = await getSubstituteBookings(tx, { ...scope, academicYear: cls.academicYear, term: input.term });
    return { classId: cls.id, academicYear: cls.academicYear, requirements, windows: input.days.flatMap(dayOfWeek => periods.map(period => ({ ...period, dayOfWeek }))), roomIds: availableRooms.map(room => room.id), bookings: [...bookings, ...exams.map(exam => ({ ...exam, clockOnly: true })), ...substitutes.map(duty => ({ ...duty, roomId: null, clockOnly: true }))], excludedRoomIds: rooms.filter(room => !availableRooms.some(item => item.id === room.id)).map(room => room.id) };
}
