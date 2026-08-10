import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, canManageOperations, errorResponse, requireAuthUser, scopedCampusWhere } from "@/lib/api/scope";

// FeeDiscountAssignment: attach/detach a discount to a specific student.

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get("studentId");
    const discountId = searchParams.get("discountId");

    const assignments = await prisma.feeDiscountAssignment.findMany({
      where: {
        ...(studentId ? { studentId } : {}),
        ...(discountId ? { discountId } : {}),
        student: { campus: { schoolId: user.schoolId } },
      },
      include: {
        discount: { select: { id: true, name: true, code: true, type: true, value: true } },
        student: { select: { id: true, fullName: true, rollNo: true } },
      },
      orderBy: { student: { fullName: "asc" } },
    });
    return Response.json({ success: true, data: assignments });
  } catch (error) {
    return errorResponse(error, "[fees/discount-assignments] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);

    const body = await req.json();
    if (!body.discountId || !body.studentId) throw new ApiError("discountId and studentId required", 400);

    const discount = await prisma.feeDiscount.findFirst({
      where: { id: body.discountId, campus: { schoolId: user.schoolId } },
    });
    if (!discount) throw new ApiError("Discount not found", 404);

    const student = await prisma.student.findFirst({
      where: { id: body.studentId, campus: { schoolId: user.schoolId } },
    });
    if (!student) throw new ApiError("Student not found", 404);

    const existing = await prisma.feeDiscountAssignment.findUnique({
      where: { discountId_studentId: { discountId: body.discountId, studentId: body.studentId } },
    });
    if (existing) throw new ApiError("Discount already assigned to this student", 409);

    const assignment = await prisma.feeDiscountAssignment.create({
      data: { discountId: body.discountId, studentId: body.studentId },
      include: {
        discount: { select: { id: true, name: true, type: true, value: true } },
        student: { select: { id: true, fullName: true, rollNo: true } },
      },
    });
    return Response.json({ success: true, data: assignment }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "[fees/discount-assignments] POST failed");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);

    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new ApiError("id required", 400);

    const existing = await prisma.feeDiscountAssignment.findFirst({
      where: { id, discount: { campus: { schoolId: user.schoolId } } },
    });
    if (!existing) throw new ApiError("Assignment not found", 404);

    await prisma.feeDiscountAssignment.delete({ where: { id } });
    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error, "[fees/discount-assignments] DELETE failed");
  }
}
