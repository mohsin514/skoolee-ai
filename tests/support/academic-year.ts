import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * SKAI-1924: since SKAI-1887 a class brings its campus year as a DRAFT academic cycle, so a fixture that created
 * the class first can no longer `create` that year. This sets the campus year to exactly what the test needs,
 * whether or not a class already brought it in.
 */
export function putAcademicYear(
  db: Pick<PrismaClient, "academicCycle">,
  data: Prisma.AcademicCycleUncheckedCreateInput,
) {
  const { campusId, academicYear } = data;
  return db.academicCycle.upsert({ where: { campusId_academicYear: { campusId, academicYear } }, update: data, create: data });
}
