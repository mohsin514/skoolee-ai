// SKO-397 readiness rules. Pure: the service gathers facts, this decides what
// "ready" means for the school's chosen adoption mode. Each check names the
// evidence it used and where to fix it, so readiness is evidence, not a percentage.

export type AdoptionMode = "EXAM_STUDIO" | "FULL_OPERATIONS";
export const REHEARSAL_STEPS = ["attendance", "assessment", "family"] as const;
export type RehearsalStep = typeof REHEARSAL_STEPS[number];

export interface ImportFacts {
  pendingBatches: number;          // staged or partially committed batches still awaiting a decision
  rejectedRows: number;
  unresolvedRows: number;
  unknownClassRows: number;        // roster rows rejected because the class is unknown or outside the campus
  batches: Array<{ id: string; kind: string; state: string; sourceName: string; total: number; accepted: number; rejected: number; unresolved: number; unknownClass: number }>;
}

export interface ReadinessFacts {
  adoptionMode: AdoptionMode;
  institutionType: "STANDALONE" | "GROUP";
  campuses: number;
  localeConfirmed: boolean;        // an explicit school locale policy, not the platform default
  activeCycles: number;
  classes: number;
  classesWithTeacher: number;
  teachers: number;
  students: number;
  studentsWithoutGuardian: number;
  guardianReviewRequired: number;
  feeStructures: number;
  openingBalances: number;
  imports: ImportFacts;
  rehearsal: Partial<Record<RehearsalStep, string>>;
  /** Per-campus setup (SKAI-154): a school-wide count can pass while a second campus has nothing to run. */
  campusBreakdown?: CampusFacts[];
}

export interface CampusFacts { id: string; name: string; classes: number; students: number }
/** A campus is ready to run when it has at least one class and at least one pupil on the roll. */
export const campusReady = (campus: CampusFacts) => campus.classes >= 1 && campus.students >= 1;

export type CheckId = "campus" | "locale" | "academic" | "staff" | "roster" | "campusCoverage" | "imports" | "guardians" | "fees" | "rehearsal";
/**
 * Where a check is fixed for the viewer. `delegated`: campus-level work the group admin hands to campus admins (the
 * link opens Campuses). `handledElsewhere`: someone else fixes it in their console and the viewer has no screen for it,
 * so there is no link at all (`href` null) — never a link back to the readiness page itself (P9-08).
 */
export interface ReadinessCheck { id: CheckId; required: boolean; passed: boolean; evidence: Record<string, number | boolean>; href: string | null; delegated?: boolean; handledElsewhere?: boolean }
export type CheckTarget = { href: string | null; delegated?: boolean; handledElsewhere?: boolean };

/**
 * Who is looking: the role plus the institution kind (§1.1), so a standalone school admin and a group campus admin
 * differ. An unknown kind fails closed (C32): only the owner flag in an authority role stands in for it.
 */
export interface CheckViewer { role: string; institutionKind?: "GROUP" | "STANDALONE"; isInstitutionOwner?: boolean }

const toViewer = (viewer: CheckViewer | string): CheckViewer => (typeof viewer === "string" ? { role: viewer } : viewer);

/** Campus-level checks a campus operator fixes in their own console (§3 registry views, never aliases). */
const OPERATOR_HREF: Partial<Record<CheckId, string>> = {
  academic: "/admin?view=academic-hub",
  staff: "/admin?view=teachers",
  roster: "/admin?view=students",
  campusCoverage: "/admin?view=academic-hub",
  imports: "/admin?view=students",
  guardians: "/admin?view=guardians",
  fees: "/admin?view=fees",
};
/** A principal named as setup delegate fixes the academic checks in the academic console. */
const PRINCIPAL_HREF: Partial<Record<CheckId, string>> = {
  academic: "/principal?view=classes",
  staff: "/principal?view=teachers",
  roster: "/principal?view=students",
  campusCoverage: "/principal?view=classes",
};

/**
 * Where each check is fixed for the person looking (G49a). Never a console the viewer cannot open:
 * - the group admin (SUPER_ADMIN) cannot open /admin, so campus-level work points at Campuses (each campus and its
 *   admin) and is marked delegated to campus admins; school identity and language live in Settings;
 * - the school admin of a single school (ADMIN, STANDALONE) fixes identity and language in School settings;
 * - a campus admin (CAMPUS_ADMIN, or ADMIN inside a group) fixes them in Campus setup › Profile;
 * - campus operators fix every campus-level check in their own console views;
 * - a principal named as setup delegate fixes the academic checks in the academic console;
 * - anyone else has no screen for the check: no link, "handled elsewhere" (the campus team fixes it).
 */
