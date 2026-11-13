import { prisma, type TxClient } from "@/lib/db/prisma";
import { parseStoredLocaleSettings, resolvePackage, type Language } from "./package";
import { createTtlMemo } from "@/lib/cache/ttl-memo";

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
    return resolvePackage({ timezone: school.timezone, ...(campusId ? { weekend: legacyWeekends.map((w) => w.dayOfWeek % 7) } : {}), ...parseStoredLocaleSettings(schoolPolicy?.settings || {}) }, parseStoredLocaleSettings(campusPolicy?.settings || {}), personal);
  };
}
/**
 * Scale: the school/campus timeline (timezone, locale policies, weekends: 3 queries) is configuration shared by every
 * request in the school, and ~70 call sites resolve it per request — some once per child or per row. With the default
 * client it is memoised per instance for 60 s; a caller passing its own client (a transaction) always reads fresh.
 * The timeline still evaluates `at` and `personal` on every call.
 */
const timelines = createTtlMemo({ ttlMs: 60_000 });

export async function getLocalePackage(schoolId: string, campusId: string | null = null, at = new Date(), personal?: Language | null, db: Pick<TxClient, "school" | "localePolicy" | "weekend"> = prisma) {
  const timeline = db === prisma
    ? await timelines.get(JSON.stringify([schoolId, campusId]), () => loadLocaleTimeline(schoolId, campusId, db))
    : await loadLocaleTimeline(schoolId, campusId, db);
  return timeline(at, personal);
}

export async function loadCampusLocaleTimeline(campusId: string) {
  const campus = await prisma.campus.findUniqueOrThrow({ where: { id: campusId }, select: { schoolId: true } });
  return loadLocaleTimeline(campus.schoolId, campusId);
}
