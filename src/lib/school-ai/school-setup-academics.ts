import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/scope";
import { inspectHolidayRange, inspectWeekendChange } from "@/lib/academic/calendar-write";
import { updateClassWithTeacherAssignmentTx, updateSubjectWithTeacherAssignmentTx } from "@/lib/api/teacher-assignments";
import { validateTimetableSlots } from "@/lib/timetable/validate";
import { assertSubstituteLessonsUnchanged } from "./school-operations-bookings";
import { assertWorkspacePermission, loadWorkspacePermissionSnapshot, SchoolAiError } from "./access";
import type { SchoolSetupAction, SchoolSetupProposal, SchoolSetupRowPreview } from "./school-setup";
export type AcademicSetupProposal = Extract<SchoolSetupProposal, { action: "SUBJECTS" | "TEACHER_ALLOCATIONS" | "HOLIDAYS" | "WEEKENDS" }>;
const fail = (code: string) => { throw new SchoolAiError("Review the academic setup, existing assignments and scheduled bookings.", 409, code); };
const normalized = (value: string) => value.normalize("NFKC").trim().toLowerCase();
const dayFields = ["mondayClosed", "tuesdayClosed", "wednesdayClosed", "thursdayClosed", "fridayClosed", "saturdayClosed", "sundayClosed"] as const;
export const setupWeekendDays = (row: Extract<AcademicSetupProposal, { action: "WEEKENDS" }>["rows"][number]) => dayFields.flatMap((key, index) => row[key] ? [index + 1] : []);
export function isAcademicSetupAction(action: SchoolSetupAction): action is AcademicSetupProposal["action"] { return ["SUBJECTS", "TEACHER_ALLOCATIONS", "HOLIDAYS", "WEEKENDS"].includes(action); }
export async function assertAcademicSetupAccess(user: AuthUser, proposal: { action?: string; rows?: unknown[] }, db: TxClient) {
  const grants = await loadWorkspacePermissionSnapshot(user, db);
  if (proposal.action === "SUBJECTS" || proposal.action === "TEACHER_ALLOCATIONS") { await assertWorkspacePermission(user, "exams", "view", grants); await assertWorkspacePermission(user, "exams", proposal.action === "SUBJECTS" ? "add" : "edit", grants); }
  if (proposal.action === "TEACHER_ALLOCATIONS" || proposal.action === "WEEKENDS" || proposal.action === "HOLIDAYS") await assertWorkspacePermission(user, "timetable", "edit", grants);
  if (proposal.action === "HOLIDAYS" && proposal.rows?.some(row => row && typeof row === "object" && "calendarAction" in row && row.calendarAction === "DELETE")) await assertWorkspacePermission(user, "timetable", "delete", grants);
}
export async function previewAcademicSetup(user: AuthUser, campusId: string, proposal: AcademicSetupProposal, db: TxClient) {
  await assertAcademicSetupAccess(user, proposal, db); const scope = { schoolId: user.schoolId, campusId }, rows: SchoolSetupRowPreview[] = [];
  if (proposal.action === "WEEKENDS") {
    let facts; try { facts = await inspectWeekendChange(db, scope, setupWeekendDays(proposal.rows[0])); } catch (error) { if (error instanceof ApiError) return fail("SETUP_CALENDAR_CONFLICT"); throw error; }
    const desired = setupWeekendDays(proposal.rows[0]), same = JSON.stringify(desired) === JSON.stringify(facts.currentDays); rows.push({ index: 0, label: "WEEKENDS", disposition: same ? "KEEP" : "UPDATE", existingId: campusId, changes: dayFields.map((field, index) => ({ field, before: facts.currentDays.includes(index + 1) ? "CLOSED" : "OPEN", after: desired.includes(index + 1) ? "CLOSED" : "OPEN" })) }); return { rows, facts };
  }
  const cycles = await db.academicCycle.findMany({ where: { ...scope, status: "ACTIVE" }, orderBy: { academicYear: "asc" } });
  if (proposal.action === "HOLIDAYS") {
    const holidays = await db.holiday.findMany({ where: scope, orderBy: { id: "asc" }, take: 1001 }); if (holidays.length > 1000) return fail("SETUP_SCOPE_LIMIT"); const inspections = [];
    const proposedNames = proposal.rows.flatMap(row => row.calendarAction === "DELETE" ? [] : [normalized(row.holidayName)]);
    if (new Set(proposedNames).size !== proposedNames.length) return fail("SETUP_CALENDAR_IDENTITY");
    for (const [index, row] of proposal.rows.entries()) {
      const cycle = cycles.find(cycle => cycle.academicYear === row.academicYear), selected = row.calendarAction === "CREATE" ? undefined : holidays.find(holiday => holiday.id === row.holidayId);
      if (!cycle?.startDate || !cycle.endDate || row.calendarAction !== "CREATE" && !selected) return fail("SETUP_ACADEMIC_SCOPE");
      const start = row.calendarAction === "DELETE" ? selected!.fromDate : new Date(row.fromDate + "T00:00:00Z"), end = row.calendarAction === "DELETE" ? selected!.toDate : new Date(row.toDate + "T00:00:00Z");
      if (start < cycle.startDate || end > cycle.endDate || selected && (selected.fromDate < cycle.startDate || selected.toDate > cycle.endDate)) return fail("SETUP_ACADEMIC_SCOPE");
      if (row.calendarAction === "DELETE") { rows.push({ index, label: selected!.name, disposition: "DELETE", existingId: selected!.id, displayValues: { holidayId: selected!.name }, changes: [{ field: "holidayName", before: selected!.name, after: "—" }, { field: "fromDate", before: selected!.fromDate.toISOString().slice(0,10), after: "—" }, { field: "toDate", before: selected!.toDate.toISOString().slice(0,10), after: "—" }] }); continue; }
      const matches = holidays.filter(holiday => normalized(holiday.name) === normalized(row.holidayName)), exact = matches.find(holiday => holiday.fromDate.getTime() === start.getTime() && holiday.toDate.getTime() === end.getTime());
      if (matches.length > 1 || row.calendarAction === "CREATE" && matches.length && !exact || row.calendarAction === "UPDATE" && matches.some(holiday => holiday.id !== selected!.id)) return fail("SETUP_CALENDAR_IDENTITY");
      if (!(row.calendarAction === "CREATE" && exact)) { try { inspections.push(await inspectHolidayRange(db, scope, start, end, selected?.id)); } catch (error) { if (error instanceof ApiError) return fail("SETUP_CALENDAR_CONFLICT"); throw error; } }
      const same = row.calendarAction === "CREATE" ? Boolean(exact) : selected!.name === row.holidayName && selected!.fromDate.getTime() === start.getTime() && selected!.toDate.getTime() === end.getTime();
      rows.push({ index, label: row.calendarAction === "CREATE" && exact ? exact.name : row.holidayName, disposition: same ? "KEEP" : row.calendarAction === "CREATE" ? "CREATE" : "UPDATE", ...(selected || exact ? { existingId: (selected || exact)!.id } : {}), displayValues: selected ? { holidayId: selected.name } : exact ? { holidayName: exact.name } : {}, changes: [{ field: "holidayName", before: selected?.name ?? exact?.name ?? "—", after: row.calendarAction === "CREATE" && exact ? exact.name : row.holidayName }, { field: "fromDate", before: (selected ?? exact)?.fromDate.toISOString().slice(0,10) ?? "—", after: row.fromDate }, { field: "toDate", before: (selected ?? exact)?.toDate.toISOString().slice(0,10) ?? "—", after: row.toDate }] });
    }
    return { rows, facts: { cycles, holidays, inspections } };
  }
  const [classes, subjects, teachers, timetables] = await Promise.all([
    db.class.findMany({ where: scope, include: { _count: { select: { students: true } } }, orderBy: { id: "asc" }, take: 1001 }),
    db.subject.findMany({ where: scope, orderBy: { id: "asc" }, take: 5001 }),
    db.user.findMany({ where: { ...scope, role: { in: ["TEACHER", "PRINCIPAL"] } }, select: { id: true, fullName: true, role: true, isActive: true, accessVersion: true }, orderBy: { id: "asc" }, take: 1001 }),
    db.timetable.findMany({ where: scope, include: { slots: { orderBy: { id: "asc" } } }, orderBy: { id: "asc" }, take: 501 }),
  ]);
  if (classes.length > 1000 || subjects.length > 5000 || teachers.length > 1000 || timetables.length > 500) return fail("SETUP_SCOPE_LIMIT");
  const activeClass = (classId: string) => { const cls = classes.find(row => row.id === classId); if (!cls || cls.archivedAt || cls.status !== "ACTIVE" || !cycles.some(cycle => cycle.academicYear === cls.academicYear)) return fail("SETUP_ACADEMIC_SCOPE"); return cls; };
  const label = (id: string | null) => id ? teachers.find(teacher => teacher.id === id)?.fullName ?? "UNAVAILABLE" : "UNASSIGNED";
  const classLabel = (cls: { name: string; section: string | null; academicYear: number }) => `${cls.name} ${cls.section || ""} · ${cls.academicYear}`;
  const changedTeachers = new Map<string, string | null>();
  for (const [index, row] of proposal.rows.entries()) {
    if ("subjectName" in row) {
      const cls = activeClass(row.classId), matches = subjects.filter(subject => subject.classId === cls.id && normalized(subject.name) === normalized(row.subjectName)), existing = matches[0], inherited = cls.teachingMode === "SINGLE" ? cls.classTeacherId : null;
      if (matches.length > 1 || existing && existing.totalMarks !== row.totalMarks) return fail("SETUP_SUBJECT_CONFLICT");
      if (!existing && inherited && !teachers.some(teacher => teacher.id === inherited && teacher.isActive)) return fail("SETUP_TEACHER_UNAVAILABLE");
      rows.push({ index, label: `${row.subjectName} · ${classLabel(cls)}`, disposition: existing ? "KEEP" : "CREATE", ...(existing ? { existingId: existing.id } : {}), displayValues: { classId: classLabel(cls) }, changes: [{ field: "teacherId", before: existing ? label(existing.teacherId) : "—", after: label(existing ? existing.teacherId : inherited) }, { field: "totalMarks", before: existing ? String(existing.totalMarks) : "—", after: String(row.totalMarks) }] }); continue;
    }
    const subject = row.allocationType === "SUBJECT" ? subjects.find(subject => subject.id === row.subjectId) : null;
    if (row.allocationType === "SUBJECT" && !subject) return fail("SETUP_ACADEMIC_SCOPE");
    const cls = activeClass(row.allocationType === "CLASS" ? row.classId : subject!.classId), current = row.allocationType === "CLASS" ? cls.classTeacherId : subject!.teacherId;
    if (current !== row.expectedTeacherId) return fail("SETUP_TEACHER_CHANGED");
    if (row.teacherId && !teachers.some(teacher => teacher.id === row.teacherId && teacher.isActive && teacher.role === "TEACHER")) return fail("SETUP_TEACHER_UNAVAILABLE");
    const affected = current === row.teacherId ? [] : row.allocationType === "SUBJECT" ? [subject!] : cls.teachingMode === "SINGLE" ? subjects.filter(subject => subject.classId === cls.id) : [];
    for (const affectedSubject of affected) { if (changedTeachers.has(affectedSubject.id)) return fail("SETUP_ALLOCATION_OVERLAP"); changedTeachers.set(affectedSubject.id, row.teacherId); }
    const affectedSlots = timetables.flatMap(board => board.slots).filter(slot => slot.subjectId && affected.some(subject => subject.id === slot.subjectId));
    rows.push({ index, label: `${row.allocationType === "SUBJECT" ? subject!.name + " · " : ""}${classLabel(cls)}`, disposition: current === row.teacherId ? "KEEP" : "UPDATE", existingId: row.allocationType === "CLASS" ? cls.id : subject!.id, displayValues: { classId: classLabel(cls), subjectId: `${subject?.name ?? ""} · ${classLabel(cls)}`, expectedTeacherId: label(current), teacherId: label(row.teacherId) }, changes: [{ field: "teacherId", before: label(current), after: label(row.teacherId) }, ...affected.filter(affectedSubject => row.allocationType === "CLASS").map(affectedSubject => ({ field: "teacherId", label: affectedSubject.name, before: label(affectedSubject.teacherId), after: label(row.teacherId) }))], synchronizedSlots: affectedSlots.length });
  }
  if (changedTeachers.size) for (const board of timetables.filter(board => board.slots.some(slot => slot.subjectId && changedTeachers.has(slot.subjectId)))) {
    const slots = board.slots.map(slot => slot.subjectId && changedTeachers.has(slot.subjectId) ? { ...slot, teacherId: changedTeachers.get(slot.subjectId)! } : slot);
    try { await assertSubstituteLessonsUnchanged(db, scope.schoolId, campusId, board.slots, slots); const validation = await validateTimetableSlots({ campusId, timetableId: board.id, classId: board.classId, academicYear: board.academicYear, term: board.term, slots, requireComplete: board.status === "PUBLISHED" }, db); if (!validation.canPublish) return fail("SETUP_SCHEDULE_CONFLICT"); } catch (error) { if (error instanceof ApiError || error instanceof SchoolAiError && error.status === 409) return fail("SETUP_SCHEDULE_CONFLICT"); throw error; }
  }
  return { rows, facts: { cycles, classes, subjects, teachers, timetables } };
}
export async function applyAcademicSetupRow(user: AuthUser, campusId: string, proposal: AcademicSetupProposal, item: SchoolSetupRowPreview, db: TxClient) {
  const scope = { schoolId: user.schoolId, campusId };
  if (proposal.action === "SUBJECTS") { const row = proposal.rows[item.index], cls = await db.class.findFirstOrThrow({ where: { id: row.classId, ...scope } }); return (await db.subject.create({ data: { ...scope, classId: cls.id, name: row.subjectName, totalMarks: row.totalMarks, teacherId: cls.teachingMode === "SINGLE" ? cls.classTeacherId : null } })).id; }
  if (proposal.action === "TEACHER_ALLOCATIONS") { const row = proposal.rows[item.index]; if (row.allocationType === "SUBJECT") return (await updateSubjectWithTeacherAssignmentTx(db, user, { id: row.subjectId, teacherId: row.teacherId }, campusId)).subject.id; return (await updateClassWithTeacherAssignmentTx(db, user, { id: row.classId, classTeacherId: row.teacherId }, campusId)).cls.id; }
  if (proposal.action === "WEEKENDS") { await db.weekend.deleteMany({ where: scope }); await db.weekend.createMany({ data: setupWeekendDays(proposal.rows[0]).map(dayOfWeek => ({ ...scope, dayOfWeek })) }); return campusId; }
  const row = proposal.rows[item.index];
  if (row.calendarAction === "DELETE") { await db.holiday.delete({ where: { id: row.holidayId } }); return row.holidayId; }
  const data = { name: row.holidayName, fromDate: new Date(row.fromDate + "T00:00:00Z"), toDate: new Date(row.toDate + "T00:00:00Z") };
  return row.calendarAction === "CREATE" ? (await db.holiday.create({ data: { ...scope, ...data } })).id : (await db.holiday.update({ where: { id: row.holidayId }, data })).id;
}
