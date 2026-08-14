import { prisma } from "@/lib/db/prisma";
import { getAuthUser, type AuthUser } from "@/lib/auth";
import { enterUnscoped } from "@/lib/db/tenant-context";
import { isCampusAdminRole } from "@/lib/roles";
import { assertSchoolOperational } from "@/lib/billing/entitlements";
import { assertPermission as assertPermissionImpl, type PermissionAction, type PermissionModule } from "@/lib/permissions";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function requireAuthUser(options: { allowSuspended?: boolean } = {}): Promise<AuthUser> {
  const user = await getAuthUser();
  if (!user) throw new ApiError("Unauthorized", 401);
  if (!options.allowSuspended) {
    await assertSchoolOperational(user.schoolId);
  }
  return user;
}

/**
 * Platform-operator entry point. The APP_OWNER administers every school, so
 * this is the one logged-in role whose work is legitimately cross-tenant.
 *
 * Authenticates, enforces the role, and only then stands the tenant guard
 * down for the rest of the request. Owner routes must use this rather than
 * calling runUnscoped()/enterUnscoped() directly, so the bypass can never
 * be reached without the role check that precedes it.
 */
export async function requirePlatformOwner(): Promise<AuthUser> {
  const user = await requireAuthUser({ allowSuspended: true });
  if (user.role !== "APP_OWNER") throw new ApiError("Forbidden", 403);

  enterUnscoped(`platform owner ${user.userId} administering all schools`);
  return user;
}

export function errorResponse(error: unknown, fallback = "Request failed") {
  if (error instanceof ApiError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof Error && "status" in error && typeof error.status === "number") {
    return Response.json({ error: error.message }, { status: error.status });
  }

  console.error(fallback, error);
  return Response.json({ error: fallback }, { status: 500 });
}

export function canManageOperations(user: AuthUser) {
  return user.role === "SUPER_ADMIN" || isCampusAdminRole(user.role) || user.role === "PRINCIPAL";
}

export function canManageLibrary(user: AuthUser) {
  return canManageOperations(user) || user.role === "LIBRARIAN";
}

export function canManageFrontDesk(user: AuthUser) {
  return canManageOperations(user) || user.role === "RECEPTIONIST";
}

export function canManageBilling(user: AuthUser) {
  return user.role === "SUPER_ADMIN" || isCampusAdminRole(user.role);
}

export function canMarkAttendance(user: AuthUser) {
  return canManageOperations(user) || user.role === "TEACHER";
}

// Server-side permission matrix check (Module 11). Call alongside
// canManageOperations in every admin route. Fixed roles (APP_OWNER,
// SUPER_ADMIN) always pass; everyone else is checked against the
// school's RolePermission overrides merged over role defaults.
export async function assertPermission(user: AuthUser, module: PermissionModule, action: PermissionAction) {
  return assertPermissionImpl(user, module, action);
}

export async function resolveCampusId(user: AuthUser, requestedCampusId?: string | null) {
  const campusId = user.role === "SUPER_ADMIN" ? requestedCampusId || user.campusId : user.campusId;

  if (!campusId) {
    throw new ApiError("campusId required", 400);
  }

  const campus = await prisma.campus.findFirst({
    where: { id: campusId, schoolId: user.schoolId },
    select: { id: true },
  });

  if (!campus) {
    throw new ApiError("Campus is outside your school", 403);
  }

  if (user.role !== "SUPER_ADMIN" && requestedCampusId && requestedCampusId !== campusId) {
    throw new ApiError("Campus is outside your account", 403);
  }

  return campusId;
}

export function scopedCampusWhere(user: AuthUser, campusId?: string | null) {
  return {
    campus: {
      schoolId: user.schoolId,
      ...(campusId ? { id: campusId } : {}),
    },
  };
}
