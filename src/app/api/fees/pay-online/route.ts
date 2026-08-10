import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { createSafePayOrder } from "@/lib/payments/safepay";

// POST /api/fees/pay-online
// body: { invoiceId }
// Opens a SafePay session for the invoice's remaining balance. Accessible to
// any authenticated user who "owns" the student: STUDENT (own profile),
// PARENT (own child), or campus staff.

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const body = await req.json();
    if (!body.invoiceId) throw new ApiError("invoiceId required", 400);

    const invoice = await prisma.invoice.findFirst({
      where: {
        id: body.invoiceId,
        balanceDue: { gt: 0 },
        student: {
          campus: { schoolId: user.schoolId },
          ...(user.role === "STUDENT" ? { studentUserId: user.userId } : {}),
          ...(user.role === "PARENT" ? { parentUserId: user.userId } : {}),
        },
      },
      include: { student: { select: { id: true, fullName: true, campusId: true } } },
    });
    if (!invoice) throw new ApiError("Invoice not found or already paid", 404);
    if (invoice.status === "PAID") throw new ApiError("Invoice already paid", 409);

    // One open order per invoice at a time
    const existingOpen = await prisma.onlinePaymentOrder.findFirst({
      where: { invoiceId: invoice.id, status: "PENDING" },
    });
    if (existingOpen) {
      throw new ApiError("An online payment for this invoice is already in progress", 409);
    }

    const orderRef = `SKLFEE-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
    const order = await prisma.onlinePaymentOrder.create({
      data: {
        campusId: invoice.student.campusId,
        invoiceId: invoice.id,
        studentId: invoice.studentId,
        amount: invoice.balanceDue,
        orderRef,
        gateway: "SAFEPAY",
      },
    });

    const appBase = req.nextUrl.origin || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const merchantId = process.env.SAFEPAY_MERCHANT_ID;
    const apiKey = process.env.SAFEPAY_API_KEY;
    const secretKey = process.env.SAFEPAY_SECRET_KEY;

    if (merchantId && apiKey && secretKey) {
      const result = await createSafePayOrder(
        {
          merchantId,
          apiKey,
          secretKey,
          returnUrl: `${appBase}/dashboard/fees?safepay_status=completed&ref=${orderRef}`,
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
        await prisma.onlinePaymentOrder.update({
          where: { id: order.id },
          data: { status: "FAILED" },
        });
        throw new ApiError(result.error || "SafePay order creation failed", 502);
      }
      return Response.json({ success: true, method: "safepay", url: result.redirectUrl });
    }

    // Dev fallback — sandbox card form
    const simUrl = new URL("/safepay", appBase);
    simUrl.searchParams.set("orderRef", orderRef);
    simUrl.searchParams.set("kind", "FEE");
    simUrl.searchParams.set("invoiceId", invoice.id);
    simUrl.searchParams.set("amountLabel", `Rs ${(order.amount / 100).toLocaleString()}`);

    return Response.json({ success: true, method: "safepay", url: simUrl.toString() });
  } catch (error) {
    return errorResponse(error, "[fees/pay-online] POST failed");
  }
}