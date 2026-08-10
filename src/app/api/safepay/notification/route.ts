import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { verifySafePayNotification } from "@/lib/payments/safepay";
import { applySchoolPlan } from "@/lib/billing/entitlements";
import { recordPayment } from "@/lib/fees/payment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const secretKey = process.env.SAFEPAY_SECRET_KEY;
    if (!secretKey) {
      return Response.json({ error: "SafePay not configured" }, { status: 503 });
    }

    const body = await req.json();
    const isValid = verifySafePayNotification(body, secretKey);
    if (!isValid) {
      return Response.json({ error: "Invalid signature" }, { status: 400 });
    }

    const event = body.event as string;
    const data = body.data as Record<string, any> | undefined;

    if (event === "order.completed" && data) {
      const orderRef = (data.order_ref || data.metadata?.orderRef || data.metadata?.orderId) as string | undefined;
      const schoolId = (data.metadata?.schoolId) as string | undefined;
      const plan = (data.metadata?.plan) as string | undefined;
      const kind = (data.metadata?.kind) as string | undefined;

      // Fee payment — settle the OnlinePaymentOrder idempotently
      if (kind === "FEE" && orderRef) {
        const order = await prisma.onlinePaymentOrder.findUnique({ where: { orderRef } });
        if (order && order.status !== "COMPLETED") {
          await prisma.$transaction(async (tx) => {
            const current = await tx.onlinePaymentOrder.findUnique({ where: { id: order.id } });
            if (current?.status === "COMPLETED") return;

            const result = await recordPayment(tx, {
              campusId: order.campusId,
              invoiceId: order.invoiceId,
              studentId: order.studentId,
              amount: order.amount,
              paymentDate: new Date(),
              paymentMethod: "SAFEPAY",
              referenceNumber: orderRef,
              note: "Online payment via SafePay",
              recordedBy: null,
            });

            await tx.onlinePaymentOrder.update({
              where: { id: order.id },
              data: { status: "COMPLETED", paymentId: result.payment.id, completedAt: new Date() },
            });
          }, { timeout: 20000 });
        }
      } else if (orderRef && schoolId && plan) {
        await applySchoolPlan(schoolId, plan as any, "ACTIVE");
      }
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("[safepay/notification]", error);
    return Response.json({ error: "Notification handler failed" }, { status: 500 });
  }
}
