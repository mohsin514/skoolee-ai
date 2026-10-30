import type { InstitutionKind } from "@/lib/auth/institution";

export const USER_ROLES = [
  "APP_OWNER",
  "SUPER_ADMIN",
  "CAMPUS_ADMIN",
  "ADMIN",
  "PRINCIPAL",
  "TEACHER",
  "PARENT",
  "STUDENT",
  "ACCOUNTANT",
  "LIBRARIAN",
  "RECEPTIONIST",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  APP_OWNER: "App Owner",
  SUPER_ADMIN: "Super Admin",
  CAMPUS_ADMIN: "Campus Admin",
  ADMIN: "Campus Admin",
  PRINCIPAL: "Principal",
  TEACHER: "Teacher",
  PARENT: "Parent",
  STUDENT: "Student",
  ACCOUNTANT: "Accountant",
  LIBRARIAN: "Librarian",
  RECEPTIONIST: "Receptionist",
};

export const ROLE_DASHBOARD_PATHS: Record<UserRole, string> = {
  APP_OWNER: "/owner",
  SUPER_ADMIN: "/super",
  CAMPUS_ADMIN: "/admin",
  ADMIN: "/admin",
  PRINCIPAL: "/principal",
  TEACHER: "/teacher",
  PARENT: "/parent",
  STUDENT: "/student",
  ACCOUNTANT: "/accountant",
  LIBRARIAN: "/librarian",
  RECEPTIONIST: "/receptionist",
};

const ROLE_SET = new Set<string>(USER_ROLES);

export function isUserRole(role: unknown): role is UserRole {
  return typeof role === "string" && ROLE_SET.has(role);
}

export function normalizeUserRole(role: unknown): UserRole | null {
  return isUserRole(role) ? role : null;
}

export function dashboardPathForRole(role: unknown): string {
  const normalized = normalizeUserRole(role);
  return normalized ? ROLE_DASHBOARD_PATHS[normalized] : "/login";
}

export const ROLE_LABELS_AR: Record<UserRole, string> = { APP_OWNER: "مشغّل المنصة", SUPER_ADMIN: "مدير المجموعة", ADMIN: "مدير المدرسة", CAMPUS_ADMIN: "مدير الفرع", PRINCIPAL: "المدير الأكاديمي", TEACHER: "المعلم", PARENT: "ولي الأمر", STUDENT: "الطالب", ACCOUNTANT: "المحاسب", LIBRARIAN: "أمين المكتبة", RECEPTIONIST: "موظف الاستقبال" };
export const ROLE_LABELS_UR: Record<UserRole, string> = { APP_OWNER: "پلیٹ فارم آپریٹر", SUPER_ADMIN: "ادارے کا منتظم", ADMIN: "اسکول منتظم", CAMPUS_ADMIN: "کیمپس منتظم", PRINCIPAL: "تعلیمی سربراہ", TEACHER: "استاد", PARENT: "والدین", STUDENT: "طالب علم", ACCOUNTANT: "اکاؤنٹنٹ", LIBRARIAN: "لائبریرین", RECEPTIONIST: "استقبالیہ عملہ" };

export function roleLabel(role: unknown, language: "en" | "ar" | "ur" = "en"): string {
  const normalized = normalizeUserRole(role);
  return normalized ? (language === "ar" ? ROLE_LABELS_AR[normalized] : language === "ur" ? ROLE_LABELS_UR[normalized] : ROLE_LABELS[normalized]) : "User";
}

/**
 * Mode-aware role label (§1.5). The same ADMIN role reads "School admin" in a standalone school (one person, both
 * hats) and "Campus admin" in a school group; SUPER_ADMIN is the "Group admin". Returned in English by default —
 * clients translate it through the UI dictionary (role-ux p1 messages) so a language switch needs no refetch.
 */
const MODE_LABELS = {
  groupAdmin: { en: "Group admin", ar: "مدير المجموعة", ur: "ادارے کا منتظم" },
  schoolAdmin: { en: "School admin", ar: "مدير المدرسة", ur: "اسکول منتظم" },
  campusAdmin: { en: "Campus admin", ar: "مدير الفرع", ur: "کیمپس منتظم" },
  platformOperator: { en: "Platform operator", ar: "مشغّل المنصة", ur: "پلیٹ فارم آپریٹر" },
} as const;

export function roleLabelFor(user: { role: UserRole; institutionKind?: InstitutionKind }, language: "en" | "ar" | "ur" = "en"): string {
  const key = user.role === "SUPER_ADMIN" ? "groupAdmin"
    : user.role === "ADMIN" && user.institutionKind === "STANDALONE" ? "schoolAdmin"
    : user.role === "ADMIN" || user.role === "CAMPUS_ADMIN" ? "campusAdmin"
    : user.role === "APP_OWNER" ? "platformOperator"
    : null;
  return key ? MODE_LABELS[key][language] : roleLabel(user.role, language);
}

export function isCampusAdminRole(role: unknown): role is "CAMPUS_ADMIN" | "ADMIN" {
  return role === "CAMPUS_ADMIN" || role === "ADMIN";
}

export function isStaffRole(role: unknown): boolean {
  return isUserRole(role) && !["APP_OWNER", "SUPER_ADMIN", "PARENT", "STUDENT"].includes(role);
}

