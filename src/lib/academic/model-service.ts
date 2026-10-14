import { ApiError } from "@/lib/api/scope";
import { prisma, type TxClient } from "@/lib/db/prisma";
import type { AcademicModelConfiguration } from "@/lib/academic/model-config";

/** Resolve the version whose published term label the exam is using. */
export async function resolveAcademicModelVersionForTerm(input: {
  campusId: string;
  classId: string;
  academicYear: number;
  term: string;
}, db: TxClient = prisma): Promise<string | null> {
  const versions = await db.academicModelVersion.findMany({
    where: { campusId: input.campusId, academicYear: input.academicYear, status: "ACTIVE" },
    orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }],
    select: { id: true, effectiveFrom: true, effectiveTo: true, configuration: true },
  });
  const applicable = versions.filter((version) => {
    const config = version.configuration as unknown as AcademicModelConfiguration;
    return config.classIds?.includes(input.classId);
  });
  const termKey = input.term.trim().toLocaleLowerCase();
  const matches = applicable.filter((version) => {
    const config = version.configuration as unknown as AcademicModelConfiguration;
    return config.terms?.some((period) => {
      const periodStart = Date.parse(`${period.startDate}T00:00:00.000Z`);
      const periodEnd = Date.parse(`${period.endDate}T00:00:00.000Z`);
      return period.label.trim().toLocaleLowerCase() === termKey
        && Number.isFinite(periodStart)
        && Number.isFinite(periodEnd)
        && version.effectiveFrom.getTime() <= periodStart
        && (!version.effectiveTo || version.effectiveTo.getTime() >= periodEnd);
    });
  });
  if (matches.length > 1) throw new ApiError(`More than one academic model covers ${input.term}. Resolve the overlapping effective dates before creating this exam.`, 409);
  if (matches.length === 1) return matches[0].id;
  if (applicable.length) throw new ApiError(`“${input.term}” is not a reporting period in the active academic model. Choose a configured period or update the model.`, 409);
  return null;
}
