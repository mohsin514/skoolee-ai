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

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const { searchParams } = new URL(req.url);
    const requestedCampusId = searchParams.get("campusId");
    const classId = searchParams.get("classId");
    const campusId = user.role === "SUPER_ADMIN" && !requestedCampusId
      ? null
      : await resolveCampusId(user, requestedCampusId);

    const where: any = {};
    if (campusId) where.campusId = campusId;
    if (classId) where.classId = classId;
    where.campus = { schoolId: user.schoolId };

    const structures = await prisma.feeStructure.findMany({
      where,
      include: {
        class: { select: { id: true, name: true, section: true } },
        campus: { select: { id: true, name: true } },
      },
      orderBy: [{ activeFrom: "desc" }],
    });

    return Response.json({ success: true, data: structures });
  } catch (error) {
    return errorResponse(error, "[fees/structure] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);

    const body = await req.json();
    const parsed = feeStructureSchema.safeParse(body);
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      const msg = Object.entries(flat).map(([k, v]) => `${k}: ${v?.join(", ")}`).join("; ");
      return Response.json({ error: msg || "Validation failed" }, { status: 400 });
    }

    const campusId = await resolveCampusId(user, body.campusId);
    const activeFrom = new Date(parsed.data.activeFrom);
    const activeTo = parsed.data.activeTo ? new Date(parsed.data.activeTo) : null;
    const oneTimeFeesJson = parsed.data.oneTimeFeesJson ? JSON.parse(parsed.data.oneTimeFeesJson) : undefined;
    const discountRulesJson = parsed.data.discountRulesJson ? JSON.parse(parsed.data.discountRulesJson) : undefined;

    const existing = await prisma.feeStructure.findFirst({
      where: { classId: parsed.data.classId, activeFrom },
      select: { id: true },
    });

    const data: any = {
      campusId,
      classId: parsed.data.classId,
      monthlyFee: parsed.data.monthlyFee,
      oneTimeFeesJson: oneTimeFeesJson as any,
      installmentType: parsed.data.installmentType ?? undefined,
      discountRulesJson: discountRulesJson as any,
      lateFeePercentage: parsed.data.lateFeePercentage,
      compoundLateFee: parsed.data.compoundLateFee,
      taxPercentage: parsed.data.taxPercentage,
      activeFrom,
      activeTo,
    };

    let structure;
    if (existing) {
      data.updatedBy = user.userId;
      structure = await prisma.feeStructure.update({
        where: { id: existing.id },
        data,
        include: {
          class: { select: { id: true, name: true, section: true } },
        },
      });
    } else {
      data.createdBy = user.userId;
      structure = await prisma.feeStructure.create({
        data,
        include: {
          class: { select: { id: true, name: true, section: true } },
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        tableName: "fee_structure",
        recordId: structure.id,
        newValue: { classId: parsed.data.classId, monthlyFee: parsed.data.monthlyFee },
        userId: user.userId,
      },
    });

    return Response.json(
      {
        success: true,
        data: structure,
        message: `Fee structure ${existing ? "updated" : "created"} for ${structure.class.name}`,
      },
      { status: existing ? 200 : 201 }
    );
  } catch (error) {
    return errorResponse(error, "[fees/structure] POST failed");
  }
}
