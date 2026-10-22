import { dashboardPathForRole, type UserRole } from "@/lib/roles";
import { isCampusOperator, isGroupConsole, isStandaloneOwner, kindFor } from "@/lib/auth/institution";

/**
 * SPEC §6.1 — the retired `/dashboard/**` console resolves to the caller's own console view. Pure and
 * unit-tested (`tests/navigation/legacy-redirects.test.ts`); the server page under
 * `src/app/dashboard/[[...slug]]/page.tsx` supplies `academicLead` and `standaloneOwner` from the
 * capability feed. Only the listed query parameters survive, and they are carried with URLSearchParams.
 */
export interface LegacyRedirectContext {
  role: UserRole;
  academicLead: boolean;
  standaloneOwner: boolean;
}

type Query = Record<string, string | string[] | undefined>;
type Seat = "SA" | "OPS" | "PR" | "TE" | "AC" | "DESK" | "FAMILY" | "OTHER";

function seatFor(role: UserRole): Seat {
  switch (role) {
    case "SUPER_ADMIN": return "SA";
    case "CAMPUS_ADMIN":
    case "ADMIN": return "OPS";
    case "PRINCIPAL": return "PR";
    case "TEACHER": return "TE";
    case "ACCOUNTANT": return "AC";
    case "RECEPTIONIST":
    case "LIBRARIAN": return "DESK";
    case "PARENT":
    case "STUDENT": return "FAMILY";
    default: return "OTHER";
  }
}

function first(value: string | string[] | undefined): string | undefined {
  const picked = Array.isArray(value) ? value[0] : value;
  return typeof picked === "string" && picked.length > 0 ? picked : undefined;
}

