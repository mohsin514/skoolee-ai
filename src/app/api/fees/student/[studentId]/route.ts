import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  ApiError,
  canManageOperations,
  errorResponse,
  requireAuthUser,
} from "@/lib/api/scope";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  try {
    const user = await requireAuthUser();
    const { studentId } = await params;

    const student = await prisma.student.findFirst({
      where: {
        id: studentId,
        campus: { schoolId: user.schoolId },
        ...(user.role !== "SUPER_ADMIN" && user.role !== "PARENT"
          ? { campusId: user.campusId ?? undefined }
          : {}),
        ...(user.role === "PARENT" ? { parentUserId: user.userId } : {}),
        ...(user.role === "STUDENT" ? { studentUserId: user.userId } : {}),
      },
      include: {
        class: { select: { id: true, name: true, section: true } },
        invoices: {
          orderBy: { invoiceDate: "desc" },
          include: {
            payments: { orderBy: { paymentDate: "desc" } },
          },
        },
      },
    });

    if (!student) throw new ApiError("Student not found", 404);

    const totalDue = student.invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
    const totalPaid = student.invoices.reduce((sum, inv) => sum + inv.totalAmountPaid, 0);
    const balance = totalDue - totalPaid;

    const nextUnpaid = student.invoices.find(
      (inv) => inv.status === "PENDING" || inv.status === "OVERDUE"
    );
    const lateFeesAccrued = student.invoices.reduce((sum, inv) => sum + inv.lateFeeAmount, 0);

    const paymentStatus = balance <= 0 ? "good" : student.invoices.some((inv) => inv.status === "OVERDUE") ? "critical" : "due";

    return Response.json({
      success: true,
      data: {
        studentId: student.id,
        studentName: student.fullName,
        class: student.class.name,
        totalDue,
        totalPaid,
        balance,
        nextDue: nextUnpaid
          ? {
              invoiceId: nextUnpaid.id,
              invoiceNumber: nextUnpaid.invoiceNumber,
              dueDate: nextUnpaid.dueDate.toISOString().split("T")[0],
              amount: nextUnpaid.balanceDue,
              status: nextUnpaid.status,
            }
          : null,
        invoiceHistory: student.invoices.map((inv) => ({
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          invoiceDate: inv.invoiceDate.toISOString().split("T")[0],
          dueDate: inv.dueDate.toISOString().split("T")[0],
          amountDue: inv.totalAmount,
          amountPaid: inv.totalAmountPaid,
          balance: inv.balanceDue,
          status: inv.status,
          payments: inv.payments.map((p) => ({
            amount: p.amount,
            fineAmount: p.fineAmount ?? 0,
            method: p.paymentMethod,
            date: p.paymentDate.toISOString().split("T")[0],
            receiptNo: p.receiptNo,
          })),
        })),
        lateFeesAccrued,
        paymentStatus,
      },
    });
  } catch (error) {
    return errorResponse(error, "[fees/student] GET failed");
  }
}
