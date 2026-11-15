import { prisma } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/scope";

type ScopeClass = { classTeacherId: string | null; subjects: { id: string; teacherId: string | null }[] };

/**
 * SKAI-2019: the same allocation rule as /api/marks. The class teacher sees every subject (null);
 * a subject teacher sees only their own subjects; anyone else in the class gets no scope (undefined).
 */
export function teacherSubjectScope(cls: ScopeClass, userId: string): string[] | null | undefined {
  if (cls.classTeacherId === userId) return null;
  const own = cls.subjects.filter((s) => s.teacherId === userId).map((s) => s.id);
  return own.length ? own : undefined;
}

/**
 * Subject ids a weighted-grade read is limited to: null means every subject (non-teachers and class teachers).
 * Throws 403 for a teacher with no allocation in the class. The class must already be checked against the campus.
 */
export async function weightedGradeSubjectScope(
  user: { role: string; userId: string },
  classId: string,
  campusId: string,
): Promise<string[] | null> {
  if (user.role !== "TEACHER") return null;
  const cls = await prisma.class.findFirst({
    where: { id: classId, campusId },
    select: { classTeacherId: true, subjects: { select: { id: true, teacherId: true } } },
  });
  const scope = cls ? teacherSubjectScope(cls, user.userId) : undefined;
  if (scope === undefined) throw new ApiError("This class is not assigned to you", 403);
  return scope;
}
