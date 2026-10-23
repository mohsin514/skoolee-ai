import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  ApiError,
  assertPermission,
  assertStaffRole,
  errorResponse,
  requireAuthUser,
} from "@/lib/api/scope";
import { collectPaymentCore, collectReceipt } from "@/lib/fees/collect-command";
import { notify } from "@/lib/notifications/in-app";

// POST /api/fees/collect
// body: { studentId, invoiceId, amount (paisa), fineAmount?, discountAmount?,
//         paymentDate, paymentMethod, referenceNumber?, note?, idempotencyKey,
//         workflowHandoffId? (an AI-prepared collection this person claimed) }
// Single transaction: creates the payment, updates the invoice balance,
// carries any overpayment into next-year credit. While a prepared collection
// is open for the invoice, only that hand-off may post it, once (RT6).

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
    // Validation, replay, the RT6 hand-off rules and the transaction live in the shared collect command.
    const outcome = await collectPaymentCore(user, body);

    if (!outcome.replayed) {
      notify("PAYMENT_RECORDED", {
        schoolId: user.schoolId,
        campusId: outcome.campusId,
        actorId: user.userId,
        actorName: user.fullName,
        studentName: outcome.invoice.student.fullName,
        amount: outcome.amount,
        // The invoice's own currency (an invoice may be billed in another currency than the campus default).
        currency: outcome.invoice.currency,
      });
    }

    return Response.json({ success: true, data: collectReceipt(outcome) }, { status: outcome.replayed ? 200 : 201 });
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