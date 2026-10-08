import { prisma } from "@/lib/db/prisma";
import { localePatchSchema, resolvePackage, type Language } from "./package";

export async function getLocalePackage(schoolId: string, campusId: string | null = null, at = new Date(), personal?: Language | null) {
  const school = await prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { timezone: true } });
  const policies = await prisma.localePolicy.findMany({ where: { schoolId, effectiveAt: { lte: at }, status: "ACTIVE", OR: [{ campusId: null }, ...(campusId ? [{ campusId }] : [])] }, orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }] });
  const schoolPolicy = policies.find((p) => p.campusId === null);
  const campusPolicy = campusId ? policies.find((p) => p.campusId === campusId) : null;
  return resolvePackage({ timezone: school.timezone, ...localePatchSchema.parse(schoolPolicy?.settings || {}) }, localePatchSchema.parse(campusPolicy?.settings || {}), personal);
}
