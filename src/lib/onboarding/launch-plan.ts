import { dashboardPathForRole, type UserRole } from "@/lib/roles";

export const START_CAMPUS_SETUP_EVENT = "skoolee:start-campus-setup";
export type LaunchJourney = "institution" | "campus" | "teacher" | "student" | "family" | "finance" | "library" | "frontDesk" | "platform";
export type LaunchTask = "institution" | "campus" | "profile" | "aiSetup" | "roleSetup" | "aiWorkspace" | "studio" | "academics" | "timetable" | "learning" | "children" | "fees" | "library" | "frontDesk" | "workspace";
export interface LaunchAction { task: LaunchTask; href: string }

/** SkooleeAI's two flagships (addendum 2026-10-22). */
export type Flagship = "ai-workflows" | "exam-studio";
/** The welcome tasks that open a flagship, and which one (LaunchGuide marks them with the shared FlagshipChip). */
export function flagshipOf(task: LaunchTask): Flagship | null {
  return task === "aiSetup" || task === "roleSetup" || task === "aiWorkspace" ? "ai-workflows" : task === "studio" ? "exam-studio" : null;
}
/** The flagships a welcome plan leads to, in flagship order. The institution wizard ends in the AI setup
 *  questionnaire, so a new owner's plan leads to AI Workflows too. */
export function planFlagships(actions: readonly LaunchAction[]): Flagship[] {
  const found = new Set(actions.map((action) => action.task === "institution" ? "ai-workflows" : flagshipOf(action.task)).filter((value): value is Flagship => value !== null));
  return (["ai-workflows", "exam-studio"] as const).filter((flagship) => found.has(flagship));
}
/**
 * The setup questionnaire (AI Workflows): answered once, it drafts the launch plan — academic year, classes, calendar,
 * timetable, fees, communications — for review. `/ai?setup=1` is the questionnaire's own entry (the institution wizard
 * and readiness hand over to it too); the Today card's `/ai?workflow=schoolSetup` must land on the same questionnaire.
 */
export const AI_SETUP_HREF = "/ai?setup=1";
/** AI Workflows' landing (addendum: "Run an AI workflow" → /ai). */
export const AI_WORKFLOWS_HREF = "/ai";
export const EXAM_STUDIO_HREF = "/ai/studio";
export interface LaunchPlan {
  journey: LaunchJourney;
  actions: LaunchAction[];
  needsCampus: boolean;
}

/** The campus task's destination: the standalone owner reviews the school profile in School settings (SPEC §3.1);
 *  everyone else (a deputy, a group campus admin, or an ADMIN whose kind is not known) opens Campus setup › Profile,
 *  which /admin re-routes for the owner. */
export function campusTaskHref(role: UserRole, institutionKind?: "GROUP" | "STANDALONE" | null): string {
  return role === "ADMIN" && institutionKind === "STANDALONE" ? "/admin?view=school-settings&tab=profile" : "/admin?view=settings&tab=profile";
}

