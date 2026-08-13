import { prisma } from "@/lib/db/prisma";
import type { AuthUser } from "@/lib/auth";
import type { UserRole } from "@/lib/roles";

export type PermissionAction = "view" | "add" | "edit" | "delete";

export const PERMISSION_MODULES = [
  "students",
  "fees",
  "payroll",
  "leave",
  "attendance",
  "timetable",
  "exams",
  "reports",
  "staff",
  "admissions",
  "accounts",
  "ai",
  "library",
  "front-desk",
  "transport",
  "inventory",
  "dormitory",
] as const;

export type PermissionModule = (typeof PERMISSION_MODULES)[number];

export interface PermissionFlags {
  canView: boolean;
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

// APP_OWNER and SUPER_ADMIN are fixed — full access, never editable.
// Everyone else starts from these sensible defaults, which admins can
// override per role per module.
const DEFAULT_MATRIX: Record<PermissionModule, PermissionFlags> = {
  students: { canView: true, canAdd: true, canEdit: true, canDelete: true },
  fees: { canView: true, canAdd: true, canEdit: true, canDelete: true },
  payroll: { canView: true, canAdd: true, canEdit: true, canDelete: true },
  leave: { canView: true, canAdd: true, canEdit: true, canDelete: true },
  attendance: { canView: true, canAdd: true, canEdit: true, canDelete: true },
  timetable: { canView: true, canAdd: true, canEdit: true, canDelete: true },
  exams: { canView: true, canAdd: true, canEdit: true, canDelete: true },
  reports: { canView: true, canAdd: true, canEdit: true, canDelete: true },
  staff: { canView: true, canAdd: true, canEdit: true, canDelete: true },
  admissions: { canView: true, canAdd: true, canEdit: true, canDelete: true },
  accounts: { canView: true, canAdd: true, canEdit: true, canDelete: true },
  ai: { canView: true, canAdd: true, canEdit: true, canDelete: true },
  library: { canView: true, canAdd: true, canEdit: true, canDelete: true },
  "front-desk": { canView: true, canAdd: true, canEdit: true, canDelete: true },
  transport: { canView: true, canAdd: true, canEdit: true, canDelete: true },
  inventory: { canView: true, canAdd: true, canEdit: true, canDelete: true },
  dormitory: { canView: true, canAdd: true, canEdit: true, canDelete: true },
};

export const DEFAULT_PERMISSIONS: Record<UserRole, Record<PermissionModule, PermissionFlags>> = {
  APP_OWNER: DEFAULT_MATRIX,
  SUPER_ADMIN: DEFAULT_MATRIX,
  CAMPUS_ADMIN: DEFAULT_MATRIX,
  ADMIN: DEFAULT_MATRIX,
  PRINCIPAL: DEFAULT_MATRIX,
  TEACHER: {
    students: { canView: true, canAdd: false, canEdit: false, canDelete: false },
    fees: { canView: false, canAdd: false, canEdit: false, canDelete: false },
    payroll: { canView: false, canAdd: false, canEdit: false, canDelete: false },
    leave: { canView: true, canAdd: true, canEdit: false, canDelete: false },
    attendance: { canView: true, canAdd: true, canEdit: false, canDelete: false },
    timetable: { canView: true, canAdd: false, canEdit: false, canDelete: false },
    // Teachers create their own quizzes and class tests. The exam-type check in
    // the exams API is what keeps them out of mid-term and final exams.
    exams: { canView: true, canAdd: true, canEdit: true, canDelete: false },
    reports: { canView: true, canAdd: false, canEdit: false, canDelete: false },
    staff: { canView: false, canAdd: false, canEdit: false, canDelete: false },
    admissions: { canView: false, canAdd: false, canEdit: false, canDelete: false },
    accounts: { canView: false, canAdd: false, canEdit: false, canDelete: false },
    ai: { canView: true, canAdd: true, canEdit: false, canDelete: false },
    library: { canView: false, canAdd: false, canEdit: false, canDelete: false },
    "front-desk": { canView: false, canAdd: false, canEdit: false, canDelete: false },
    transport: { canView: false, canAdd: false, canEdit: false, canDelete: false },
    inventory: { canView: false, canAdd: false, canEdit: false, canDelete: false },
    dormitory: { canView: false, canAdd: false, canEdit: false, canDelete: false },
  },
  PARENT: {
    students: { canView: true, canAdd: false, canEdit: false, canDelete: false },
    fees: { canView: true, canAdd: false, canEdit: false, canDelete: false },
    payroll: { canView: false, canAdd: false, canEdit: false, canDelete: false },
    leave: { canView: false, canAdd: false, canEdit: false, canDelete: false },
    attendance: { canView: true, canAdd: false, canEdit: false, canDelete: false },
    timetable: { canView: true, canAdd: false, canEdit: false, canDelete: false },
    exams: { canView: true, canAdd: false, canEdit: false, canDelete: false },
    reports: { canView: true, canAdd: false, canEdit: false, canDelete: false },
    staff: { canView: false, canAdd: false, canEdit: false, canDelete: false },
    admissions: { canView: false, canAdd: false, canEdit: false, canDelete: false },
    accounts: { canView: false, canAdd: false, canEdit: false, canDelete: false },
    ai: { canView: false, canAdd: false, canEdit: false, canDelete: false },
    library: { canView: false, canAdd: false, canEdit: false, canDelete: false },
    "front-desk": { canView: false, canAdd: false, canEdit: false, canDelete: false },
    transport: { canView: false, canAdd: false, canEdit: false, canDelete: false },
    inventory: { canView: false, canAdd: false, canEdit: false, canDelete: false },
    dormitory: { canView: false, canAdd: false, canEdit: false, canDelete: false },
  },
  STUDENT: {
    students: { canView: true, canAdd: false, canEdit: false, canDelete: false },
    fees: { canView: true, canAdd: false, canEdit: false, canDelete: false },
    payroll: { canView: false, canAdd: false, canEdit: false, canDelete: false },
    leave: { canView: false, canAdd: false, canEdit: false, canDelete: false },
    attendance: { canView: true, canAdd: false, canEdit: false, canDelete: false },
    timetable: { canView: true, canAdd: false, canEdit: false, canDelete: false },
    exams: { canView: true, canAdd: false, canEdit: false, canDelete: false },
    reports: { canView: true, canAdd: false, canEdit: false, canDelete: false },
    staff: { canView: false, canAdd: false, canEdit: false, canDelete: false },
    admissions: { canView: false, canAdd: false, canEdit: false, canDelete: false },
    accounts: { canView: false, canAdd: false, canEdit: false, canDelete: false },
    ai: { canView: false, canAdd: false, canEdit: false, canDelete: false },
    library: { canView: false, canAdd: false, canEdit: false, canDelete: false },
    "front-desk": { canView: false, canAdd: false, canEdit: false, canDelete: false },
    transport: { canView: false, canAdd: false, canEdit: false, canDelete: false },
    inventory: { canView: false, canAdd: false, canEdit: false, canDelete: false },
    dormitory: { canView: false, canAdd: false, canEdit: false, canDelete: false },
  },
  ACCOUNTANT: {
    students: { canView: true, canAdd: false, canEdit: false, canDelete: false },
    fees: { canView: true, canAdd: true, canEdit: true, canDelete: false },
    payroll: { canView: true, canAdd: false, canEdit: false, canDelete: false },
    leave: { canView: true, canAdd: false, canEdit: false, canDelete: false },
    attendance: { canView: true, canAdd: false, canEdit: false, canDelete: false },
    timetable: { canView: false, canAdd: false, canEdit: false, canDelete: false },
    exams: { canView: false, canAdd: false, canEdit: false, canDelete: false },
    reports: { canView: true, canAdd: false, canEdit: false, canDelete: false },
    staff: { canView: true, canAdd: false, canEdit: false, canDelete: false },
    admissions: { canView: false, canAdd: false, canEdit: false, canDelete: false },
    accounts: { canView: true, canAdd: true, canEdit: true, canDelete: false },
    ai: { canView: false, canAdd: false, canEdit: false, canDelete: false },
    library: { canView: false, canAdd: false, canEdit: false, canDelete: false },
    "front-desk": { canView: false, canAdd: false, canEdit: false, canDelete: false },
    transport: { canView: false, canAdd: false, canEdit: false, canDelete: false },
    inventory: { canView: false, canAdd: false, canEdit: false, canDelete: false },
    dormitory: { canView: false, canAdd: false, canEdit: false, canDelete: false },
  },
  LIBRARIAN: {
    students: { canView: true, canAdd: false, canEdit: false, canDelete: false },
    fees: { canView: false, canAdd: false, canEdit: false, canDelete: false },
    payroll: { canView: false, canAdd: false, canEdit: false, canDelete: false },
    leave: { canView: true, canAdd: false, canEdit: false, canDelete: false },
    attendance: { canView: false, canAdd: false, canEdit: false, canDelete: false },
    timetable: { canView: false, canAdd: false, canEdit: false, canDelete: false },
    exams: { canView: false, canAdd: false, canEdit: false, canDelete: false },
    reports: { canView: true, canAdd: false, canEdit: false, canDelete: false },
    staff: { canView: false, canAdd: false, canEdit: false, canDelete: false },
    admissions: { canView: false, canAdd: false, canEdit: false, canDelete: false },
    accounts: { canView: false, canAdd: false, canEdit: false, canDelete: false },
    ai: { canView: false, canAdd: false, canEdit: false, canDelete: false },
    library: { canView: true, canAdd: true, canEdit: true, canDelete: true },
    "front-desk": { canView: false, canAdd: false, canEdit: false, canDelete: false },
    transport: { canView: false, canAdd: false, canEdit: false, canDelete: false },
    inventory: { canView: false, canAdd: false, canEdit: false, canDelete: false },
    dormitory: { canView: false, canAdd: false, canEdit: false, canDelete: false },
  },
  RECEPTIONIST: {
    students: { canView: true, canAdd: false, canEdit: false, canDelete: false },
    fees: { canView: true, canAdd: true, canEdit: false, canDelete: false },
    payroll: { canView: false, canAdd: false, canEdit: false, canDelete: false },
    leave: { canView: true, canAdd: true, canEdit: false, canDelete: false },
    attendance: { canView: true, canAdd: true, canEdit: false, canDelete: false },
    timetable: { canView: true, canAdd: false, canEdit: false, canDelete: false },
    exams: { canView: false, canAdd: false, canEdit: false, canDelete: false },
    reports: { canView: true, canAdd: false, canEdit: false, canDelete: false },
    staff: { canView: false, canAdd: false, canEdit: false, canDelete: false },
    admissions: { canView: true, canAdd: true, canEdit: false, canDelete: false },
    accounts: { canView: false, canAdd: false, canEdit: false, canDelete: false },
    ai: { canView: false, canAdd: false, canEdit: false, canDelete: false },
    library: { canView: false, canAdd: false, canEdit: false, canDelete: false },
    "front-desk": { canView: true, canAdd: true, canEdit: true, canDelete: true },
    transport: { canView: false, canAdd: false, canEdit: false, canDelete: false },
    inventory: { canView: false, canAdd: false, canEdit: false, canDelete: false },
    dormitory: { canView: false, canAdd: false, canEdit: false, canDelete: false },
  },
};

export const FIXED_PERMISSION_ROLES: UserRole[] = ["APP_OWNER", "SUPER_ADMIN"];

export function isFixedPermissionRole(role: UserRole | string | null | undefined) {
  return role === "APP_OWNER" || role === "SUPER_ADMIN";
}

export function defaultFlagsForRole(role: UserRole | string | null | undefined, module: string): PermissionFlags {
  if (isFixedPermissionRole(role)) return { canView: true, canAdd: true, canEdit: true, canDelete: true };
  const defaults = DEFAULT_PERMISSIONS[(role as UserRole)] ?? DEFAULT_PERMISSIONS.TEACHER;
  const flags = defaults[module as PermissionModule];
  return flags ?? { canView: false, canAdd: false, canEdit: false, canDelete: false };
}

export function moduleFlags(overrides: { module: string; canView: boolean; canAdd: boolean; canEdit: boolean; canDelete: boolean }[] | null | undefined, role: string, module: string): PermissionFlags {
  if (isFixedPermissionRole(role)) return { canView: true, canAdd: true, canEdit: true, canDelete: true };
  const override = overrides?.find((o) => o.module === module);
  const base = defaultFlagsForRole(role, module);
  return override
    ? { canView: override.canView, canAdd: override.canAdd, canEdit: override.canEdit, canDelete: override.canDelete }
    : base;
}

// ────────────────────────────────────────────────────────────
// Server-side enforcement. Read on every request so permission
// changes take effect without re-login.
// ────────────────────────────────────────────────────────────
const permissionCache = new Map<string, Promise<Map<string, PermissionFlags>>>();
const CACHE_TTL_MS = 5000;

export async function loadPermissionMap(schoolId: string, role: string): Promise<Map<string, PermissionFlags>> {
  const key = `${schoolId}:${role}`;
  const cached = permissionCache.get(key);
  if (cached) return cached;

  const promise = (async () => {
    const rows = await prisma.rolePermission.findMany({
      where: { schoolId, role: role as UserRole },
      select: { module: true, canView: true, canAdd: true, canEdit: true, canDelete: true },
    });
    const map = new Map<string, PermissionFlags>();
    for (const mod of PERMISSION_MODULES) {
      map.set(mod, moduleFlags(rows as any, role, mod));
    }
    setTimeout(() => permissionCache.delete(key), CACHE_TTL_MS);
    return map;
  })();
  permissionCache.set(key, promise);
  return promise;
}

export async function assertPermission(user: AuthUser, module: PermissionModule, action: PermissionAction) {
  if (isFixedPermissionRole(user.role)) return true;
  const map = await loadPermissionMap(user.schoolId, user.role);
  const flags = map.get(module);
  const allowed = flags ? flags[actionToFlag(action)] : false;
  if (!allowed) {
    const error = new Error(`Insufficient permissions: ${module}.${action} denied for ${user.role}`);
    (error as Error & { status?: number }).status = 403;
    throw error;
  }
  return true;
}

function actionToFlag(action: PermissionAction): keyof PermissionFlags {
  return ("can" + action.charAt(0).toUpperCase() + action.slice(1)) as keyof PermissionFlags;
}
