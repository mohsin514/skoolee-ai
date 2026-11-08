/**
 * The school setup wizard's second half (SKAI-111): once the institution is activated, the remaining setup areas in
 * the order a school needs them. Each area links into the screen that owns it (shipped by its own ticket) and is
 * tracked as a readiness task, so skipping ("Later") and returning survive sign-out and other devices.
 * Presentation only: every destination enforces its own permissions.
 */
export const SETUP_AREAS = ["logo", "academicYear", "weekends", "holidays", "periods", "rooms", "classes", "subjects", "gradeWeights"] as const;
export type SetupAreaId = (typeof SETUP_AREAS)[number];

/** The readiness task that tracks an area. The logo reuses onboarding's own optional "logo" follow-up. */
export function setupAreaTaskKey(id: SetupAreaId): string {
  return id === "logo" ? "logo" : `area:${id}`;
}
export function setupAreaFromTaskKey(key: string): SetupAreaId | null {
  const id = key === "logo" ? "logo" : key.startsWith("area:") ? key.slice(5) : null;
  return (SETUP_AREAS as readonly string[]).includes(id ?? "") ? (id as SetupAreaId) : null;
}

/** English task titles (the screen shows the localized label; the title is what exports and evidence carry). */
export const SETUP_AREA_TITLES: Record<SetupAreaId, string> = {
  logo: "Upload the school logo", academicYear: "Set up the academic year", weekends: "Confirm weekend days",
  holidays: "Add holidays to the calendar", periods: "Set the school day's periods", rooms: "Add rooms",
  classes: "Create classes and sections", subjects: "Add subjects", gradeWeights: "Set grade weights",
};

export type SetupAreaViewer = { role: string; institutionKind?: "GROUP" | "STANDALONE" | null; isInstitutionOwner?: boolean };
export type SetupAreaTarget = { href: string | null; delegated?: boolean };

const OPERATOR: Record<Exclude<SetupAreaId, "logo">, string> = {
  academicYear: "/admin?view=settings&tab=year",
  weekends: "/admin?view=settings&tab=year",
  holidays: "/admin?view=settings&tab=calendar",
  periods: "/admin?view=settings&tab=periods",
  rooms: "/admin?view=settings&tab=rooms",
  classes: "/admin?view=classes",
  subjects: "/admin?view=classes",
  gradeWeights: "/admin?view=settings&tab=academic-rules",
};
const PRINCIPAL: Partial<Record<SetupAreaId, string>> = {
  academicYear: "/principal?view=year-cycle",
  holidays: "/principal?view=school-calendar",
  classes: "/principal?view=classes",
  subjects: "/principal?view=classes",
  gradeWeights: "/principal?view=academic-rules",
};

/** Where the person looking sets the area up; never a console they cannot open (same rules as readiness checks). */
export function setupAreaHref(id: SetupAreaId, viewer: SetupAreaViewer): SetupAreaTarget {
  const { role, institutionKind, isInstitutionOwner } = viewer;
  if (role === "SUPER_ADMIN") {
    // The group admin has no campus console: the logo is the group's own; the rest belongs to each campus admin.
    return id === "logo" ? { href: "/super?view=settings" } : { href: "/super?view=campuses", delegated: true };
  }
  if (role === "ADMIN" || role === "CAMPUS_ADMIN") {
    if (id !== "logo") return { href: OPERATOR[id] };
    const schoolAdmin = role === "ADMIN" && (institutionKind === "STANDALONE" || (institutionKind == null && isInstitutionOwner === true));
    return { href: schoolAdmin ? "/admin?view=school-settings&tab=profile" : "/admin?view=settings&tab=profile" };
  }
  if (role === "PRINCIPAL") return { href: PRINCIPAL[id] ?? null };
  return { href: null };
}
