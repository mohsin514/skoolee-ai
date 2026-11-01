import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { writeAuditEvent } from "@/lib/audit-events";
import { ApiError } from "@/lib/api/scope";
import { isInstitutionAuthority } from "@/lib/auth/institution";

/**
 * Give a named discount to one pupil (POST /api/fees/discount-assignments), extracted so the route and the AI
 * Workflows `fees.assign_discount` capability run the same command. Body: { discountId, studentId }.
 * The caller has already checked canManageFinance and fees.add. Throws ApiError with the route's messages.
 */
export async function assignDiscount(user: AuthUser, body: Record<string, unknown>) {
  if (!body.discountId || !body.studentId) throw new ApiError("discountId and studentId required", 400);
  const discountId = String(body.discountId), studentId = String(body.studentId);

  // Campus-pinned staff may assign only within their own campus; institution administrators see the whole school.
  const campusPin = !isInstitutionAuthority(user) && user.campusId ? { campusId: user.campusId } : {};

  const discount = await prisma.feeDiscount.findFirst({
    where: { id: discountId, ...campusPin, campus: { schoolId: user.schoolId } },
  });
  if (!discount) throw new ApiError("Discount not found", 404);

  const student = await prisma.student.findFirst({
    where: { id: studentId, ...campusPin, campus: { schoolId: user.schoolId } },
  });
  if (!student) throw new ApiError("Student not found", 404);
  if (student.campusId !== discount.campusId) throw new ApiError("The discount and the student belong to different campuses.", 409);

  const existing = await prisma.feeDiscountAssignment.findUnique({
    where: { discountId_studentId: { discountId, studentId } },
  });
  if (existing) throw new ApiError("Discount already assigned to this student", 409);

  return prisma.$transaction(async (tx) => {
    const created = await tx.feeDiscountAssignment.create({
      data: { discountId, studentId },
      include: {
        discount: { select: { id: true, name: true, type: true, value: true } },
        student: { select: { id: true, fullName: true, rollNo: true } },
      },
    });
    await writeAuditEvent(tx, user, { table: "fee_discount_assignments", recordId: created.id, action: "CREATE", campusId: discount.campusId, after: { discountId: created.discountId, studentId: created.studentId } });
    return created;
  });
}
