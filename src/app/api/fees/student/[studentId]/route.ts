import { studentScope, AccessDenied } from "@/lib/auth/policy";
import { assertSharedModuleRead } from "@/lib/api/scope";
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
    await assertSharedModuleRead(user, "fees");

    const student = await prisma.student.findFirst({
      where: {
        id: studentId,
        ...studentScope(user),
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

    if (!student) throw new AccessDenied("student", "view", user);

    const currency = req.nextUrl.searchParams.get("currency") || student.invoices[0]?.currency || "USD";
    const scopedInvoices = student.invoices.filter((invoice) => invoice.currency === currency);
    const totalDue = scopedInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
    const totalPaid = scopedInvoices.reduce((sum, inv) => sum + inv.totalAmountPaid, 0);
    const balance = totalDue - totalPaid;

    const nextUnpaid = student.invoices.find(
      (inv) => inv.status === "PENDING" || inv.status === "OVERDUE"
    );
    const lateFeesAccrued = scopedInvoices.reduce((sum, inv) => sum + inv.lateFeeAmount, 0);

    const paymentStatus = balance <= 0 ? "good" : student.invoices.some((inv) => inv.status === "OVERDUE") ? "critical" : "due";

    return Response.json({
      success: true,
      data: {
        currency,
        currencies: [...new Set(student.invoices.map((invoice) => invoice.currency))],
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
          currency: inv.currency,
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
