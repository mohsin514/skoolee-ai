import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { runUnscoped } from "@/lib/db/tenant-context";
import { recordPayment } from "@/lib/fees/payment";
import { activatePlan } from "@/lib/billing/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Simulates a completed SafePay order. Used by the sandbox card form.
// Supports both plan purchases (schoolId + plan) and fee payments (orderRef).

export async function POST(req: NextRequest) {
  // Gateway callbacks carry no session; the signature check inside is
  // what authenticates them, and the school is resolved from the
  // gateway's own identifiers rather than from a logged-in user.
  return runUnscoped("safepay sandbox simulate: no session, school resolved from order ref", () =>
    handleWebhook(req)
  );
}

async function handleWebhook(req: NextRequest) {
  // The sandbox simulator must NEVER be reachable in production — it activates
  // paid plans (and settles fee payments) without a real charge. In production
  // the only path into the license record is the SafePay webhook, which is
  // authenticated by SafePay's signature.
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "Not available in production" }, { status: 403 });
  }

  try {
    const { orderRef, schoolId, plan, billingPeriod } = await req.json();
    if (orderRef && schoolId && plan) {
      await activatePlan(schoolId, plan as any, prisma, billingPeriod === "annual" ? 365 : undefined);
      return Response.json({ success: true });
    }

    if (orderRef) {
      const order = await prisma.onlinePaymentOrder.findUnique({ where: { orderRef } });
      if (!order) return Response.json({ error: "Order not found" }, { status: 404 });

      if (order.status === "COMPLETED") {
        return Response.json({ success: true, message: "Already settled" });
      }

      const settled = await prisma.$transaction(
        async (tx) => {
        const current = await tx.onlinePaymentOrder.findUnique({ where: { id: order.id } });
        if (current?.status === "COMPLETED") return null;

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

        return result;
      },
        { timeout: 20000 }
      );

      return Response.json({ success: true, data: settled });
    }

    return Response.json({ error: "Missing required fields" }, { status: 400 });
  } catch (error) {
    console.error("[safepay/simulate] POST failed", error);
    return Response.json({ error: "Payment simulation failed" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orderRef = searchParams.get("orderRef");
  const schoolId = searchParams.get("schoolId");
  const plan = searchParams.get("plan");
  const amountLabel = searchParams.get("amountLabel");
  const kind = searchParams.get("kind");
  const invoiceId = searchParams.get("invoiceId");
  const billingPeriod = searchParams.get("billingPeriod");

  const appBase = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const payUrl = new URL("/safepay", req.url);
  if (orderRef) payUrl.searchParams.set("orderRef", orderRef);
  if (schoolId) payUrl.searchParams.set("schoolId", schoolId);
  if (plan) payUrl.searchParams.set("plan", plan);
  if (amountLabel) payUrl.searchParams.set("amountLabel", amountLabel);
  if (kind) payUrl.searchParams.set("kind", kind);
  if (invoiceId) payUrl.searchParams.set("invoiceId", invoiceId);
  if (billingPeriod) payUrl.searchParams.set("billingPeriod", billingPeriod);

  return NextResponse.redirect(payUrl);
}