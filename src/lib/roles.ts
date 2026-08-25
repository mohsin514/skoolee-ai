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

export function roleLabel(role: unknown): string {
  const normalized = normalizeUserRole(role);
  return normalized ? ROLE_LABELS[normalized] : "User";
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
  if (pathname.startsWith("/admin")) return isCampusAdminRole(normalized) || isStaffRole(normalized);
  if (pathname.startsWith("/principal")) return normalized === "PRINCIPAL";
  if (pathname.startsWith("/teacher")) return normalized === "TEACHER";
  if (pathname.startsWith("/parent")) return normalized === "PARENT";
  if (pathname.startsWith("/student")) return normalized === "STUDENT" || normalized === "PARENT";
  if (pathname.startsWith("/dashboard")) return normalized !== "PRINCIPAL" && normalized !== "SUPER_ADMIN" && normalized !== "APP_OWNER";

  return true;
}
