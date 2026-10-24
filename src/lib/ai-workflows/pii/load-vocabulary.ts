import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { buildVocabulary, type PeopleVocabulary } from "./vocabulary";

const LIMIT = 5000;

/** Students, guardians and staff of the actor's school (one campus when the job is campus-scoped). */
export async function loadPeopleVocabulary(user: AuthUser, campusId: string | null): Promise<PeopleVocabulary> {
  const scope = { schoolId: user.schoolId, ...(campusId ? { campusId } : {}) };
  const [students, guardians, staff] = await Promise.all([
    prisma.student.findMany({ where: scope, select: { fullName: true, nameUr: true, guardianName: true, guardianNameUr: true }, take: LIMIT }),
    prisma.guardianRelationship.findMany({ where: scope, select: { fullName: true }, take: LIMIT }),
    prisma.user.findMany({ where: { schoolId: user.schoolId }, select: { fullName: true }, take: LIMIT }),
  ]);
  return buildVocabulary([
    ...students.flatMap(row => [row.fullName, row.nameUr, row.guardianName, row.guardianNameUr]),
    ...guardians.map(row => row.fullName),
    ...staff.map(row => row.fullName),
  ]);
}
