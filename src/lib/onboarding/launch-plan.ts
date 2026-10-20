import { dashboardPathForRole, type UserRole } from "@/lib/roles";

export const START_CAMPUS_SETUP_EVENT = "skoolee:start-campus-setup";
export type LaunchJourney = "institution" | "campus" | "teacher" | "student" | "family" | "finance" | "library" | "frontDesk" | "platform";
export type LaunchTask = "institution" | "campus" | "profile" | "aiSetup" | "aiWorkspace" | "studio" | "academics" | "timetable" | "learning" | "children" | "fees" | "library" | "frontDesk" | "workspace";
export interface LaunchAction { task: LaunchTask; href: string }
export interface LaunchPlan {
  journey: LaunchJourney;
  actions: LaunchAction[];
  needsCampus: boolean;
}

/** Presentation only. Destinations continue to enforce their own permissions. */
export function launchPlan(input: {
  role: UserRole;
  institutionSetup: boolean;
  onboardingComplete: boolean;
  campusId: string | null;
  permissions: ReadonlyMap<string, { canView: boolean; canAdd: boolean }>;
}): LaunchPlan {
  const { role, institutionSetup, campusId, permissions } = input;
  const home = dashboardPathForRole(role);
  const can = (module: string, write = false) => role === "SUPER_ADMIN" || Boolean(write ? permissions.get(module)?.canView && permissions.get(module)?.canAdd : permissions.get(module)?.canView);
  if (institutionSetup) return { journey: "institution", needsCampus: false, actions: [{ task: "institution", href: "/onboarding" }] };
  if (["SUPER_ADMIN", "ADMIN", "CAMPUS_ADMIN", "PRINCIPAL"].includes(role)) {
    const actions: LaunchAction[] = [];
    const needsCampus = role !== "SUPER_ADMIN" && !campusId;
    if (!needsCampus && can("ai", true)) actions.push({ task: "aiSetup", href: "/ai?setup=1" });
    if (!needsCampus && can("ai")) actions.push({ task: "aiWorkspace", href: "/ai?workflow=overview" });
    if (!needsCampus && ["ADMIN", "CAMPUS_ADMIN"].includes(role)) actions.push({ task: "campus", href: "/admin?view=institution" });
    if (!needsCampus && role !== "SUPER_ADMIN" && can("timetable")) actions.push({ task: "academics", href: `${home}?view=academic-hub` });
    actions.push({ task: "workspace", href: home });
    return { journey: role === "SUPER_ADMIN" ? "institution" : "campus", actions, needsCampus };
  }
  if (role === "TEACHER") {
    if (!input.onboardingComplete) return { journey: "teacher", needsCampus: !campusId, actions: [{ task: "profile", href: "/teacher-onboarding" }] };
    const actions: LaunchAction[] = [];
    if (campusId && can("ai") && can("exams")) actions.push({ task: "studio", href: "/ai/studio" });
    if (campusId && can("ai")) actions.push({ task: "aiWorkspace", href: "/ai?workflow=overview" });
    if (campusId && can("timetable")) actions.push({ task: "timetable", href: "/teacher/timetable" });
    actions.push({ task: "workspace", href: home });
    return { journey: "teacher", actions, needsCampus: !campusId };
  }
  const journeys: Partial<Record<UserRole, [LaunchJourney, LaunchTask]>> = {
    STUDENT: ["student", "learning"], PARENT: ["family", "children"], ACCOUNTANT: ["finance", "fees"],
    LIBRARIAN: ["library", "library"], RECEPTIONIST: ["frontDesk", "frontDesk"], APP_OWNER: ["platform", "workspace"],
  };
  const [journey, task] = journeys[role] ?? ["platform", "workspace"];
  const actions: LaunchAction[] = [{ task, href: home }];
  const operationalStaff = ["ACCOUNTANT", "LIBRARIAN", "RECEPTIONIST"].includes(role);
  if (operationalStaff && campusId && can("ai")) actions.push({ task: "aiWorkspace", href: "/ai?workflow=overview" });
  return { journey, needsCampus: operationalStaff && !campusId, actions };
}

// Only entry screens: never interrupt an exam, payment, password change or a deep-linked task.
const entryPaths = new Set(["/onboarding", "/teacher-onboarding", "/dashboard", "/super", "/admin", "/principal", "/teacher", "/student", "/parent", "/accountant", "/librarian", "/receptionist", "/owner", "/setup/readiness", "/ai"]);
export function isLaunchEntry(pathname: string) { return entryPaths.has(pathname); }

/** Default dashboard state is still a welcome entry, not a deep-linked task. */
export function isLaunchTask(search: string, hash = "") {
  if (hash && hash !== "#workspace-content") return true;
  return [...new URLSearchParams(search)].some(([key, value]) =>
    !(key === "view" && value === "overview") &&
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
