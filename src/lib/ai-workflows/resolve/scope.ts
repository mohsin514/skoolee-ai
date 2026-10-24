import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { AuthUser } from "@/lib/auth";
import type { CapabilityContext } from "../registry/types";
import { WorkflowError } from "../errors";

/**
 * A teacher reaches only classes they lead or teach a subject in, and subjects they teach or that
 * belong to their own class (src/lib/school-ai/access.ts getAssignedWorkspaceSubjects). The check runs
 * at resolve and again at execute, on ids the server bound; nothing the model wrote is trusted for it.
 */
export function assignedClassWhere(user: AuthUser): Prisma.ClassWhereInput {
  return user.role === "TEACHER" ? { OR: [{ classTeacherId: user.userId }, { subjects: { some: { teacherId: user.userId } } }] } : {};
}

export function assignedSubjectWhere(user: AuthUser): Prisma.SubjectWhereInput {
  return user.role === "TEACHER" ? { OR: [{ teacherId: user.userId }, { class: { classTeacherId: user.userId } }] } : {};
}

export async function assignedClass(ctx: CapabilityContext, classId: string) {
  if (!ctx.campusId) throw new WorkflowError("SCOPE_DENIED");
  const found = await prisma.class.findFirst({ where: { id: classId, schoolId: ctx.user.schoolId, campusId: ctx.campusId, archivedAt: null, ...assignedClassWhere(ctx.user) }, select: { id: true, name: true, section: true, campusId: true, academicYear: true, classTeacherId: true } });
  if (!found) throw new WorkflowError("SCOPE_DENIED");
  return found;
}

export async function assignedSubject(ctx: CapabilityContext, subjectId: string) {
  if (!ctx.campusId) throw new WorkflowError("SCOPE_DENIED");
  const found = await prisma.subject.findFirst({ where: { id: subjectId, class: { schoolId: ctx.user.schoolId, campusId: ctx.campusId, archivedAt: null }, ...assignedSubjectWhere(ctx.user) }, select: { id: true, name: true, classId: true, teacherId: true, totalMarks: true, class: { select: { name: true, section: true } } } });
  if (!found) throw new WorkflowError("SCOPE_DENIED");
  return found;
}

export const classLabel = (row: { name: string; section: string | null }) => [row.name, row.section].filter(Boolean).join(" ");