export function checkHref(id: CheckId, viewer: CheckViewer | string): CheckTarget {
  const { role, institutionKind, isInstitutionOwner } = toViewer(viewer);
  if (id === "rehearsal") return { href: "/setup/readiness#practice" };
  if (role === "SUPER_ADMIN") {
    if (id === "campus") return { href: "/super?view=campuses" };
    if (id === "locale") return { href: "/super?view=settings&tab=locale" };
    return { href: "/super?view=campuses", delegated: true };
  }
  const operator = role === "CAMPUS_ADMIN" || role === "ADMIN";
  if (operator) {
    // The school admin of a single school; an ADMIN of unknown kind is a campus operator, nothing more (P9-10).
    const schoolAdmin = role === "ADMIN" && (institutionKind === "STANDALONE" || (institutionKind === undefined && isInstitutionOwner === true));
    if (id === "campus") return { href: schoolAdmin ? "/admin?view=school-settings&tab=profile" : "/admin?view=settings&tab=profile" };
    if (id === "locale") return { href: schoolAdmin ? "/admin?view=school-settings&tab=locale" : "/admin?view=settings&tab=profile" };
    return { href: OPERATOR_HREF[id] ?? "/admin" };
  }
  if (role === "PRINCIPAL" && PRINCIPAL_HREF[id]) return { href: PRINCIPAL_HREF[id]! };
  return { href: null, handledElsewhere: true };
}

export function evaluateReadiness(facts: ReadinessFacts, viewer: CheckViewer | string = { role: "ADMIN" }) {
  const full = facts.adoptionMode === "FULL_OPERATIONS";
  const rehearsed = REHEARSAL_STEPS.filter(step => !!facts.rehearsal[step]).length;
  const breakdown = facts.campusBreakdown ?? [];
  const campusesWaiting = breakdown.filter(campus => !campusReady(campus)).length;
  const checks: ReadinessCheck[] = [
    { id: "campus", required: true, passed: facts.campuses >= 1, evidence: { campuses: facts.campuses }, href: "" },
    { id: "locale", required: true, passed: facts.localeConfirmed, evidence: { confirmed: facts.localeConfirmed }, href: "" },
    { id: "academic", required: true, passed: facts.activeCycles >= 1 && facts.classes >= 1, evidence: { activeCycles: facts.activeCycles, classes: facts.classes }, href: "" },
    // Exam Studio needs someone to run the first class; full operations needs classes owned by teachers.
    { id: "staff", required: true, passed: full ? facts.classesWithTeacher >= 1 : facts.teachers >= 1, evidence: { teachers: facts.teachers, classesWithTeacher: facts.classesWithTeacher }, href: "" },
    { id: "roster", required: true, passed: facts.students >= 1, evidence: { students: facts.students }, href: "" },
    // Full operations runs every campus, so each needs a class and pupils; Exam Studio may start on one campus.
    { id: "campusCoverage", required: full, passed: campusesWaiting === 0, evidence: { campusesReady: breakdown.length - campusesWaiting, campusesTotal: breakdown.length }, href: "" },
    { id: "imports", required: true, passed: facts.imports.pendingBatches === 0, evidence: { pendingBatches: facts.imports.pendingBatches, rejectedRows: facts.imports.rejectedRows, unresolvedRows: facts.imports.unresolvedRows, unknownClassRows: facts.imports.unknownClassRows }, href: "" },
    { id: "guardians", required: full, passed: facts.studentsWithoutGuardian === 0 && facts.guardianReviewRequired === 0, evidence: { studentsWithoutGuardian: facts.studentsWithoutGuardian, reviewRequired: facts.guardianReviewRequired }, href: "" },
    { id: "fees", required: full, passed: facts.feeStructures >= 1, evidence: { feeStructures: facts.feeStructures, openingBalances: facts.openingBalances }, href: "" },
    { id: "rehearsal", required: true, passed: rehearsed === REHEARSAL_STEPS.length, evidence: { completedSteps: rehearsed, totalSteps: REHEARSAL_STEPS.length }, href: "" },
  ];
  // Every href comes from checkHref for this viewer; the list above never hard-codes a console.
  for (const check of checks) Object.assign(check, checkHref(check.id, viewer));
  const blocking = checks.filter(check => check.required && !check.passed);
  return { checks, ready: blocking.length === 0, nextRequired: blocking[0]?.id ?? null, campuses: breakdown.map(campus => ({ ...campus, ready: campusReady(campus) })) };
}

/** "classId: Class is outside the selected campus or does not exist" is how roster staging rejects unknown classes. */
export function isUnknownClassError(error: string) {
  return /^classId:/i.test(error.trim());
}
