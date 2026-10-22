import { prisma } from "@/lib/db/prisma";
import type { AuthUser } from "@/lib/auth";
import { ApiError, canLeadAcademics, canManageOperations } from "@/lib/api/scope";

/**
 * SKO-461: teaching evidence, not a teacher ranking.
 *
 * Every measure is bounded by the selected academic period (the campus
 * academic cycle, else the calendar year, never past today), counts only
 * published results, and carries its source, coverage and freshness. Absent
 * evidence is "unavailable" with a reason — never zero. Outcomes of a class
 * shared by several teachers are shown as shared context, not attributed to
 * one person. Leaders see their campus; a teacher sees only themself.
 */

export type Measure = {
  key: "registers" | "marksEntry" | "subjectResults" | "classOutcomes" | "staffAttendance";
  value: number | null; unit: "%"; source: string; coverage: string | null; freshness: string | null;
  unavailable: string | null; shared: boolean; caution: string | null;
};
const SMALL_SAMPLE = 20;
const ymd = (date: Date | null | undefined) => (date ? date.toISOString().slice(0, 10) : null);
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);
const label = (c: { name: string; section: string | null }) => [c.name, c.section].filter(Boolean).join(" ");

export function assertEvidenceAccess(user: AuthUser, teacherId?: string | null) {
  if (canManageOperations(user)) return teacherId ?? null;
  if (user.role === "TEACHER") {
    if (teacherId && teacherId !== user.userId) throw new ApiError("Teachers can see only their own teaching evidence", 403);
    return user.userId;
  }
  throw new ApiError("Teaching evidence is limited to school leaders and the teacher concerned", 403);
}

export async function evidencePeriod(campusId: string, academicYear: number) {
  const cycle = await prisma.academicCycle.findFirst({ where: { campusId, academicYear }, select: { startDate: true, endDate: true, label: true } });
  const start = cycle?.startDate ?? new Date(`${academicYear}-01-01T00:00:00.000Z`);
  const end = cycle?.endDate ?? new Date(`${academicYear}-12-31T00:00:00.000Z`);
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
  return { start, end: end < today ? end : today, source: cycle?.startDate && cycle?.endDate ? "ACADEMIC_CYCLE" as const : "CALENDAR_YEAR" as const, label: cycle?.label ?? String(academicYear) };
}

