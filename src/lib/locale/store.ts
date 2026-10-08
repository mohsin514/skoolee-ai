import { prisma, type TxClient } from "@/lib/db/prisma";
import { localePatchSchema, resolvePackage, type Language } from "./package";

/** Load once for calendars that resolve hundreds of date-only cells. */
export async function loadLocaleTimeline(schoolId: string, campusId: string | null = null, db: Pick<TxClient, "school" | "localePolicy" | "weekend"> = prisma) {
  const [school, policies, legacyWeekends] = await Promise.all([
    db.school.findUniqueOrThrow({ where: { id: schoolId }, select: { timezone: true } }),
    db.localePolicy.findMany({ where: { schoolId, status: "ACTIVE", OR: [{ campusId: null }, ...(campusId ? [{ campusId }] : [])] }, orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }] }),
    campusId ? db.weekend.findMany({ where: { schoolId, campusId }, select: { dayOfWeek: true } }) : Promise.resolve([]),
  ]);
  return (at = new Date(), personal?: Language | null) => {
    const active = policies.filter((p) => p.effectiveAt <= at);
    const schoolPolicy = active.find((p) => p.campusId === null);
    const campusPolicy = campusId ? active.find((p) => p.campusId === campusId) : null;
    return resolvePackage({ timezone: school.timezone, ...(campusId ? { weekend: legacyWeekends.map((w) => w.dayOfWeek % 7) } : {}), ...localePatchSchema.parse(schoolPolicy?.settings || {}) }, localePatchSchema.parse(campusPolicy?.settings || {}), personal);
  };
}
export async function getLocalePackage(schoolId: string, campusId: string | null = null, at = new Date(), personal?: Language | null, db: Pick<TxClient, "school" | "localePolicy" | "weekend"> = prisma) {
  return (await loadLocaleTimeline(schoolId, campusId, db))(at, personal);
}

export async function loadCampusLocaleTimeline(campusId: string) {
  const campus = await prisma.campus.findUniqueOrThrow({ where: { id: campusId }, select: { schoolId: true } });
  return loadLocaleTimeline(campus.schoolId, campusId);
}
