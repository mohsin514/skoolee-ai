import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { writeAuditEvent } from "@/lib/audit-events";
import { ApiError, assertSharedModuleRead, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { createSafePayOrder } from "@/lib/payments/safepay";
import { studentScope } from "@/lib/auth/policy";
import { onlinePaymentAvailability, paymentReturnPath, publicOrderStatus } from "@/lib/fees/online-payment";
import { randomUUID } from "node:crypto";

// GET /api/fees/pay-online?invoiceId=… → whether online payment is possible for that invoice now
// GET /api/fees/pay-online?ref=…       → the server's status for one of the caller's orders
//
// POST /api/fees/pay-online
// body: { invoiceId }
// Opens a SafePay session for the invoice's remaining balance. Accessible to
// any authenticated user who "owns" the student: STUDENT (own profile),
// PARENT (own child), or campus staff.

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertSharedModuleRead(user, "fees");
    const body = await req.json();
    if (!body.invoiceId) throw new ApiError("invoiceId required", 400);

    const invoice = await prisma.invoice.findFirst({
      where: {
        id: body.invoiceId,
        balanceDue: { gt: 0 },
        student: studentScope(user, "finances"),
      },
      include: { student: { select: { id: true, fullName: true, campusId: true } } },
    });
    if (!invoice) throw new ApiError("Invoice not found or already paid", 404);
    if (invoice.status === "PAID") throw new ApiError("Invoice already paid", 409);

    // SKO-431/474: decide whether any method can take this payment before an order exists, so a
    // missing gateway or currency never leaves an unusable pending order behind.
    const availability = onlinePaymentAvailability(invoice.currency);
    if (!availability.available) {
      return Response.json({ success: false, code: "PAYMENT_METHOD_UNAVAILABLE", reason: availability.reason, supportedCurrencies: availability.supportedCurrencies, error: availability.reason === "CURRENCY_UNSUPPORTED" ? "Online payment supports PKR invoices only. Use the school's offline payment methods for this invoice." : "Online payment is not set up for this school yet. Use the school's offline payment methods." }, { status: 503 });
    }

    // One open order per invoice: a pending one is reported with its reference so the payer can check
    // its status instead of paying twice.
    const existingOpen = await prisma.onlinePaymentOrder.findFirst({
      where: { invoiceId: invoice.id, status: "PENDING" },
      select: { orderRef: true, createdAt: true },
    });
    if (existingOpen) {
      return Response.json({ success: false, code: "PAYMENT_PENDING", orderRef: existingOpen.orderRef, startedAt: existingOpen.createdAt.toISOString(), error: "A payment for this invoice is waiting for confirmation. Check its status before paying again." }, { status: 409 });
    }

    const orderRef = `SKLFEE-${randomUUID().replace(/-/g, "").slice(0, 20).toUpperCase()}`;
    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.onlinePaymentOrder.create({
        data: {
          campusId: invoice.student.campusId,
          invoiceId: invoice.id,
          studentId: invoice.studentId,
          amount: invoice.balanceDue,
          orderRef,
          gateway: "SAFEPAY",
        },
      });
      await writeAuditEvent(tx, user, { table: "online_payment_orders", recordId: created.id, action: "CREATE", campusId: created.campusId, after: { invoiceId: created.invoiceId, studentId: created.studentId, amount: created.amount, gateway: created.gateway, status: created.status } });
      return created;
    });
    const returnPath = paymentReturnPath(user.role, { id: invoice.id, studentId: invoice.studentId }, orderRef);

    const appBase = req.nextUrl.origin || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const merchantId = process.env.SAFEPAY_MERCHANT_ID;
    const apiKey = process.env.SAFEPAY_API_KEY;
    const secretKey = process.env.SAFEPAY_SECRET_KEY;

    if (availability.mode === "PROVIDER" && merchantId && apiKey && secretKey) {
      const result = await createSafePayOrder(
        {
          merchantId,
          apiKey,
          secretKey,
          returnUrl: `${appBase}${returnPath}`,
          sandbox: process.env.SAFEPAY_PRODUCTION !== "true",
        },
        {
          amount: invoice.balanceDue,
          orderRef,
          description: `Fee payment — ${invoice.student.fullName}`,
          customerEmail: user.email,
          customerName: user.fullName,
          metadata: { orderRef, kind: "FEE" },
        }
      );

      if (!result.success || !result.redirectUrl) {
        await prisma.$transaction(async (tx) => {
          await tx.onlinePaymentOrder.update({
            where: { id: order.id },
            data: { status: "FAILED" },
          });
          await writeAuditEvent(tx, user, { table: "online_payment_orders", recordId: order.id, action: "UPDATE", campusId: order.campusId, before: { status: order.status }, after: { status: "FAILED" } });
        });
        throw new ApiError(result.error || "SafePay order creation failed", 502);
      }
      return Response.json({ success: true, method: "safepay", url: result.redirectUrl, orderRef, returnPath });
    }

    // Development only (availability never offers SANDBOX in production): the sandbox card form.
    const simUrl = new URL("/safepay", appBase);
    simUrl.searchParams.set("orderRef", orderRef);
    simUrl.searchParams.set("kind", "FEE");
    simUrl.searchParams.set("invoiceId", invoice.id);
    simUrl.searchParams.set("amountLabel", `Rs ${(order.amount / 100).toLocaleString()}`);
    simUrl.searchParams.set("returnTo", returnPath);

    return Response.json({ success: true, method: "sandbox", url: simUrl.toString(), orderRef, returnPath });
  } catch (error) {
    return errorResponse(error, "[fees/pay-online] POST failed");
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertSharedModuleRead(user, "fees");
    const ref = req.nextUrl.searchParams.get("ref"), invoiceId = req.nextUrl.searchParams.get("invoiceId");
    if (ref) {
      // Only the payer's own authorized invoices; another family's reference is simply not found.
      const order = await prisma.onlinePaymentOrder.findFirst({
        where: { orderRef: ref, invoice: { student: studentScope(user, "finances") } },
        select: { orderRef: true, status: true, amount: true, invoiceId: true, studentId: true, createdAt: true, completedAt: true, paymentId: true, invoice: { select: { currency: true, invoiceNumber: true, balanceDue: true, status: true } } },
      });
      if (!order) throw new ApiError("Payment not found", 404);
      const payment = order.paymentId ? await prisma.payment.findFirst({ where: { id: order.paymentId }, select: { receiptNo: true, amount: true, paymentDate: true } }) : null;
      return Response.json({ success: true, order: { orderRef: order.orderRef, status: publicOrderStatus(order.status), amount: order.amount, currency: order.invoice.currency, invoiceId: order.invoiceId, studentId: order.studentId, invoiceNumber: order.invoice.invoiceNumber, invoiceStatus: order.invoice.status, balanceDue: order.invoice.balanceDue, startedAt: order.createdAt.toISOString(), confirmedAt: order.completedAt?.toISOString() ?? null, receiptNo: payment?.receiptNo ?? null } }, { headers: { "Cache-Control": "private, no-store" } });
    }
    if (!invoiceId) throw new ApiError("invoiceId or ref required", 400);
    const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, student: studentScope(user, "finances") }, select: { id: true, currency: true, balanceDue: true } });
    if (!invoice) throw new ApiError("Invoice not found", 404);
    const pending = await prisma.onlinePaymentOrder.findFirst({ where: { invoiceId: invoice.id, status: "PENDING" }, select: { orderRef: true, createdAt: true } });
    return Response.json({ success: true, availability: onlinePaymentAvailability(invoice.currency), pending: pending ? { orderRef: pending.orderRef, startedAt: pending.createdAt.toISOString() } : null }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error, "[fees/pay-online] GET failed");
  }
}
