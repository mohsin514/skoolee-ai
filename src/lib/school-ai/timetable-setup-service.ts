import type { SchoolAiRecord } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { runWithTenantContext } from "@/lib/db/tenant-context";
import { assertSchoolOperational } from "@/lib/billing/entitlements";
import { resolveCampusId } from "@/lib/api/scope";
import { validateTimetableSlots } from "@/lib/timetable/validate";
import { getLocalePackage } from "@/lib/locale/store";
import { assertApprovalRole, assertSchoolAiAccess, assertWorkspacePermission, loadWorkspacePermissionSnapshot, SchoolAiError } from "./access";
import { workspaceRequestHash } from "./repository";
import { timetableSetupProposalSchema, type TimetableSetupOptions, type TimetableSetupPreview } from "./timetable-setup";

export async function getTimetableSetupOptions(user: AuthUser, requestedCampusId?: string | null): Promise<TimetableSetupOptions> {
  return runWithTenantContext({ schoolId: user.schoolId, campusId: user.campusId, userId: user.userId, role: user.role }, async () => {
    assertApprovalRole(user);
    const permissions = await loadWorkspacePermissionSnapshot(user);
    await assertSchoolAiAccess(user, "view", permissions);
    await assertWorkspacePermission(user, "timetable", "view", permissions);
    await assertSchoolOperational(user.schoolId);
    if (user.role !== "SUPER_ADMIN" && requestedCampusId && requestedCampusId !== user.campusId) throw new SchoolAiError("Choose your assigned campus.", 403, "TIMETABLE_SCOPE");
    const campusId = await resolveCampusId(user, requestedCampusId);
    const [classes, subjects, teachers, rooms, periods, locale] = await Promise.all([
      prisma.class.findMany({ where: { schoolId: user.schoolId, campusId, status: "ACTIVE", archivedAt: null }, select: { id: true, name: true, section: true, academicYear: true, teachingMode: true, classTeacherId: true }, orderBy: [{ academicYear: "desc" }, { name: "asc" }, { section: "asc" }], take: 501 }),
      prisma.subject.findMany({ where: { schoolId: user.schoolId, campusId, class: { status: "ACTIVE", archivedAt: null } }, select: { id: true, name: true, classId: true, teacherId: true }, orderBy: { name: "asc" }, take: 4001 }),
      prisma.user.findMany({ where: { schoolId: user.schoolId, campusId, isActive: true, role: { in: ["TEACHER", "PRINCIPAL"] } }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" }, take: 1001 }),
      prisma.classRoom.findMany({ where: { schoolId: user.schoolId, campusId, archivedAt: null }, select: { id: true, roomNumber: true, capacity: true }, orderBy: { roomNumber: "asc" }, take: 1001 }),
      prisma.periodDefinition.findMany({ where: { schoolId: user.schoolId, campusId, timeType: "CLASS" }, select: { periodNumber: true, startTime: true, endTime: true }, orderBy: { periodNumber: "asc" }, take: 101 }),
      getLocalePackage(user.schoolId, campusId),
    ]);
    if (classes.length > 500 || subjects.length > 4000 || teachers.length > 1000 || rooms.length > 1000 || periods.length > 100) throw new SchoolAiError("This campus needs a narrower timetable planning scope.", 422, "TIMETABLE_SCOPE_LIMIT");
    return { campusId, classes, subjects, teachers, rooms, periods, weekendDays: locale.weekend.map(day => day || 7).sort() };
  });
}

export async function previewTimetableSetup(user: AuthUser, record: SchoolAiRecord & { campusId: string }, db: TxClient): Promise<TimetableSetupPreview> {
  const data = record.data as { proposal?: unknown };
  const parsed = timetableSetupProposalSchema.safeParse(data.proposal);
  if (!parsed.success) {
    if (parsed.error.issues.some(issue => issue.code === "custom" && issue.params?.code === "TIMETABLE_PERIOD_INCONSISTENT")) throw new SchoolAiError("Use the same start and end times for this period number on every day.", 422, "TIMETABLE_PERIOD_INCONSISTENT");
    throw new SchoolAiError("Save a complete typed timetable proposal first.", 422, "TIMETABLE_PROPOSAL_REQUIRED");
  }
  const proposal = parsed.data;
  const scope = { schoolId: user.schoolId, campusId: record.campusId };
  const locale = await getLocalePackage(user.schoolId, record.campusId, new Date(), undefined, db);
  const weekendDays = locale.weekend.map(day => day || 7).sort();
  if (proposal.slots.some(slot => weekendDays.includes(slot.dayOfWeek))) throw new SchoolAiError("A proposed period falls on a configured campus weekend. Review the school calendar.", 409, "TIMETABLE_WEEKEND");
  const cls = await db.class.findFirst({ where: { ...scope, id: proposal.classId, academicYear: proposal.academicYear, status: "ACTIVE", archivedAt: null, campus: { archivedAt: null } }, select: { id: true, name: true, section: true, teachingMode: true, classTeacherId: true, academicYear: true } });
  if (!cls) throw new SchoolAiError("Choose an active class in this campus and its current academic year.", 409, "TIMETABLE_SCOPE");
  const cycle = await db.academicCycle.findFirst({ where: { ...scope, academicYear: proposal.academicYear }, select: { id: true, status: true, updatedAt: true } });
  if (cycle && !["DRAFT", "ACTIVE"].includes(cycle.status)) throw new SchoolAiError("This academic year is paused or ended.", 409, "TIMETABLE_SCOPE");
  // Legacy schedules allow arbitrary term labels. Their dates are unknown, so
  // they cannot safely be treated as disjoint from a reviewed named term.
  const overlappingTerms = proposal.term === "ANNUAL" ? {} : { OR: [{ term: { in: ["ANNUAL", proposal.term] } }, { term: { notIn: ["ANNUAL", "TERM_1", "TERM_2", "TERM_3"] } }] };
  const current = await db.timetable.findFirst({ where: { ...scope, classId: cls.id, academicYear: proposal.academicYear, ...overlappingTerms }, select: { id: true } });
  if (current) throw new SchoolAiError("A schedule already exists for this class and overlapping year/term. Review it in the timetable workspace; this tool never replaces it.", 409, "TIMETABLE_EXISTS");
  const teaching = proposal.slots.filter(slot => slot.slotType === "CLASS");
  const subjectIds = [...new Set(teaching.map(slot => slot.subjectId!))], teacherIds = [...new Set(teaching.map(slot => slot.teacherId!))], roomIds = [...new Set(teaching.map(slot => slot.roomId!))];
  const [subjects, teachers, rooms, periods, classSize, existing] = await Promise.all([
    db.subject.findMany({ where: { ...scope, classId: cls.id, id: { in: subjectIds } }, select: { id: true, name: true, teacherId: true }, orderBy: { id: "asc" } }),
    db.user.findMany({ where: { ...scope, id: { in: teacherIds }, isActive: true, role: { in: ["TEACHER", "PRINCIPAL"] } }, select: { id: true, fullName: true }, orderBy: { id: "asc" } }),
    db.classRoom.findMany({ where: { ...scope, id: { in: roomIds } }, select: { id: true, roomNumber: true, capacity: true }, orderBy: { id: "asc" } }),
    db.periodDefinition.findMany({ where: { ...scope, timeType: "CLASS" }, select: { periodNumber: true, startTime: true, endTime: true }, orderBy: { periodNumber: "asc" } }),
    db.student.count({ where: { ...scope, classId: cls.id } }),
    db.timetableSlot.findMany({ where: { schoolId: user.schoolId, timetable: { ...scope, academicYear: proposal.academicYear, ...overlappingTerms }, slotType: "CLASS", OR: [{ teacherId: { in: teacherIds } }, { roomId: { in: roomIds } }] }, select: { id: true, timetableId: true, dayOfWeek: true, periodNumber: true, startTime: true, endTime: true, teacherId: true, roomId: true, subjectId: true }, orderBy: { id: "asc" }, take: 10001 }),
  ]);
  if (existing.length > 10000) throw new SchoolAiError("This campus needs a narrower timetable planning scope.", 422, "TIMETABLE_SCOPE_LIMIT");
  if (existing.some(slot => !/^([01]\d|2[0-3]):[0-5]\d$/.test(slot.startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(slot.endTime) || slot.startTime >= slot.endTime)) throw new SchoolAiError("Correct invalid times on existing bookings before validating this schedule.", 409, "TIMETABLE_EXISTING_INVALID");
  if (subjects.length !== subjectIds.length || teachers.length !== teacherIds.length || rooms.length !== roomIds.length) throw new SchoolAiError("A subject, active teacher or room is no longer available in this class and campus.", 409, "TIMETABLE_REFERENCE");
  const bySubject = new Map(subjects.map(item => [item.id, item])), byTeacher = new Map(teachers.map(item => [item.id, item])), byRoom = new Map(rooms.map(item => [item.id, item]));
  for (const slot of proposal.slots) {
    if (periods.length) {
      const period = periods.find(item => item.periodNumber === slot.periodNumber);
      if (!period || period.startTime !== slot.startTime || period.endTime !== slot.endTime) throw new SchoolAiError("The proposed period differs from the current campus period definitions. Refresh and review the times.", 409, "TIMETABLE_PERIOD_CHANGED");
    }
    if (slot.slotType !== "CLASS") continue;
    const assigned = cls.teachingMode === "SINGLE" ? cls.classTeacherId : bySubject.get(slot.subjectId!)?.teacherId;
    if (!["SINGLE", "SUBJECT"].includes(cls.teachingMode) || !assigned || assigned !== slot.teacherId) throw new SchoolAiError("Use the current class teacher or assigned subject teacher. Review staff assignments before scheduling a substitute.", 409, "TIMETABLE_ASSIGNMENT");
    const overlapping = existing.find(other => other.dayOfWeek === slot.dayOfWeek && (other.teacherId === slot.teacherId || other.roomId === slot.roomId) && (other.periodNumber === slot.periodNumber || other.startTime < slot.endTime && slot.startTime < other.endTime));
    if (overlapping) throw new SchoolAiError("A teacher or room is already reserved during this period or overlapping time.", 409, "TIMETABLE_CLASH");
  }
  const validation = await validateTimetableSlots({ campusId: record.campusId, timetableId: "new-school-ai-timetable", classId: cls.id, slots: proposal.slots, requireComplete: true, academicYear: proposal.academicYear, term: proposal.term }, db);
  if (!validation.canPublish) throw new SchoolAiError("Resolve the existing timetable conflicts before applying this proposal.", 409, "TIMETABLE_CLASH");
  const warnings: TimetableSetupPreview["warnings"] = teaching.flatMap(slot => {
    const room = byRoom.get(slot.roomId!)!;
    return room.capacity === 0 || room.capacity < classSize ? [{ code: room.capacity === 0 ? "ROOM_CAPACITY_UNKNOWN" as const : "ROOM_CAPACITY" as const, dayOfWeek: slot.dayOfWeek, periodNumber: slot.periodNumber, roomNumber: room.roomNumber, capacity: room.capacity, classSize }] : [];
  });
  const preview = { operation: proposal.operation, recordId: record.id, version: record.version, campusId: record.campusId, classId: cls.id, className: [cls.name, cls.section].filter(Boolean).join(" · "), academicYear: proposal.academicYear, term: proposal.term, slots: proposal.slots.map(slot => ({ ...slot, subjectName: slot.subjectId ? bySubject.get(slot.subjectId)!.name : null, teacherName: slot.teacherId ? byTeacher.get(slot.teacherId)!.fullName : null, roomNumber: slot.roomId ? byRoom.get(slot.roomId)!.roomNumber : null })), warnings };
  return { ...preview, previewHash: workspaceRequestHash({ preview, cls, cycle: cycle ? { ...cycle, updatedAt: cycle.updatedAt.toISOString() } : null, subjects, teachers, rooms, periods, classSize, existing, weekendDays, timezone: locale.timezone }) };
}

export async function applyTimetableSetup(user: AuthUser, preview: TimetableSetupPreview, db: TxClient) {
  const timetable = await db.timetable.create({ data: { schoolId: user.schoolId, campusId: preview.campusId, classId: preview.classId, academicYear: preview.academicYear, term: preview.term, status: "DRAFT", slots: { create: preview.slots.map(slot => ({ schoolId: user.schoolId, dayOfWeek: slot.dayOfWeek, periodNumber: slot.periodNumber, startTime: slot.startTime, endTime: slot.endTime, slotType: slot.slotType, subjectId: slot.subjectId, teacherId: slot.teacherId, roomId: slot.roomId, roomNumber: slot.roomNumber })) } }, select: { id: true } });
  return { timetableId: timetable.id, timetableStatus: "DRAFT" as const, slotCount: preview.slots.length, classId: preview.classId, academicYear: preview.academicYear, term: preview.term };
}
