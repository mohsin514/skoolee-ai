import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { logSuperAdminAction } from "@/lib/audit";
import { PLAN_ORDER } from "@/config/plans";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthUser({ allowSuspended: true });
    if (user.role !== "APP_OWNER") throw new ApiError("Forbidden", 403);

    const { id } = await params;
    const body = await req.json();
    const { pricing } = body;

    if (!pricing || typeof pricing !== "object") {
      throw new ApiError("pricing object is required", 400);
    }

    for (const key of Object.keys(pricing)) {
      if (!PLAN_ORDER.includes(key as any)) {
        throw new ApiError(`Invalid plan key: ${key}`, 400);
      }
      const p = pricing[key];
      if (p && typeof p === "object") {
        if (p.price !== undefined && (typeof p.price !== "number" || p.price < 0)) {
          throw new ApiError(`${key} price must be a non-negative number`, 400);
        }
      }
    }

    const school = await prisma.school.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!school) throw new ApiError("School not found", 404);

    await prisma.school.update({
      where: { id },
      data: { planPricing: pricing },
    });

    await logSuperAdminAction({
      userId: user.userId,
      action: "plan_pricing_updated",
      targetType: "school",
      targetId: id,
      targetName: school.name,
      newValues: { pricing },
    }).catch(() => {});

    return Response.json({
      success: true,
      message: "Plan pricing updated successfully",
    });
  } catch (error) {
    return errorResponse(error, "[owner/schools/id/pricing] PUT failed");
  }
}
