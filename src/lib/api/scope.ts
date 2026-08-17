import { prisma } from "@/lib/db/prisma";
import { getAuthUser, type AuthUser } from "@/lib/auth";
import { enterUnscoped } from "@/lib/db/tenant-context";
import { isCampusAdminRole } from "@/lib/roles";
import { assertSchoolOperational, BillingAccessError } from "@/lib/billing/entitlements";
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
    try {
      await assertSchoolOperational(user.schoolId);
    } catch (error) {
      // A cookie naming a school that no longer exists is an invalid *session*,
      // not a billing state. Reported as 404 "School not found" it left the
      // user on the "Operations Locked" screen indefinitely, with no sign-out
      // path — the only escape was clearing cookies by hand. 401 lets the
      // client tear the session down and send them back to sign in.
      if (error instanceof BillingAccessError && error.status === 404) {
        throw new ApiError("Your session is no longer valid. Please sign in again.", 401);
      }
      throw error;
    }
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

/**
 * Students and guardians. They are authenticated, but they are *outside* the
 * staff boundary: every route that returns roster-wide data (other children's
 * PII, campus-wide schedules, staff records) must exclude them explicitly.
 * requireAuthUser() alone is not a sufficient gate for those routes.
 */
export function isFamilyRole(user: AuthUser) {
  return user.role === "STUDENT" || user.role === "PARENT";
}

/**
 * Guard for staff-only reads. Families get their own data through the
 * dedicated /student and /parent endpoints, never through roster routes.
 */
export function assertStaffRole(user: AuthUser) {
  if (isFamilyRole(user)) {
    throw new ApiError("This data is not available to student or guardian accounts", 403);
  }
}

/**
 * Guard for campus-wide financial reads.
 *
 * The fee ledger names children and what their families owe. Several of these
 * routes carried no role gate at all — a student could read another family's
 * invoice, and the campus revenue summary, straight from the API.
 *
 * Families are excluded outright: they reach their own fees through
 * /api/fees/student/<id>, the invoice PDF and the parent portal. Staff are then
 * checked against the fees module in the permission matrix, which already had
 * the right answers — a librarian has no fees access, an accountant does — and
 * was simply never consulted here.
 */
export async function assertFeesRead(user: AuthUser) {
  return assertModuleRead(user, "fees");
}

/**
 * Guard for reading an operational module.
 *
 * Across library, dormitory, transport, inventory, accounts, front-desk, leave
 * and payroll, the write methods were gated but the GET handlers stopped at
 * requireAuthUser(). The effect was that any signed-in account — including
 * every student and guardian — could read the general ledger, the school's bank
 * accounts, the visitor and complaints log, who had borrowed which library book
 * and the staff leave register.
 *
 * The permission matrix already held the correct answer for every one of these
 * (families are denied all of them; a teacher may see leave and nothing else;
 * admins and principals get the default full matrix). It was simply never
 * consulted on the read path.
 */
export async function assertModuleRead(user: AuthUser, module: PermissionModule) {
  assertStaffRole(user);
  await assertPermissionImpl(user, module, "view");
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
