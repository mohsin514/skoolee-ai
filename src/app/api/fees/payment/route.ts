import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { paymentSchema } from "@/lib/validators/schemas";
import {
  ApiError,
  canManageOperations,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
} from "@/lib/api/scope";
import { notify } from "@/lib/notifications/in-app";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);

    const body = await req.json();
    const parsed = paymentSchema.safeParse(body);
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      const msg = Object.entries(flat).map(([k, v]) => `${k}: ${v?.join(", ")}`).join("; ");
      return Response.json({ error: msg || "Validation failed" }, { status: 400 });
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id: parsed.data.invoiceId },
      include: { student: { select: { id: true, fullName: true, campusId: true } } },
    });
    if (!invoice) throw new ApiError("Invoice not found", 404);

    const campusId = await resolveCampusId(user, invoice.student.campusId);

    const payment = await prisma.$transaction(async (tx) => {
      const shortId = campusId.split("-").pop()?.slice(0, 4).toUpperCase() ?? "XX";
      const year = new Date().getFullYear();
      const maxReceipt = await tx.payment.findFirst({
        where: { campusId },
        orderBy: { createdAt: "desc" },
        select: { receiptNo: true },
      });
      let seq = 1;
      if (maxReceipt?.receiptNo) {
        const parts = maxReceipt.receiptNo.split("-");
        const last = parseInt(parts[parts.length - 1] ?? "0", 10);
        if (!isNaN(last)) seq = last + 1;
      }
      const receiptNo = `RCP-${year}-${shortId}-${String(seq).padStart(5, "0")}`;

      const pmt = await tx.payment.create({
        data: {
          campusId,
          invoiceId: invoice.id,
          studentId: invoice.studentId,
          amount: parsed.data.amount,
          paymentDate: new Date(parsed.data.paymentDate),
          paymentMethod: parsed.data.paymentMethod,
          referenceNumber: parsed.data.referenceNumber ?? null,
          receiptNo,
          recordedBy: user.userId,
        },
      });

      const totalPaid = (await tx.payment.aggregate({
        where: { invoiceId: invoice.id },
        _sum: { amount: true },
      }))._sum.amount ?? 0;

      const newBalance = invoice.totalAmount - totalPaid;
      const newStatus = newBalance <= 0 ? "PAID" : totalPaid > 0 ? "PARTIAL" : "PENDING";

      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          totalAmountPaid: totalPaid,
          balanceDue: Math.max(0, newBalance),
          status: newStatus,
        },
      });

      return pmt;
    }, { timeout: 20000 });

    await prisma.auditLog.create({
      data: {
        tableName: "payment",
        recordId: payment.id,
        newValue: { invoiceId: invoice.id, amount: parsed.data.amount, receiptNo: payment.receiptNo },
        userId: user.userId,
      },
    });

    notify("PAYMENT_RECORDED", {
      schoolId: user.schoolId,
      campusId,
      actorId: user.userId,
      actorName: user.fullName,
      studentName: invoice.student.fullName,
      amount: payment.amount,
    });

    return Response.json(
      {
        success: true,
        data: {
          id: payment.id,
          invoiceId: payment.invoiceId,
          amount: payment.amount,
          status: "recorded",
          receiptNumber: payment.receiptNo,
          invoiceNumber: invoice.invoiceNumber,
          studentName: invoice.student.fullName,
          message: "Payment recorded",
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error, "[fees/payment] POST failed");
  }
}
