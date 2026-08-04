import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { feeStructureSchema } from "@/lib/validators/schemas";
import {
  ApiError,
  canManageOperations,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
} from "@/lib/api/scope";
import { notify } from "@/lib/notifications/in-app";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ structureId: string }> }
) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);

    const { structureId } = await params;
    const existing = await prisma.feeStructure.findFirst({
      where: { id: structureId, campus: { schoolId: user.schoolId } },
    });
    if (!existing) throw new ApiError("Fee structure not found", 404);

    const body = await req.json();
    const parsed = feeStructureSchema.safeParse(body);
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      const msg = Object.entries(flat).map(([k, v]) => `${k}: ${v?.join(", ")}`).join("; ");
      return Response.json({ error: msg || "Validation failed" }, { status: 400 });
    }

    const oneTimeFeesJson = parsed.data.oneTimeFeesJson ? JSON.parse(parsed.data.oneTimeFeesJson) : undefined;
    const discountRulesJson = parsed.data.discountRulesJson ? JSON.parse(parsed.data.discountRulesJson) : undefined;

    const structure = await prisma.feeStructure.update({
      where: { id: structureId },
      data: {
        classId: parsed.data.classId,
        monthlyFee: parsed.data.monthlyFee,
        oneTimeFeesJson: oneTimeFeesJson as any,
        installmentType: parsed.data.installmentType ?? undefined,
        discountRulesJson: discountRulesJson as any,
        lateFeePercentage: parsed.data.lateFeePercentage,
        compoundLateFee: parsed.data.compoundLateFee,
        taxPercentage: parsed.data.taxPercentage,
        activeFrom: new Date(parsed.data.activeFrom),
        activeTo: parsed.data.activeTo ? new Date(parsed.data.activeTo) : null,
        updatedBy: user.userId,
      },
      include: {
        class: { select: { id: true, name: true, section: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        tableName: "fee_structure",
        recordId: structure.id,
        newValue: { action: "update", classId: parsed.data.classId, monthlyFee: parsed.data.monthlyFee },
        userId: user.userId,
      },
    });

    notify("FEE_STRUCTURE_UPDATED", {
      schoolId: user.schoolId,
      campusId: user.campusId,
      actorId: user.userId,
      actorName: user.fullName,
      className: structure.class.name,
    });

    return Response.json({
      success: true,
      data: structure,
      message: `Fee structure updated for ${structure.class.name}`,
    });
  } catch (error) {
    return errorResponse(error, "[fees/structure] PUT failed");
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ structureId: string }> }
) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);

    const { structureId } = await params;
    const existing = await prisma.feeStructure.findFirst({
      where: { id: structureId, campus: { schoolId: user.schoolId } },
      include: { class: { select: { name: true } } },
    });
    if (!existing) throw new ApiError("Fee structure not found", 404);

    await prisma.feeStructure.update({
      where: { id: structureId },
      data: { activeTo: new Date(), updatedBy: user.userId },
    });

    await prisma.auditLog.create({
      data: {
        tableName: "fee_structure",
        recordId: structureId,
        newValue: { action: "deactivate" },
        userId: user.userId,
      },
    });

    return Response.json({
      success: true,
      message: `Fee structure deactivated for ${existing.class.name}`,
    });
  } catch (error) {
    return errorResponse(error, "[fees/structure] DELETE failed");
  }
}
