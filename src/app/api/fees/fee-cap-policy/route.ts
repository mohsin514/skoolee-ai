import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { ApiError, assertFeesRead, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { parseBody } from "@/lib/api/validate";
import { FEE_CAP_FRAMEWORKS, FEE_CAP_MODES } from "@/lib/fees/regulator-cap";

// SKAI-1154: the school's opt-in regulator fee cap. Finance staff read it; only school-wide admins change it.
const policyBody = z.object({
  mode: z.enum(FEE_CAP_MODES),
  framework: z.enum(FEE_CAP_FRAMEWORKS).default("KHDA_ECI"),
});

const SELECT = { feeCapMode: true, feeCapFramework: true } as const;
const canEditPolicy = (role: string) => role === "SUPER_ADMIN" || role === "ADMIN";

export async function GET() {
  try {
    const user = await requireAuthUser();
    await assertFeesRead(user);
    const school = await prisma.school.findUnique({ where: { id: user.schoolId }, select: SELECT });
    if (!school) throw new ApiError("School not found", 404);
    return Response.json({ success: true, data: { mode: school.feeCapMode, framework: school.feeCapFramework, canEdit: canEditPolicy(user.role) } });
  } catch (error) {
    return errorResponse(error, "[fees/fee-cap-policy] GET failed");
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canEditPolicy(user.role)) throw new ApiError("Only a school administrator can change the fee cap policy", 403);
    const body = await parseBody(req, policyBody);
    const before = await prisma.school.findUnique({ where: { id: user.schoolId }, select: SELECT });
    if (!before) throw new ApiError("School not found", 404);
    const school = await prisma.school.update({
      where: { id: user.schoolId },
      data: { feeCapMode: body.mode, feeCapFramework: body.framework },
      select: SELECT,
    });
    await prisma.auditLog.create({
      data: {
        tableName: "school_fee_cap_policy",
        recordId: user.schoolId,
        oldValue: before,
        newValue: school,
        userId: user.userId,
      },
    });
    return Response.json({ success: true, data: { mode: school.feeCapMode, framework: school.feeCapFramework } });
  } catch (error) {
    return errorResponse(error, "[fees/fee-cap-policy] PUT failed");
  }
}