export function canAccessRoleDashboard(role: unknown, pathname: string): boolean {
  const normalized = normalizeUserRole(role);
  if (!normalized) return false;

  if (pathname.startsWith("/owner")) return normalized === "APP_OWNER";
  if (pathname.startsWith("/super")) return normalized === "SUPER_ADMIN";
  if (pathname.startsWith("/accountant")) return normalized === "ACCOUNTANT";
  if (pathname.startsWith("/librarian")) return normalized === "LIBRARIAN";
  if (pathname.startsWith("/receptionist")) return normalized === "RECEPTIONIST";
  // The campus console is a campus-admin tool: everything on it is fed by
  // getCampusDashboardData(), which refuses any other role. Admitting every
  // staff role here did not grant them anything — the server action and the
  // APIs behind it all say no — it just landed teachers, accountants,
  // librarians and receptionists on a console that failed to load, with a
  // toast instead of a door. They each have their own console; send them
  // to /403 and let the redirect there take them home.
  if (pathname.startsWith("/admin")) return isCampusAdminRole(normalized);
  if (pathname.startsWith("/principal")) return normalized === "PRINCIPAL";
  if (pathname.startsWith("/teacher")) return normalized === "TEACHER";
  if (pathname.startsWith("/parent")) return normalized === "PARENT";
  // Families each have their own portal: a guardian opening /student/* is sent to the matching /parent page by
  // roleGuardRedirect before this runs, so the learner portal admits learners only (G44).
  if (pathname.startsWith("/student")) return normalized === "STUDENT";
  // The legacy /dashboard routes are a single server redirect page now (§6.1): every signed-in staff role and
  // the group admin may reach it, and it sends each one to the matching view of their own console (G45).
  if (pathname.startsWith("/dashboard")) return isStaffRole(normalized) || normalized === "SUPER_ADMIN";

  return true;
}

const within = (pathname: string, root: string) => pathname === root || pathname.startsWith(`${root}/`);

/** Pages every family account may open besides its own portal (G44). Anything else is a staff page. */
const FAMILY_SHARED_PAGES = ["/messages", "/corrections", "/parent-invitations", "/account", "/school-capture", "/subscription-suspended", "/403", "/first-login"];
/** A guardian pays fees online through the development sandbox card form (`/api/fees/pay-online`, matrix #79). Learners
 *  never pay (G44a), and outside development the provider's hosted page is used, so this is the guardian's only extra page. */
const PARENT_SHARED_PAGES = ["/safepay"];
/** Module routes with a family destination (§6.3): an old link lands on the same thing inside the family portal. */
const FAMILY_MODULE_PAGE: Record<"PARENT" | "STUDENT", Record<string, string>> = {
  PARENT: { "/pickup": "/parent/pickup", "/transport": "/parent/pickup", "/activities": "/parent/activities", "/accommodations": "/parent/access" },
  STUDENT: { "/accommodations": "/student/access" },
};
/** A guardian who follows a learner link lands on the same thing in the family portal (§6.3). */
const PARENT_FOR_STUDENT_PAGE: Record<string, string> = {
  reports: "/parent/results",
  fees: "/parent/fees",
  attendance: "/parent/attendance",
  timetable: "/parent/timetable",
  assignments: "/parent/assignments",
};
/** The platform operator works in /owner; school module pages are not theirs. */
const PLATFORM_OWNER_PAGES = ["/owner", "/account", "/403", "/first-login"];
/** Platform workflows share /ai with school assessment pages; admit only the owner workspace pages. */
export const PLATFORM_OWNER_AI_PAGES: readonly string[] = ["/ai", "/ai/setup", "/ai/can-do", "/ai/waiting", "/ai/knowledge"];

/**
 * The proxy's role decision for a signed-in request, as a pure function (G44, G45; tested in
 * tests/authz/proxy-guard.test.ts). Returns where to send the request, or null to let it through.
 * - API paths are never redirected here: every route handler keeps its own gate (K-B1).
 * - Families default-deny on pages: their portal plus a short shared list; a module route with a family
 *   destination (§6.3: pickup, transport, activities, accommodations) goes there; everything else goes home
 *   (never /403, and never a loop: home itself is always allowed).
 * - APP_OWNER on school module pages goes to /owner.
 * - Staff opening another role's console get the /403 page, which explains and links home.
 */
export function roleGuardRedirect(role: UserRole, pathname: string): string | null {
  if (within(pathname, "/api")) return null;
  const home = dashboardPathForRole(role);
  if (role === "PARENT" || role === "STUDENT") {
    if (["/ai", "/ai/can-do", "/ai/waiting", "/ai/knowledge"].includes(pathname.replace(/\/$/, "")) || /^\/ai\/knowledge\/[a-zA-Z0-9-]+\/?$/.test(pathname)) return null;
    if (role === "PARENT" && within(pathname, "/student")) return PARENT_FOR_STUDENT_PAGE[pathname.split("/")[2] ?? ""] ?? "/parent";
    if (role === "PARENT" && within(pathname, "/parent")) return null;
    if (role === "STUDENT" && (within(pathname, "/student") || within(pathname, "/ai/exams"))) return null;
    if (FAMILY_SHARED_PAGES.some((page) => within(pathname, page))) return null;
    if (role === "PARENT" && PARENT_SHARED_PAGES.some((page) => within(pathname, page))) return null;
    const moduleRoot = `/${pathname.split("/")[1] ?? ""}`;
    const moduleTarget = FAMILY_MODULE_PAGE[role][moduleRoot];
    if (moduleTarget) return moduleTarget;
    // /settings/locale: families change their language from their own portal's settings (§6.3).
    if (within(pathname, "/settings/locale")) return `${home}?${new URLSearchParams({ settings: "language" })}`;
    return within(pathname, home) ? null : home;
  }
  if (role === "APP_OWNER") return PLATFORM_OWNER_AI_PAGES.includes(pathname.replace(/\/$/, "")) || /^\/ai\/knowledge\/[a-zA-Z0-9-]+\/?$/.test(pathname) || PLATFORM_OWNER_PAGES.some((page) => within(pathname, page)) ? null : "/owner";
  return canAccessRoleDashboard(role, pathname) ? null : "/403";
}
