import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  ApiError,
  assertPermission,
  assertStaffRole,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
} from "@/lib/api/scope";
import { recordPayment } from "@/lib/fees/payment";
import { notify } from "@/lib/notifications/in-app";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";

// POST /api/fees/collect
// body: { studentId, invoiceId, amount (paisa), fineAmount?, discountAmount?,
//         paymentDate, paymentMethod, referenceNumber?, note? }
// Single transaction: creates the payment, updates the invoice balance,
// carries any overpayment into next-year credit.

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    // Taking a fee payment is the finance desk's job (the accountant, or the
    // campus admin while no accountant is on the campus). The permission matrix
    // decides who holds fees.add, so a school that opens a cash counter at the
    // front desk grants it there without a code change.
    assertStaffRole(user);
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

    // SKO-475: the operation key binds this collection to its exact request. A retry after a dropped
    // response replays the original receipt; the same key with a different request is a conflict.
    const idempotencyKey = typeof body.idempotencyKey === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(body.idempotencyKey) ? body.idempotencyKey : null;
    if (!idempotencyKey) throw new ApiError("idempotencyKey is required for a manual collection", 400);
    const fineAmount = Math.round(Number(body.fineAmount ?? 0)), discountAmount = Math.round(Number(body.discountAmount ?? 0));
    const referenceNumber = body.referenceNumber ?? null, note = body.note ?? null;
    const requestHash = createHash("sha256").update(JSON.stringify({ invoiceId: invoice.id, studentId: invoice.studentId, amount, fineAmount, discountAmount, paymentDate: paymentDate.toISOString().slice(0, 10), paymentMethod, referenceNumber, note })).digest("hex");
    const replay = async () => {
      const previous = await prisma.payment.findFirst({ where: { schoolId: user.schoolId, recordedBy: user.userId, idempotencyKey } });
      if (!previous) return null;
      if (previous.requestHash !== requestHash) throw Object.assign(new ApiError("This payment key was already used for a different payment. Check the existing receipt before recording again.", 409), { code: "IDEMPOTENCY_CONFLICT" });
      const allocation = await prisma.paymentAllocation.findFirst({ where: { paymentId: previous.id }, select: { credit: true } });
      return respond(previous, allocation?.credit ?? 0, true);
    };
    const respond = (payment: { id: string; fineAmount: number; discountAmount: number; receiptNo: string | null; note: string | null; amount: number }, credit: number, replayed: boolean) => Response.json({
      success: true,
      data: {
        id: payment.id, paymentId: payment.id, invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, currency: invoice.currency,
        studentId: invoice.studentId, studentName: invoice.student.fullName, amount: payment.amount,
        fineAmount: payment.fineAmount, discountAmount: payment.discountAmount, receiptNumber: payment.receiptNo,
        credit, creditAmount: credit, note: payment.note, status: "recorded", replayed,
        message: replayed ? "This payment was already recorded; no duplicate was posted." : credit > 0 ? "Payment recorded with credit carried forward" : "Payment recorded",
      },
    }, { status: replayed ? 200 : 201 });
    const earlier = await replay();
    if (earlier) return earlier;

    let result;
    try {
      // The payment, allocation, ledger entry and audit record commit together or not at all.
      result = await prisma.$transaction(async (tx) => {
        const recorded = await recordPayment(tx, {
          campusId,
          invoiceId: invoice.id,
          studentId: invoice.studentId,
          amount,
          fineAmount,
          discountAmount,
          paymentDate,
          paymentMethod,
          referenceNumber,
          note,
          recordedBy: user.userId,
          idempotencyKey,
          requestHash,
        });
        await tx.auditLog.create({ data: { tableName: "payment", recordId: recorded.payment.id, newValue: { invoiceId: invoice.id, amount, fineAmount: recorded.payment.fineAmount, discountAmount: recorded.payment.discountAmount, receiptNo: recorded.receiptNo, credit: recorded.credit }, userId: user.userId } });
        return recorded;
      }, { timeout: 20000 });
    } catch (error) {
      // A concurrent retry with the same key committed first: answer with its receipt.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && JSON.stringify(error.meta ?? {}).includes("idempotency")) {
        const winner = await replay();
        if (winner) return winner;
      }
      throw error;
    }


    notify("PAYMENT_RECORDED", {
      schoolId: user.schoolId,
      campusId,
      actorId: user.userId,
      actorName: user.fullName,
      studentName: invoice.student.fullName,
      amount,
      // The invoice's own currency (an invoice may be billed in another currency than the campus default).
      currency: invoice.currency,
    });

    return respond(result.payment, result.credit, false);
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