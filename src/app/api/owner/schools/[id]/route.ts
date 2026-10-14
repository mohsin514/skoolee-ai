import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, errorResponse, requirePlatformOwner } from "@/lib/api/scope";
import { logSuperAdminAction } from "@/lib/audit";
import { createPlanContract } from "@/config/commercial-contract";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePlatformOwner();

    const { id } = await params;

    const school = await prisma.school.findUnique({
      where: { id },
      include: {
        campuses: {
          select: {
            id: true,
            name: true,
            city: true,
            address: true,
            _count: { select: { students: true, users: true, classes: true } },
          },
        },
        users: {
          where: { role: "SUPER_ADMIN" },
          select: { id: true, fullName: true, email: true, phone: true, isActive: true, lastLogin: true },
        },
        _count: { select: { users: true, campuses: true } },
      },
    });

    if (!school) throw new ApiError("School not found", 404);

    return Response.json({ success: true, data: school });
  } catch (error) {
    return errorResponse(error, "[owner/schools/id] GET failed");
  }
}

const VALID_PLANS = ["FREE", "BASIC", "PRO", "ENTERPRISE"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePlatformOwner();

    const { id } = await params;
    const body = await req.json();
    const { plan, status } = body;

    const school = await prisma.school.findUnique({
      where: { id },
      select: { id: true, name: true, status: true, plan: true },
    });

    if (!school) throw new ApiError("School not found", 404);

    const updateData: Record<string, any> = {};

    if (plan) {
      if (!VALID_PLANS.includes(plan)) {
        throw new ApiError("plan must be one of: " + VALID_PLANS.join(", "), 400);
      }
      const commercialContract = createPlanContract(plan);
      updateData.plan = plan;
      updateData.commercialContract = commercialContract;
      updateData.aiCreditsLimit = commercialContract.aiCredits;
    }

    if (status) {
      if (!["ACTIVE", "SUSPENDED"].includes(status)) {
        throw new ApiError("status must be ACTIVE or SUSPENDED", 400);
      }
      updateData.status = status;
      // Restoring a soft-deleted tenant clears the tombstone, otherwise the
      // school reads as ACTIVE while still carrying a deletedAt timestamp.
      if (school.status === "DELETED") updateData.deletedAt = null;
    }

    if (Object.keys(updateData).length === 0) {
      throw new ApiError("No valid fields to update (plan or status)", 400);
    }

    await prisma.school.update({
      where: { id },
      data: updateData,
    });

    const changedFields: string[] = [];
    if (plan && plan !== school.plan) changedFields.push("plan");
    if (status && status !== school.status) changedFields.push("status");

    if (changedFields.length > 0) {
      await logSuperAdminAction({
        userId: user.userId,
        action: "plan_changed",
        targetType: "school",
        targetId: id,
        targetName: school.name,
        oldValues: { plan: school.plan, status: school.status },
        newValues: { plan: plan || school.plan, status: status || school.status },
      }).catch(() => {});
    }

    return Response.json({
      success: true,
      message: `School updated: ${changedFields.join(", ")}`,
    });
  } catch (error) {
    return errorResponse(error, "[owner/schools/id] PATCH failed");
  }
}

// ─────────────────────────────────────────────────────────────────
// DELETE /api/owner/schools/<id>   — offboard a tenant.   (OWN-6, MF-3, INT-1)
//
// School offboarding is reversible. Permanent erasure requires the approved
// retention/legal workflow and is deliberately unavailable on this endpoint.
// ─────────────────────────────────────────────────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePlatformOwner();
    const { id } = await params;

    const body = await req.json().catch(() => ({}));
    const confirmName = typeof body?.confirmName === "string" ? body.confirmName : "";
    const purge = body?.purge === true;

    if (purge) {
      throw new ApiError("Permanent erasure is not available through the routine school lifecycle endpoint. Use the institution's approved retention and legal process.", 409);
    }

    const school = await prisma.school.findUnique({
      where: { id },
      select: { id: true, name: true, status: true, _count: { select: { users: true, campuses: true } } },
    });
    if (!school) throw new ApiError("School not found", 404);

    // Typed-name confirmation. Compared exactly — a destructive action should
    // not be satisfied by a near miss.
    if (confirmName !== school.name) {
      throw new ApiError(
        `Confirmation failed. Type the school name exactly to confirm: "${school.name}"`,
        400
      );
    }

    if (school.status === "DELETED") {
      throw new ApiError("School is already deleted.", 409);
    }

    await prisma.school.update({
      where: { id },
      data: { status: "DELETED", deletedAt: new Date() },
    });

    await logSuperAdminAction({
      userId: user.userId,
      action: "delete_school",
      targetType: "school",
      targetId: id,
      targetName: school.name,
      oldValues: { status: school.status },
      newValues: { status: "DELETED" },
    }).catch(() => {});

    return Response.json({
      success: true,
      purged: false,
      message: `"${school.name}" has been archived. Its data is retained and the school can be restored.`,
    });
  } catch (error) {
    return errorResponse(error, "[owner/schools/id] DELETE failed");
  }
}
