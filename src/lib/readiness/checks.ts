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
}

export type CheckId = "campus" | "locale" | "academic" | "staff" | "roster" | "imports" | "guardians" | "fees" | "rehearsal";
/** Where a check is fixed, and whether it is campus-level work a group owner hands to campus admins. */
export interface ReadinessCheck { id: CheckId; required: boolean; passed: boolean; evidence: Record<string, number | boolean>; href: string; delegated?: boolean }

/**
 * Where each check is fixed for the person looking. A school owner (ADMIN / CAMPUS_ADMIN) works in the
 * campus console (/admin views). A group owner (SUPER_ADMIN) cannot open /admin (403) and is sent from
 * /dashboard/* back to /super, so campus-level work points at the group's Schools view, where each campus
 * and its admin are managed, and is marked as delegated to campus admins.
 */
export function checkHref(id: CheckId, role: string): { href: string; delegated?: boolean } {
  const group = role === "SUPER_ADMIN";
  switch (id) {
    case "campus": return { href: group ? "/super?view=schools" : "/admin?view=institution" };
    case "locale": return { href: "/settings/locale" };
    case "academic": return group ? { href: "/super?view=schools", delegated: true } : { href: "/admin?view=academic-hub" };
    case "staff": return group ? { href: "/super?view=schools", delegated: true } : { href: "/admin?view=teachers" };
    case "roster": return group ? { href: "/super?view=schools", delegated: true } : { href: "/admin?view=students" };
    case "imports": return group ? { href: "/super?view=schools", delegated: true } : { href: "/admin?view=students" };
    case "guardians": return { href: "/dashboard/guardians" };
    case "fees": return { href: group ? "/super?view=fees" : "/admin?view=fees" };
    case "rehearsal": return { href: "/setup/readiness#practice" };
  }
}

export function evaluateReadiness(facts: ReadinessFacts, role = "ADMIN") {
  const full = facts.adoptionMode === "FULL_OPERATIONS";
  const rehearsed = REHEARSAL_STEPS.filter(step => !!facts.rehearsal[step]).length;
  const checks: ReadinessCheck[] = [
    { id: "campus", required: true, passed: facts.campuses >= 1, evidence: { campuses: facts.campuses }, href: "/admin?view=institution" },
    { id: "locale", required: true, passed: facts.localeConfirmed, evidence: { confirmed: facts.localeConfirmed }, href: "/settings/locale" },
    { id: "academic", required: true, passed: facts.activeCycles >= 1 && facts.classes >= 1, evidence: { activeCycles: facts.activeCycles, classes: facts.classes }, href: "/admin?view=academic-hub" },
    // Exam Studio needs someone to run the first class; full operations needs classes owned by teachers.
    { id: "staff", required: true, passed: full ? facts.classesWithTeacher >= 1 : facts.teachers >= 1, evidence: { teachers: facts.teachers, classesWithTeacher: facts.classesWithTeacher }, href: "/admin?view=teachers" },
    { id: "roster", required: true, passed: facts.students >= 1, evidence: { students: facts.students }, href: "/dashboard/students" },
    { id: "imports", required: true, passed: facts.imports.pendingBatches === 0, evidence: { pendingBatches: facts.imports.pendingBatches, rejectedRows: facts.imports.rejectedRows, unresolvedRows: facts.imports.unresolvedRows, unknownClassRows: facts.imports.unknownClassRows }, href: "/dashboard/students" },
    { id: "guardians", required: full, passed: facts.studentsWithoutGuardian === 0 && facts.guardianReviewRequired === 0, evidence: { studentsWithoutGuardian: facts.studentsWithoutGuardian, reviewRequired: facts.guardianReviewRequired }, href: "/dashboard/guardians" },
    { id: "fees", required: full, passed: facts.feeStructures >= 1, evidence: { feeStructures: facts.feeStructures, openingBalances: facts.openingBalances }, href: "/admin?view=fees" },
    { id: "rehearsal", required: true, passed: rehearsed === REHEARSAL_STEPS.length, evidence: { completedSteps: rehearsed, totalSteps: REHEARSAL_STEPS.length }, href: "/setup/readiness#practice" },
  ];
  for (const check of checks) Object.assign(check, checkHref(check.id, role));
  const blocking = checks.filter(check => check.required && !check.passed);
  return { checks, ready: blocking.length === 0, nextRequired: blocking[0]?.id ?? null };
}

/** "classId: Class is outside the selected campus or does not exist" is how roster staging rejects unknown classes. */
export function isUnknownClassError(error: string) {
  return /^classId:/i.test(error.trim());
}
