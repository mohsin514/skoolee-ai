import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { resolveStudentFees } from "@/lib/fees/compute";

// GET /api/fees/resolve?studentId=...&academicYear=YYYY
// Returns the full breakdown for a student: new-model layers first, legacy
// FeeStructure as fallback when no FeeGroupAssignment exists for the year.

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get("studentId");
    const requestedYear = Number(searchParams.get("academicYear") ?? new Date().getFullYear());

    if (!studentId) throw new ApiError("studentId required", 400);
    if (!Number.isInteger(requestedYear) || requestedYear < 2000) throw new ApiError("invalid academicYear", 400);

    const student = await prisma.student.findFirst({
      where: { id: studentId, campus: { schoolId: user.schoolId } },
      select: {
        id: true,
        fullName: true,
        rollNo: true,
        campusId: true,
        classId: true,
        categoryId: true,
      },
    });
    if (!student) throw new ApiError("Student not found", 404);

    // 1. New model: assignment for this class/year
    const assignment = await prisma.feeGroupAssignment.findFirst({
      where: { campusId: student.campusId, classId: student.classId, academicYear: requestedYear },
      include: {
        feeGroup: {
          include: {
            lines: { include: { feeType: { select: { id: true, name: true, code: true } } } },
          },
        },
      },
    });

    if (assignment) {
      const lines = assignment.feeGroup.lines.map((line) => ({
        id: line.id,
        typeName: line.feeType.name,
        typeCode: line.feeType.code,
        amount: line.amount,
        dueDate: line.dueDate,
      }));

      // Discounts: category auto-apply + explicit assignments (no double count)
      const categoryDiscounts = student.categoryId
        ? await prisma.feeDiscount.findMany({
            where: { campusId: student.campusId, categoryId: student.categoryId },
            select: { id: true, name: true, code: true, type: true, value: true },
          })
        : [];

      const explicitDiscounts = await prisma.feeDiscountAssignment.findMany({
        where: { studentId: student.id },
        include: { discount: { select: { id: true, name: true, code: true, type: true, value: true } } },
      });

      const seen = new Set(categoryDiscounts.map((d) => d.id));
      const discounts = [
        ...categoryDiscounts.map((d) => ({ ...d, type: d.type as "PERCENT" | "FLAT", source: "CATEGORY" as const })),
        ...explicitDiscounts
          .filter((a) => !seen.has(a.discount.id))
          .map((a) => ({ ...a.discount, type: a.discount.type as "PERCENT" | "FLAT", source: "EXPLICIT" as const })),
      ];

      const carryForward = await prisma.feeCarryForward.findUnique({
        where: { studentId_toAcademicYear: { studentId: student.id, toAcademicYear: requestedYear } },
      });

      const resolved = resolveStudentFees(lines, discounts, carryForward?.balance ?? 0);

      return Response.json({
        success: true,
        data: {
          mode: "layers",
          student: { id: student.id, fullName: student.fullName, rollNo: student.rollNo },
          feeGroup: { id: assignment.feeGroup.id, name: assignment.feeGroup.name },
          academicYear: requestedYear,
          ...resolved,
          carryForwardId: carryForward?.id ?? null,
        },
      });
    }

    // 2. Legacy fallback
    const legacy = await prisma.feeStructure.findFirst({
      where: { campusId: student.campusId, classId: student.classId },
      orderBy: { activeFrom: "desc" },
    });

    if (!legacy) {
      return Response.json({
        success: true,
        data: {
          mode: "none",
          student: { id: student.id, fullName: student.fullName, rollNo: student.rollNo },
          academicYear: requestedYear,
          lines: [],
          subtotal: 0,
          flatDiscounts: [],
          percentDiscounts: [],
          totalDiscount: 0,
          carryForwardBalance: 0,
          payable: 0,
          remainingCredit: 0,
        },
      });
    }

    const oneTime: Record<string, number> =
      typeof legacy.oneTimeFeesJson === "string"
        ? JSON.parse(legacy.oneTimeFeesJson ?? "{}")
        : (legacy.oneTimeFeesJson as Record<string, number> | null) ?? {};

    const lines = [
      { id: "legacy-monthly", typeName: "Monthly Tuition", typeCode: "MONTHLY_TUITION", amount: legacy.monthlyFee, dueDate: null as Date | null },
      ...Object.entries(oneTime).map(([name, amount], i) => ({
        id: `legacy-onetime-${i}`,
        typeName: name,
        typeCode: name.toUpperCase().replace(/[^A-Z0-9]+/g, "_"),
        amount,
        dueDate: null as Date | null,
      })),
    ];

    const resolved = resolveStudentFees(lines, [], 0);

    return Response.json({
      success: true,
      data: {
        mode: "legacy",
        student: { id: student.id, fullName: student.fullName, rollNo: student.rollNo },
        legacyStructure: { id: legacy.id, activeFrom: legacy.activeFrom },
        academicYear: requestedYear,
        ...resolved,
      },
    });
  } catch (error) {
    return errorResponse(error, "[fees/resolve] GET failed");
  }
}
