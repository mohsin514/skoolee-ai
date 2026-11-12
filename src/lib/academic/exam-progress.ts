import type { ExamMeta } from "@/lib/academic/exam-pipeline";

/**
 * SKAI-1815: marking progress for the exam board, counted on the server in a
 * fixed number of queries instead of one full GET /api/marks per exam.
 *
 * The numbers follow GET /api/marks exactly, because that is what the board
 * used to count from:
 * - students: the class's active roster (archivedAt null), today;
 * - subjects: the class's subjects, narrowed to the exam's subject, and for a
 *   TEACHER to the subjects they teach (all of them for the class teacher);
 * - enteredMarks: marks for a roster student in a visible subject (one per
 *   pair — marks are unique on exam, student and subject);
 * - markedSubjects: distinct subjects among the marks /api/marks would return.
 * An exam /api/marks would refuse (outside the caller's campus, or a teacher
 * with no visible subject) gets `null`: progress unavailable, never zero.
 */

export interface ProgressExam {
  id: string;
  campusId: string;
  classId: string;
  subjectId: string | null;
}

export interface ProgressUser {
  userId: string;
  role: string;
  schoolId: string;
  campusId?: string | null;
}

type Grouped = { examId: string; subjectId: string; _count: { _all: number } };

/** The slice of the Prisma client this needs, so tests can pass a fake. */
export interface ProgressDb {
  class: {
    findMany(args: unknown): Promise<{
      id: string;
      classTeacherId: string | null;
      subjects: { id: string; teacherId: string | null }[];
      _count: { students: number };
    }[]>;
  };
  mark: { groupBy(args: unknown): Promise<unknown> };
}

export async function examProgressFor(
  db: ProgressDb,
  user: ProgressUser,
  exams: ProgressExam[],
): Promise<Record<string, ExamMeta | null>> {
  const out: Record<string, ExamMeta | null> = {};
  const inScope = exams.filter((e) => {
    const ok = !user.campusId || e.campusId === user.campusId;
    if (!ok) out[e.id] = null;
    return ok;
  });
  if (inScope.length === 0) return out;

  const classIds = [...new Set(inScope.map((e) => e.classId))];
  // One OR branch per class: a mark counts only for a student still on that class's active roster.
  const byClass = new Map<string, { campusId: string; classId: string; ids: string[] }>();
  for (const e of inScope) {
    const key = `${e.campusId}:${e.classId}`;
    const g = byClass.get(key) ?? { campusId: e.campusId, classId: e.classId, ids: [] };
    g.ids.push(e.id);
    byClass.set(key, g);
  }

  const [classes, rosterMarks, allMarks] = await Promise.all([
    db.class.findMany({
      where: { id: { in: classIds }, schoolId: user.schoolId },
      select: {
        id: true,
        classTeacherId: true,
        subjects: { select: { id: true, teacherId: true } },
        _count: { select: { students: { where: { archivedAt: null } } } },
      },
    }),
    db.mark.groupBy({
      by: ["examId", "subjectId"],
      where: {
        schoolId: user.schoolId,
        OR: [...byClass.values()].map((g) => ({
          examId: { in: g.ids },
          campusId: g.campusId,
          student: { classId: g.classId, archivedAt: null },
        })),
      },
      _count: { _all: true },
    }) as Promise<Grouped[]>,
    db.mark.groupBy({
      by: ["examId", "subjectId"],
      where: {
        schoolId: user.schoolId,
        OR: [...byClass.values()].map((g) => ({ examId: { in: g.ids }, campusId: g.campusId })),
      },
      _count: { _all: true },
    }) as Promise<Grouped[]>,
  ]);

  const classMap = new Map(classes.map((c) => [c.id, c]));
  const entered = new Map<string, Map<string, number>>();
  for (const row of rosterMarks) {
    const m = entered.get(row.examId) ?? new Map<string, number>();
    m.set(row.subjectId, row._count._all);
    entered.set(row.examId, m);
  }
  const marked = new Map<string, string[]>();
  for (const row of allMarks) marked.set(row.examId, [...(marked.get(row.examId) ?? []), row.subjectId]);

  const isTeacher = user.role === "TEACHER";
  for (const e of inScope) {
    const cls = classMap.get(e.classId);
    if (!cls) { out[e.id] = null; continue; }
    const examSubjects = e.subjectId ? cls.subjects.filter((s) => s.id === e.subjectId) : cls.subjects;
    const isClassTeacher = cls.classTeacherId === user.userId;
    const visible = isTeacher
      ? examSubjects.filter((s) => s.teacherId === user.userId || isClassTeacher)
      : examSubjects;
    if (isTeacher && !isClassTeacher && visible.length === 0) { out[e.id] = null; continue; }
    const visibleIds = new Set(visible.map((s) => s.id));
    const counts = entered.get(e.id);
    let enteredMarks = 0;
    for (const id of visibleIds) enteredMarks += counts?.get(id) ?? 0;
    const markedIds = (marked.get(e.id) ?? []).filter((id) => !isTeacher || visibleIds.has(id));
    out[e.id] = {
      subjectsCount: visible.length,
      studentsCount: cls._count.students,
      markedSubjects: new Set(markedIds).size,
      enteredMarks,
      expectedMarks: cls._count.students * visible.length,
    };
  }
  return out;
}