export async function teachingEvidence(user: AuthUser, campusId: string, academicYear: number, teacherFilter?: string | null) {
  const only = assertEvidenceAccess(user, teacherFilter);
  const period = await evidencePeriod(campusId, academicYear);
  const inPeriod = { gte: period.start, lte: period.end };
  const teachers = await prisma.user.findMany({
    where: { campusId, role: "TEACHER", isActive: true, ...(only ? { id: only } : {}) },
    select: {
      id: true, fullName: true, email: true,
      taughtSubjects: { where: { class: { academicYear, campusId } }, select: { id: true, name: true, totalMarks: true, classId: true, class: { select: { name: true, section: true } } } },
      ledClasses: { where: { academicYear, campusId }, select: { id: true, name: true, section: true } },
    },
    orderBy: { fullName: "asc" },
  });
  const subjectIds = teachers.flatMap(t => t.taughtSubjects.map(s => s.id));
  const ledIds = teachers.flatMap(t => t.ledClasses.map(c => c.id));
  const classIds = [...new Set([...teachers.flatMap(t => t.taughtSubjects.map(s => s.classId)), ...ledIds])];

  const [rosters, exams, marks, registerDays, campusDays, reports, staffAtt, sharing, notes] = await Promise.all([
    prisma.student.groupBy({ by: ["classId"], where: { classId: { in: classIds }, status: "active", archivedAt: null }, _count: { _all: true } }),
    prisma.exam.findMany({ where: { campusId, classId: { in: classIds }, academicYear, status: { not: "DRAFT" } }, select: { id: true, classId: true, subjectId: true, status: true, publishedAt: true } }),
    prisma.mark.findMany({ where: { subjectId: { in: subjectIds }, exam: { campusId, academicYear, status: { not: "DRAFT" } } }, select: { subjectId: true, examId: true, marksObtained: true, isAbsent: true, isExempt: true, exam: { select: { status: true, publishedAt: true } } } }),
    prisma.attendance.groupBy({ by: ["classId", "date"], where: { campusId, classId: { in: ledIds }, date: inPeriod }, _count: { _all: true } }),
    prisma.attendance.groupBy({ by: ["date"], where: { campusId, date: inPeriod }, _count: { _all: true } }),
    prisma.reportCard.findMany({ where: { campusId, exam: { academicYear, classId: { in: ledIds }, status: "PUBLISHED" } }, select: { percentage: true, generatedAt: true, exam: { select: { classId: true } } } }),
    prisma.teacherAttendance.groupBy({ by: ["userId", "status"], where: { campusId, userId: { in: teachers.map(t => t.id) }, date: inPeriod }, _count: { _all: true }, _max: { date: true } }),
    prisma.subject.groupBy({ by: ["classId"], where: { classId: { in: ledIds }, teacherId: { not: null } }, _count: { teacherId: true } }),
    prisma.teacherSupportNote.groupBy({ by: ["teacherId"], where: { campusId, academicYear, teacherId: { in: teachers.map(t => t.id) } }, _count: { _all: true } }),
  ]);
  const roster = new Map(rosters.map(r => [r.classId, r._count._all]));
  const schoolDays = campusDays.length;
  const noteCount = new Map(notes.map(n => [n.teacherId, n._count._all]));

  const rows = teachers.map(teacher => {
    const measures: Measure[] = [];
    // 1. Registers kept for the classes this teacher leads.
    if (!teacher.ledClasses.length) measures.push({ key: "registers", value: null, unit: "%", source: "Daily attendance registers of classes you lead", coverage: null, freshness: null, unavailable: "Not a class teacher this year", shared: false, caution: null });
    else {
      const marked = registerDays.filter(row => teacher.ledClasses.some(c => c.id === row.classId));
      const expected = teacher.ledClasses.length * schoolDays;
      const latest = marked.reduce<Date | null>((max, row) => (!max || row.date > max ? row.date : max), null);
      measures.push({ key: "registers", value: expected ? pct(marked.length, expected) : null, unit: "%", source: "Daily attendance registers of classes you lead", coverage: expected ? `${marked.length} of ${expected} class-days` : null, freshness: ymd(latest), unavailable: expected ? null : "No school days recorded in this period", shared: false, caution: null });
    }
    // 2. Marks entered for the subjects this teacher teaches.
    let expectedMarks = 0;
    for (const subject of teacher.taughtSubjects) {
      const subjectExams = exams.filter(e => e.classId === subject.classId && (!e.subjectId || e.subjectId === subject.id));
      expectedMarks += subjectExams.length * (roster.get(subject.classId) ?? 0);
    }
    const ownMarks = marks.filter(m => teacher.taughtSubjects.some(s => s.id === m.subjectId));
    measures.push(!teacher.taughtSubjects.length
      ? { key: "marksEntry", value: null, unit: "%", source: "Marks entered for exams in your subjects", coverage: null, freshness: null, unavailable: "No subjects assigned this year", shared: false, caution: null }
      : { key: "marksEntry", value: expectedMarks ? Math.min(100, pct(ownMarks.length, expectedMarks)!) : null, unit: "%", source: "Marks entered for exams in your subjects", coverage: expectedMarks ? `${ownMarks.length} of ${expectedMarks} marks` : null, freshness: null, unavailable: expectedMarks ? null : "No exams for your subjects in this period", shared: false, caution: null });
    // 3. Published results in this teacher's own subjects (absent/exempt excluded).
    const published = ownMarks.filter(m => m.exam.status === "PUBLISHED" && !m.isAbsent && !m.isExempt);
    const possible = published.reduce((sum, m) => sum + (teacher.taughtSubjects.find(s => s.id === m.subjectId)?.totalMarks ?? 0), 0);
    const latestPublished = published.reduce<Date | null>((max, m) => (m.exam.publishedAt && (!max || m.exam.publishedAt > max) ? m.exam.publishedAt : max), null);
    measures.push({ key: "subjectResults", value: published.length && possible ? pct(published.reduce((sum, m) => sum + m.marksObtained, 0), possible) : null, unit: "%", source: "Published exam marks in your subjects only",
      coverage: published.length ? `${published.length} marks from ${new Set(published.map(m => m.examId)).size} published exam(s)` : null, freshness: ymd(latestPublished),
      unavailable: published.length ? null : "No published results in your subjects for this period", shared: false,
      caution: published.length && published.length < SMALL_SAMPLE ? "Small sample: fewer than 20 marks. Read with care." : published.length ? "Results reflect pupils and circumstances, not only teaching." : null });
    // 4. Class outcomes for led classes — shared with every subject teacher of the class.
    const classReports = reports.filter(r => teacher.ledClasses.some(c => c.id === r.exam.classId));
    const sharedBy = teacher.ledClasses.reduce((max, c) => Math.max(max, sharing.find(s => s.classId === c.id)?._count.teacherId ?? 0), 0);
    measures.push(!teacher.ledClasses.length
      ? { key: "classOutcomes", value: null, unit: "%", source: "Published report cards of classes you lead", coverage: null, freshness: null, unavailable: "Not a class teacher this year", shared: true, caution: null }
      : { key: "classOutcomes", value: classReports.length ? Math.round((classReports.reduce((sum, r) => sum + r.percentage, 0) / classReports.length) * 10) / 10 : null, unit: "%", source: "Published report cards of classes you lead",
          coverage: classReports.length ? `${classReports.length} report card(s)` : null, freshness: ymd(classReports.reduce<Date | null>((max, r) => (!max || r.generatedAt > max ? r.generatedAt : max), null)),
          unavailable: classReports.length ? null : "No published report cards for your classes in this period", shared: true,
          caution: classReports.length ? `Shared outcome: ${Math.max(1, sharedBy)} teacher(s) teach this class. Not attributable to one person.` : null });
    // 5. The teacher's own recorded attendance.
    const own = staffAtt.filter(a => a.userId === teacher.id);
    const total = own.reduce((sum, a) => sum + a._count._all, 0), present = own.filter(a => a.status === "PRESENT").reduce((sum, a) => sum + a._count._all, 0);
    measures.push({ key: "staffAttendance", value: total ? pct(present, total) : null, unit: "%", source: "Staff attendance records", coverage: total ? `${present} of ${total} recorded days present` : null,
      freshness: ymd(own.reduce<Date | null>((max, a) => (a._max.date && (!max || a._max.date > max) ? a._max.date : max), null)), unavailable: total ? null : "No staff attendance recorded in this period", shared: false, caution: null });
    return {
      teacherId: teacher.id, fullName: teacher.fullName,
      subjects: teacher.taughtSubjects.map(s => `${s.name} · ${label(s.class)}`), ledClasses: teacher.ledClasses.map(label),
      measures, notes: noteCount.get(teacher.id) ?? 0,
    };
  });
  return {
    period: { start: ymd(period.start), end: ymd(period.end), source: period.source, label: period.label, academicYear },
    policy: [
      "Only records dated inside the selected period are counted; later years never change this view.",
      "Only published exam results count; drafts and unpublished report cards are excluded.",
      "Missing evidence is shown as unavailable, never as zero.",
      "Class outcomes are shared by every teacher of the class and are not attributed to one person.",
      "Teachers are listed by name. There is no ranking or overall score.",
    ],
    teachers: rows, self: Boolean(only && !canManageOperations(user)),
  };
}

