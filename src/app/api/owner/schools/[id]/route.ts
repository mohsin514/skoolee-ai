import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, errorResponse, requirePlatformOwner } from "@/lib/api/scope";
import { logSuperAdminAction } from "@/lib/audit";

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
      updateData.plan = plan;
    }

    if (status) {
      if (!["ACTIVE", "SUSPENDED"].includes(status)) {
        throw new ApiError("status must be ACTIVE or SUSPENDED", 400);
      }
      updateData.status = status;
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
