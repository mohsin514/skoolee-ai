import { schoolPricingSchema } from "@/lib/owner/pricing";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, errorResponse, requirePlatformOwner } from "@/lib/api/scope";
import { logSuperAdminAction } from "@/lib/audit";
import { parseBody } from "@/lib/api/validate";
import { jsonObjectBody } from "@/lib/validators/route-bodies";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePlatformOwner();

    const { id } = await params;
    const body = await parseBody(req, jsonObjectBody);
    const parsed = schoolPricingSchema.safeParse(body?.pricing);
    if (!parsed.success) throw new ApiError("Provide valid plan prices: each price must be a finite non-negative number", 400);
    const pricing = parsed.data;

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
