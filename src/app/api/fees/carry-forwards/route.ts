import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, canManageOperations, errorResponse, requireAuthUser, scopedCampusWhere } from "@/lib/api/scope";

// FeeCarryForward: session-end balance moved to the next academic year.
// Balance is paisa; positive = owed, negative = credit.

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get("studentId");
    const academicYear = searchParams.get("academicYear");

    const forwards = await prisma.feeCarryForward.findMany({
      where: {
        ...(studentId ? { studentId } : {}),
        ...(academicYear ? { toAcademicYear: Number(academicYear) } : {}),
        student: { campus: { schoolId: user.schoolId } },
      },
      include: { student: { select: { id: true, fullName: true, rollNo: true } } },
      orderBy: [{ toAcademicYear: "desc" }],
    });
    return Response.json({ success: true, data: forwards });
  } catch (error) {
    return errorResponse(error, "[fees/carry-forwards] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);

    const body = await req.json();
    if (!body.studentId) throw new ApiError("studentId required", 400);
    const fromAcademicYear = Number(body.fromAcademicYear ?? new Date().getFullYear());
    const toAcademicYear = Number(body.toAcademicYear ?? fromAcademicYear + 1);
    const balance = Number(body.balance);

    if (!Number.isInteger(fromAcademicYear) || !Number.isInteger(toAcademicYear) || toAcademicYear <= fromAcademicYear) {
      throw new ApiError("invalid academic years", 400);
    }
    if (!Number.isInteger(balance)) throw new ApiError("balance must be an integer (paisa)", 400);

    const student = await prisma.student.findFirst({
      where: { id: body.studentId, campus: { schoolId: user.schoolId } },
      select: { id: true, campusId: true },
    });
    if (!student) throw new ApiError("Student not found", 404);

    const existing = await prisma.feeCarryForward.findUnique({
      where: { studentId_toAcademicYear: { studentId: body.studentId, toAcademicYear } },
    });
    if (existing) throw new ApiError("A carry-forward already exists for this student and year", 409);

    const forward = await prisma.feeCarryForward.create({
      data: {
        campusId: student.campusId,
        studentId: body.studentId,
        fromAcademicYear,
        toAcademicYear,
        balance,
        note: body.note ?? null,
      },
    });
    return Response.json({ success: true, data: forward }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "[fees/carry-forwards] POST failed");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);

    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new ApiError("id required", 400);

    const existing = await prisma.feeCarryForward.findFirst({
      where: { id, student: { campus: { schoolId: user.schoolId } } },
    });
    if (!existing) throw new ApiError("Carry-forward not found", 404);

    await prisma.feeCarryForward.delete({ where: { id } });
    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error, "[fees/carry-forwards] DELETE failed");
  }
}