/** Presentation only. Destinations continue to enforce their own permissions. */
export function launchPlan(input: {
  role: UserRole;
  institutionSetup: boolean;
  onboardingComplete: boolean;
  campusId: string | null;
  permissions: ReadonlyMap<string, { canView: boolean; canAdd: boolean }>;
  /** When known: a STANDALONE school's ADMIN reviews the school profile in School settings (SPEC §3.1). */
  institutionKind?: "GROUP" | "STANDALONE";
}): LaunchPlan {
  const { role, institutionSetup, campusId, permissions } = input;
  const home = dashboardPathForRole(role);
  const can = (module: string, write = false) => role === "SUPER_ADMIN" || Boolean(write ? permissions.get(module)?.canView && permissions.get(module)?.canAdd : permissions.get(module)?.canView);
  if (institutionSetup) return { journey: "institution", needsCampus: false, actions: [{ task: "institution", href: "/onboarding" }] };
  if (["SUPER_ADMIN", "ADMIN", "CAMPUS_ADMIN", "PRINCIPAL"].includes(role)) {
    const actions: LaunchAction[] = [];
    const needsCampus = role !== "SUPER_ADMIN" && !campusId;
    // Campus operators answer the campus interview; group owners open governance workflows.
    const setupRole = role === "ADMIN" || role === "CAMPUS_ADMIN";
    if (!needsCampus && setupRole && can("ai", true)) actions.push({ task: "aiSetup", href: AI_SETUP_HREF });
    else if (!needsCampus && can("ai", true)) actions.push({ task: "roleSetup", href: AI_SETUP_HREF });
    else if (!needsCampus && can("ai")) actions.push({ task: "aiWorkspace", href: AI_WORKFLOWS_HREF });
    // Flagship 2, Exam Studio: the principal's (a campus operator holds it only while no principal is appointed, which
    // the welcome cannot see; its sidebar entry and Today card show it then).
    if (!needsCampus && role === "PRINCIPAL" && can("ai") && can("exams")) actions.push({ task: "studio", href: EXAM_STUDIO_HREF });
    // Registry views (SPEC §3): the campus record is Campus setup › Profile; the standalone owner's school profile is
    // School settings › Profile (admin also redirects settings&tab=profile there for the owner).
    if (!needsCampus && ["ADMIN", "CAMPUS_ADMIN"].includes(role)) actions.push({ task: "campus", href: campusTaskHref(role, input.institutionKind) });
    // "Review academic setup" (grades, subjects, class structure): the principal's Classes & subjects view, the
    // operators' Academic overview. Never the Today queue, which is the workspace task.
    if (!needsCampus && role !== "SUPER_ADMIN" && can("timetable")) actions.push({ task: "academics", href: role === "PRINCIPAL" ? `${home}?view=classes` : `${home}?view=academic-hub` });
    actions.push({ task: "workspace", href: home });
    return { journey: role === "SUPER_ADMIN" ? "institution" : "campus", actions, needsCampus };
  }
  if (role === "TEACHER") {
    if (!input.onboardingComplete) return { journey: "teacher", needsCampus: !campusId, actions: [{ task: "profile", href: "/teacher-onboarding" }] };
    const actions: LaunchAction[] = [];
    if (campusId && can("ai", true)) actions.push({ task: "roleSetup", href: AI_SETUP_HREF });
    if (campusId && can("ai") && can("exams")) actions.push({ task: "studio", href: EXAM_STUDIO_HREF });
    if (campusId && can("timetable")) actions.push({ task: "timetable", href: "/teacher/timetable" });
    actions.push({ task: "workspace", href: home });
    return { journey: "teacher", actions, needsCampus: !campusId };
  }
  const journeys: Partial<Record<UserRole, [LaunchJourney, LaunchTask]>> = {
    STUDENT: ["student", "learning"], PARENT: ["family", "children"], ACCOUNTANT: ["finance", "fees"],
    LIBRARIAN: ["library", "library"], RECEPTIONIST: ["frontDesk", "frontDesk"], APP_OWNER: ["platform", "workspace"],
  };
  const [journey, task] = journeys[role] ?? ["platform", "workspace"];
  // Each desk and family gets its own scoped AI interview.
  const operationalStaff = ["ACCOUNTANT", "LIBRARIAN", "RECEPTIONIST"].includes(role);
  const actions: LaunchAction[] = [...(role === "APP_OWNER" || can("ai", true) && (!operationalStaff || campusId) ? [{ task: "roleSetup" as const, href: AI_SETUP_HREF }] : []), { task, href: home }];
  return { journey, needsCampus: operationalStaff && !campusId, actions };
}

// Only entry screens: never interrupt an exam, payment, password change or a deep-linked task.
const entryPaths = new Set(["/onboarding", "/teacher-onboarding", "/dashboard", "/super", "/admin", "/principal", "/teacher", "/student", "/parent", "/accountant", "/librarian", "/receptionist", "/owner", "/setup/readiness", "/ai"]);
export function isLaunchEntry(pathname: string) { return entryPaths.has(pathname); }

/** Console landing views (registry defaultView): overview, the desks' dashboard and the owner's schools. */
const LANDING_VIEWS = new Set(["overview", "dashboard", "schools"]);

/** Default dashboard state is still a welcome entry, not a deep-linked task. */
export function isLaunchTask(search: string, hash = "") {
  if (hash && hash !== "#workspace-content") return true;
  return [...new URLSearchParams(search)].some(([key, value]) =>
    !(key === "view" && LANDING_VIEWS.has(value)) &&
    !(key === "lang" && ["en", "ar", "ur"].includes(value)) &&
    !key.startsWith("utm_")
  );
}

/** Family and operational staff accounts never belong in institution creation. */
export function requiredOnboardingPath(role: string, complete: boolean): string | null {
  if (complete) return null;
  if (role === "TEACHER") return "/teacher-onboarding";
  return ["SUPER_ADMIN", "ADMIN"].includes(role) ? "/onboarding" : null;
}
