import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { inviteStaff, removeStaff, cancelInvitation, resendInvitation } from "@/app/actions/invite";
import { ApiError, assertModuleRead, canManageAcademics, canManageCampusOps, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";
import { isInstitutionAuthority } from "@/lib/auth/institution";

const STAFF_ROLES = new Set(["CAMPUS_ADMIN", "ADMIN", "PRINCIPAL", "TEACHER"]);

/** Staff writes are campus operations (§7.6 G23) AND a membership right (§2.2 #6: the institution authority, or a
 *  campus admin holding the delegated `canManageMemberships` flag; PR —). The flag never opens the path to a role
 *  outside campus operations (a principal holding a stale delegated flag is refused). The invite actions below
 *  still apply their own membership gates. */
async function assertStaffWriter() {
  const user = await requireAuthUser();
  if (!canManageCampusOps(user) || !(isInstitutionAuthority(user) || user.canManageMemberships === true)) {
    throw new ApiError("Staff invitations are managed by your campus admin.", 403);
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    // The principal reads the staff list (academic oversight); writes are campus operations.
    if (!canManageAcademics(user)) throw new ApiError("Insufficient permissions", 403);
    // The role gate alone ignored the staff.view bit, so revoking it in the
    // permission matrix had no effect on this list (§10.2).
    await assertModuleRead(user, "staff");
    const { searchParams } = new URL(req.url);
    const requestedCampusId = searchParams.get("campusId");
    const campusId = await resolveCampusId(user, requestedCampusId);
    const roleParam = searchParams.get("role") || searchParams.get("roles");
    const roles = roleParam
      ? roleParam.split(",").map((role) => role.trim().toUpperCase()).filter((role) => STAFF_ROLES.has(role))
      : ["CAMPUS_ADMIN", "ADMIN", "PRINCIPAL", "TEACHER"];
    const includeInactive = searchParams.get("includeInactive") === "true";

    const [staff, invitations] = await Promise.all([
      prisma.user.findMany({
        where: {
          schoolId: user.schoolId,
          campusId,
          role: { in: roles as any },
          ...(includeInactive ? {} : { isActive: true }),
        },
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          phone: true,
          isActive: true,
          onboardingComplete: true,
          _count: { select: { taughtSubjects: true, ledClasses: true } },
        },
        orderBy: [{ role: "asc" }, { fullName: "asc" }],
      }),
      prisma.staffInvitation.findMany({
        where: {
          campusId,
          role: { in: roles as any },
          status: "pending",
          campus: { schoolId: user.schoolId },
        },
        select: { id: true, email: true, role: true, status: true, deliveryStatus: true, lastDeliveryAt: true, expiresAt: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return Response.json({ success: true, staff, invitations });
  } catch (error) {
    return errorResponse(error, "[staff] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    await assertStaffWriter();
    const body = await req.json();
    const result = await inviteStaff(body);
    return Response.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error, "[staff] POST failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await assertStaffWriter();
    const body = await req.json();
    if (!body.userId) throw new ApiError("userId is required", 400);
    const result = await removeStaff(body.userId);
    return Response.json(result);
  } catch (error) {
    return errorResponse(error, "[staff] PATCH failed");
  }
}

export async function PUT(req: NextRequest) {
  try {
    await assertStaffWriter();
    const body = await req.json();
    if (!body.inviteId) throw new ApiError("inviteId is required", 400);
    const result = await resendInvitation(body.inviteId);
    return Response.json(result);
  } catch (error) {
    return errorResponse(error, "[staff] PUT failed");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await assertStaffWriter();
    const { searchParams } = new URL(req.url);
    const inviteId = searchParams.get("inviteId");
    if (!inviteId) throw new ApiError("inviteId is required", 400);
    const result = await cancelInvitation(inviteId);
    return Response.json(result);
  } catch (error) {
    return errorResponse(error, "[staff] DELETE failed");
  }
}
