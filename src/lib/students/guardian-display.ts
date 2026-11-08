// SKAI-1246: the profile read the legacy free-text `guardianName` column only,
// so a student whose guardian joined through a verified link showed "N/A".
// The current verified link wins; the legacy column is the fallback.

export const GUARDIAN_LINK_STATUS = "ACTIVE";

/** Prisma include for the newest verified guardian link of a student, in one school. */
export function verifiedGuardianLinkInclude(schoolId: string) {
  return {
    where: { schoolId, status: GUARDIAN_LINK_STATUS, verifiedAt: { not: null } },
    orderBy: { verifiedAt: "desc" as const },
    take: 1,
    select: { schoolId: true, fullName: true, guardian: { select: { fullName: true, schoolId: true } } },
  };
}

type GuardianLink = {
  schoolId: string;
  fullName: string | null;
  guardian?: { fullName: string | null; schoolId: string } | null;
};

/** The name to show: a same-school verified link first, else the legacy field. */
export function resolveGuardianName(
  student: { schoolId: string; guardianName: string | null },
  links: GuardianLink[] | undefined,
): string | null {
  for (const link of links ?? []) {
    if (link.schoolId !== student.schoolId) continue;
    const account = link.guardian && link.guardian.schoolId === student.schoolId ? link.guardian.fullName?.trim() : "";
    const name = account || link.fullName?.trim();
    if (name) return name;
  }
  return student.guardianName?.trim() || null;
}