/** `base` plus the fixed params and the carried query keys, in that order. */
function withParams(base: string, fixed: Record<string, string>, query: Query, carry: readonly string[]): string {
  const [path, existing] = base.split("?");
  const params = new URLSearchParams(existing ?? "");
  for (const [key, value] of Object.entries(fixed)) params.set(key, value);
  for (const key of carry) {
    const value = first(query[key]);
    if (value !== undefined) params.set(key, value);
  }
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

const BILLING_PARAMS = ["success", "canceled", "session_id", "safepay_status"] as const;
const FEE_PARAMS = ["invoice", "payment", "student"] as const;
const GUARDIAN_PARAMS = ["student"] as const;

export function legacyDashboardTarget(ctx: LegacyRedirectContext, slug: string[], query: Query): string {
  const home = dashboardPathForRole(ctx.role);
  const seat = seatFor(ctx.role);
  const path = slug.filter(Boolean).join("/");

  switch (path) {
    case "":
      return home;
    case "students":
      return seat === "SA" ? "/super?view=campuses" : seat === "OPS" ? "/admin?view=students" : seat === "PR" ? "/principal?view=students" : seat === "TE" ? "/teacher/students" : home;
    case "classes":
      return seat === "SA" ? "/super?view=campuses" : seat === "OPS" ? "/admin?view=classes" : seat === "PR" ? "/principal?view=classes" : seat === "TE" ? "/teacher/classes" : home;
    case "staff-hierarchy":
      return seat === "SA" ? "/super?view=campuses" : seat === "OPS" ? "/admin?view=staff-hierarchy" : seat === "PR" ? "/principal?view=teachers" : home;
    case "marks":
      if (seat === "SA") return "/super";
      if (seat === "OPS") return ctx.academicLead ? "/admin?view=exam-cycles" : "/admin?view=academic-hub";
      return seat === "PR" ? "/principal?view=exam-cycles" : seat === "TE" ? "/teacher/marks" : home;
    case "reports":
      return seat === "SA" ? "/super" : seat === "OPS" ? "/admin?view=report-cards" : seat === "PR" ? "/principal?view=report-cards" : seat === "TE" ? "/teacher/reports" : home;
    case "communications":
      return seat === "SA" ? "/super" : seat === "OPS" ? "/admin?view=communications" : seat === "PR" ? "/principal?view=engagement" : home;
    case "analytics":
      return seat === "SA" ? "/super" : seat === "OPS" ? "/admin?view=academic-hub" : seat === "PR" ? "/principal" : seat === "TE" ? "/teacher/insights" : seat === "AC" ? "/accountant?view=fee-reports" : home;
    case "billing":
      // The /billing resolver (P1) decides payer vs "Managed by {owner}"; nobody else is sent there.
      return seat === "SA" || seat === "OPS" ? withParams("/billing", {}, query, BILLING_PARAMS) : home;
    case "fees":
      if (seat === "SA") return "/super?view=campuses";
      if (seat === "OPS") return withParams("/admin", { view: "fees" }, query, FEE_PARAMS);
      if (seat === "AC") return withParams("/accountant", { view: "payments" }, query, FEE_PARAMS);
      return home;
    case "guardians":
      if (seat === "SA") return "/super?view=campuses";
      if (seat === "OPS") return withParams("/admin", { view: "guardians" }, query, GUARDIAN_PARAMS);
      return seat === "PR" ? "/principal?view=students" : home;
    case "settings":
      if (seat === "SA") return "/super?view=settings";
      if (seat === "FAMILY" || seat === "OTHER") return home;
      return `${home}?settings=profile`;
    case "settings/members":
      if (seat === "SA") return "/super?view=access&tab=members";
      if (seat === "OPS") return ctx.standaloneOwner ? "/admin?view=access&tab=members" : "/admin?view=leadership";
      return home;
    default:
      return home;
  }
}

/**
 * SPEC §6.3 — orphan module routes that became console views. Pure (unit-tested beside §6.1). The caller is
 * the signed-in user as resolved by `resolveCurrentPrincipal` (so `institutionKind` is present); a user
 * object without a kind fails closed through the §1.1 predicates and lands home.
 */
export type OrphanRoute = "settings-data" | "settings-locale" | "pickup" | "group-policy" | "identity" | "integrations" | "tax-packages";
export type OrphanRouteUser = { role: UserRole; institutionKind?: "GROUP" | "STANDALONE"; isInstitutionOwner?: boolean };

export function orphanRouteTarget(route: OrphanRoute, user: OrphanRouteUser): string {
  const home = dashboardPathForRole(user.role);
  const groupAdmin = isGroupConsole(user);
  const schoolAdmin = isStandaloneOwner(user);
  const operator = isCampusOperator(user);
  switch (route) {
    case "settings-data":
      return groupAdmin ? "/super?view=settings&tab=data" : schoolAdmin ? "/admin?view=school-settings&tab=data" : home;
    case "settings-locale":
      if (groupAdmin) return "/super?view=settings&tab=locale";
      if (schoolAdmin) return "/admin?view=school-settings&tab=locale";
      if (operator) return "/admin?view=settings&tab=profile";
      return user.role === "APP_OWNER" ? home : `${home}?settings=language`;
    case "pickup":
      if (user.role === "RECEPTIONIST") return "/receptionist?view=pickup";
      if (operator) return "/admin?view=pickup";
      if (user.role === "PARENT") return "/parent/pickup";
      return home;
    case "group-policy":
      if (groupAdmin) return "/super?view=standards&tab=policies";
      if (operator && kindFor(user) === "GROUP") return "/admin?view=settings&tab=group-standards";
      return home;
    case "identity":
    case "integrations":
      if (groupAdmin) return `/super?view=settings&tab=${route}`;
      if (schoolAdmin) return `/admin?view=school-settings&tab=${route}`;
      return home;
    case "tax-packages":
      if (user.role === "ACCOUNTANT") return "/accountant?view=tax";
      if (groupAdmin) return "/super?view=approvals&tab=tax";
      if (schoolAdmin) return "/admin?view=approvals&tab=tax";
      return home;
    default:
      return home;
  }
}
