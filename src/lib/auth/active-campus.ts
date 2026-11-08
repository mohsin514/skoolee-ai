// SKAI-1113: the SUPER_ADMIN's active campus. "All campuses" (no cookie) keeps the school-wide scope;
// a chosen campus narrows campusScope() to that campus. The cookie is only a hint: every read re-checks
// that the campus belongs to the signed-in user's school and is not archived, so it cannot reach another tenant.

export const ACTIVE_CAMPUS_COOKIE = "skoolee_active_campus";
export const ACTIVE_CAMPUS_DAYS = 30;

/** Campus lookup restricted to one school; injected so tests need no database. */
export type CampusLookup = (schoolId: string, campusId: string) => Promise<{ id: string } | null>;

/** Cookie value binds the choice to one account, so a shared browser never carries it to another user. */
export function encodeActiveCampus(userId: string, campusId: string): string {
  return `${userId}:${campusId}`;
}

export function decodeActiveCampus(raw: string | undefined | null, userId: string): string | null {
  if (!raw) return null;
  const at = raw.indexOf(":");
  if (at <= 0 || raw.slice(0, at) !== userId) return null;
  const campusId = raw.slice(at + 1);
  return /^[A-Za-z0-9_-]{1,64}$/.test(campusId) ? campusId : null;
}

/** The validated active campus for a SUPER_ADMIN, or null for "All campuses" (and for every other role). */
export async function resolveActiveCampusId(
  user: { role: string; userId: string; schoolId: string },
  raw: string | undefined | null,
  lookup: CampusLookup,
): Promise<string | null> {
  if (user.role !== "SUPER_ADMIN") return null;
  const campusId = decodeActiveCampus(raw, user.userId);
  if (!campusId) return null;
  const campus = await lookup(user.schoolId, campusId);
  return campus?.id === campusId ? campusId : null;
}

export function activeCampusCookieAttributes(maxAgeDays = ACTIVE_CAMPUS_DAYS) {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 24 * maxAgeDays };
}
