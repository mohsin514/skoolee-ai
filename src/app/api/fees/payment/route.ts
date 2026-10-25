import { recordPayment } from "@/lib/fees/payment";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { paymentSchema } from "@/lib/validators/schemas";
import {
  ApiError,
  assertPermission,
  canManageFinance,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
} from "@/lib/api/scope";
import { notify } from "@/lib/notifications/in-app";
import { requestSchool } from "@/lib/capacity/identity";
import { measured } from "@/lib/capacity/admission";
import { createHash } from "node:crypto";

// SKO-451: payment confirmation is critical work: measured, never shed by background quotas.
export async function POST(req: NextRequest) {
  const schoolId = await requestSchool();
  if (!schoolId) return confirmPayment(req);
  return measured("CRITICAL", "payment-confirmation", schoolId, () => confirmPayment(req));
}
async function confirmPayment(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageFinance(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "fees", "add");

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
    const idempotencyKey = typeof (body as { idempotencyKey?: unknown }).idempotencyKey === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(body.idempotencyKey) ? body.idempotencyKey : null;
    if (!idempotencyKey) throw new ApiError("idempotencyKey is required for a payment", 400);
    const requestHash = createHash("sha256").update(JSON.stringify({ invoiceId: invoice.id, studentId: invoice.studentId, amount: parsed.data.amount, paymentDate: parsed.data.paymentDate, paymentMethod: parsed.data.paymentMethod, referenceNumber: parsed.data.referenceNumber ?? null })).digest("hex");
    const previous = await prisma.payment.findFirst({ where: { schoolId: user.schoolId, recordedBy: user.userId, idempotencyKey } });
    if (previous) {
      if (previous.requestHash !== requestHash) throw new ApiError("This payment key was already used for a different payment.", 409);
      return Response.json({ success: true, data: { id: previous.id, invoiceId: previous.invoiceId, amount: previous.amount, status: "recorded", receiptNumber: previous.receiptNo, invoiceNumber: invoice.invoiceNumber, studentName: invoice.student.fullName, message: "Payment already recorded" } }, { status: 200 });
    }

    const { payment } = await prisma.$transaction(async tx => {
      const result = await recordPayment(tx, {
      campusId, invoiceId: invoice.id, studentId: invoice.studentId,
      amount: parsed.data.amount, paymentDate: new Date(parsed.data.paymentDate),
      paymentMethod: parsed.data.paymentMethod, referenceNumber: parsed.data.referenceNumber,
      recordedBy: user.userId, idempotencyKey, requestHash,
      });
      await tx.auditLog.create({
      data: {
          tableName: "payment", recordId: result.payment.id,
          newValue: { invoiceId: invoice.id, amount: parsed.data.amount, receiptNo: result.payment.receiptNo },
        userId: user.userId,
      },
      });
      return result;
    }, { isolationLevel: "Serializable", timeout: 20000 });

    notify("PAYMENT_RECORDED", {
      schoolId: user.schoolId,
      campusId,
      actorId: user.userId,
      actorName: user.fullName,
      studentName: invoice.student.fullName,
      amount: payment.amount,
      // The invoice's own currency (an invoice may be billed in another currency than the campus default).
      currency: invoice.currency,
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
