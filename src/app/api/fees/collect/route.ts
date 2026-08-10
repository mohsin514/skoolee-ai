import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, assertPermission, canManageOperations, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";
import { recordPayment } from "@/lib/fees/payment";
import { notify } from "@/lib/notifications/in-app";

// POST /api/fees/collect
// body: { studentId, invoiceId, amount (paisa), fineAmount?, discountAmount?,
//         paymentDate, paymentMethod, referenceNumber?, note? }
// Single transaction: creates the payment, updates the invoice balance,
// carries any overpayment into next-year credit.

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "fees", "add");

    const body = await req.json();
    if (!body.studentId || !body.invoiceId) throw new ApiError("studentId and invoiceId required", 400);

    const amount = Math.round(Number(body.amount));
    if (!Number.isInteger(amount) || amount <= 0) throw new ApiError("amount must be a positive integer (paisa)", 400);

    const paymentDate = new Date(body.paymentDate ?? new Date().toISOString().split("T")[0]);
    const paymentMethod = String(body.paymentMethod ?? "").toUpperCase();
    if (!["CASH", "BANK", "CHEQUE", "SAFEPAY", "MOBILE_WALLET"].includes(paymentMethod)) {
      throw new ApiError("paymentMethod must be CASH, BANK, CHEQUE, SAFEPAY or MOBILE_WALLET", 400);
    }

    const invoice = await prisma.invoice.findFirst({
      where: {
        id: body.invoiceId,
        studentId: body.studentId,
        student: { campus: { schoolId: user.schoolId } },
      },
      include: { student: { select: { id: true, fullName: true, campusId: true } } },
    });
    if (!invoice) throw new ApiError("Invoice not found for this student", 404);

    const campusId = await resolveCampusId(user, invoice.student.campusId);

    const result = await prisma.$transaction((tx) =>
      recordPayment(tx, {
        campusId,
        invoiceId: invoice.id,
        studentId: invoice.studentId,
        amount,
        fineAmount: Math.round(Number(body.fineAmount ?? 0)),
        discountAmount: Math.round(Number(body.discountAmount ?? 0)),
        paymentDate,
        paymentMethod,
        referenceNumber: body.referenceNumber ?? null,
        note: body.note ?? null,
        recordedBy: user.userId,
      }),
      { timeout: 20000 }
    );

    await prisma.auditLog.create({
      data: {
        tableName: "payment",
        recordId: result.payment.id,
        newValue: {
          invoiceId: invoice.id,
          amount,
          fineAmount: result.payment.fineAmount,
          discountAmount: result.payment.discountAmount,
          receiptNo: result.receiptNo,
          credit: result.credit,
        },
        userId: user.userId,
      },
    });

    notify("PAYMENT_RECORDED", {
      schoolId: user.schoolId,
      campusId,
      actorId: user.userId,
      actorName: user.fullName,
      studentName: invoice.student.fullName,
      amount,
    });

    return Response.json(
      {
        success: true,
        data: {
          id: result.payment.id,
          paymentId: result.payment.id,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          studentId: invoice.studentId,
          studentName: invoice.student.fullName,
          amount,
          fineAmount: result.payment.fineAmount,
          discountAmount: result.payment.discountAmount,
          receiptNumber: result.receiptNo,
          credit: result.credit,
          creditAmount: result.credit,
          note: result.payment.note,
          status: "recorded",
          message: result.credit > 0
            ? "Payment recorded with credit carried forward"
            : "Payment recorded",
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error, "[fees/collect] POST failed");
  }
}

// GET /api/fees/collect?invoiceId= — returns the payment window for an invoice
// (what SafePay's webhook looks up after completing). For the staff; the
// student portal uses /api/fees/resolve instead.
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const invoiceId = req.nextUrl.searchParams.get("invoiceId");
    if (!invoiceId) throw new ApiError("invoiceId required", 400);

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, student: { campus: { schoolId: user.schoolId } } },
      include: {
        payments: { orderBy: { createdAt: "desc" } },
        student: { select: { id: true, fullName: true, rollNo: true } },
      },
    });
    if (!invoice) throw new ApiError("Invoice not found", 404);

    return Response.json({ success: true, data: invoice });
  } catch (error) {
    return errorResponse(error, "[fees/collect] GET failed");
  }
}