export async function listNotes(user: AuthUser, campusId: string, teacherId: string, academicYear: number) {
  assertEvidenceAccess(user, teacherId);
  const rows = await prisma.teacherSupportNote.findMany({ where: { campusId, teacherId, academicYear }, orderBy: { createdAt: "asc" } });
  const authors = new Map((await prisma.user.findMany({ where: { id: { in: rows.map(r => r.authorId) } }, select: { id: true, fullName: true } })).map(a => [a.id, a.fullName]));
  return rows.map(r => ({ id: r.id, kind: r.kind, body: r.body, author: authors.get(r.authorId) ?? "", createdAt: r.createdAt }));
}

export async function addNote(user: AuthUser, campusId: string, teacherId: string, academicYear: number, body: string) {
  assertEvidenceAccess(user, teacherId);
  // G35d: support notes are the academic lead's act (the principal, or a campus operator while the campus has
  // no principal); the teacher concerned may still respond on their own record. Reading stays with academics.
  if (user.userId !== teacherId && !(await canLeadAcademics(user, campusId))) throw new ApiError("Support notes are written by your principal.", 403);
  const text = body.trim();
  if (text.length < 10 || text.length > 2000) throw new ApiError("Write between 10 and 2000 characters", 400);
  const teacher = await prisma.user.findFirst({ where: { id: teacherId, campusId, role: "TEACHER" }, select: { id: true } });
  if (!teacher) throw new ApiError("Teacher not found in this campus", 404);
  // A leader records a reviewed support action; the teacher records a response. Neither is an employment decision.
  const kind = user.userId === teacherId ? "TEACHER_RESPONSE" : "SUPPORT_ACTION";
  return prisma.$transaction(async tx => {
    const note = await tx.teacherSupportNote.create({ data: { schoolId: user.schoolId, campusId, teacherId, authorId: user.userId, academicYear, kind, body: text } });
    await tx.auditLog.create({ data: { schoolId: user.schoolId, userId: user.userId, tableName: "teacher_support_notes", recordId: note.id, newValue: { teacherId, academicYear, kind } } });
    return { id: note.id, kind };
  });
}
