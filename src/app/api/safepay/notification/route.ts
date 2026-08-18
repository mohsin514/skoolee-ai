import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { verifySafePayNotification } from "@/lib/payments/safepay";
import { activatePlan } from "@/lib/billing/entitlements";
import { getBillingSnapshot } from "@/lib/billing/entitlements";
import { ANNUAL_DISCOUNT, normalizePlan } from "@/config/plans";
import { recordPayment } from "@/lib/fees/payment";
import { runUnscoped, runWithTenantContext } from "@/lib/db/tenant-context";

const ANNUAL_PERIOD_DAYS = 365;

// SafePay may report the order amount in PKR (4000) or paisa (400000);
// tolerate both when validating that the paid amount matches the plan price.
function parsePaidAmount(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // A gateway callback carries no session. The signature below is what
  // authenticates it; the school is resolved from the gateway's own
  // identifiers, and the actual mutations are re-bound to that school.
  return runUnscoped("safepay webhook: no session, school resolved from order ref", () =>
    handleNotification(req)
  );
}

async function handleNotification(req: NextRequest) {
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
      const billingPeriod = (data.metadata?.billingPeriod) as string | undefined;

      // Fee payment — settle the OnlinePaymentOrder idempotently
      if (kind === "FEE" && orderRef) {
        const order = await prisma.onlinePaymentOrder.findUnique({ where: { orderRef } });
        if (order && order.status !== "COMPLETED") {
          // Now that the owning school is known, settle inside its scope so
          // the guard constrains every write below.
          await runWithTenantContext({ schoolId: order.schoolId }, () =>
            prisma.$transaction(async (tx) => {
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
            }, { timeout: 20000 })
          );
        }
      } else if (orderRef && schoolId && plan) {
        // Plan purchase — license record: plan, status, paid-through date.
        // The signature already protects metadata integrity, but the paid
        // amount is validated against the server-side plan price as a second
        // layer: only a real payment for the selected plan can activate it.
        const planType = normalizePlan(plan);
        const isAnnual = billingPeriod === "annual";
        const snapshot = await getBillingSnapshot(schoolId);
        const planPrice = (snapshot.plans[planType] as { price?: number | null } | undefined)?.price;
        const paid = parsePaidAmount(data.amount ?? data.order?.amount);

        if (planPrice == null) {
          throw new Error(`[safepay] no price defined for plan ${planType}`);
        }
        const expected = planPrice * (isAnnual ? (1 - ANNUAL_DISCOUNT) * 12 : 1);

        if (paid != null) {
          // Normalize paisa → PKR when the reported amount is clearly paisa
          // (at least 100x the expected price — the exact multiple is what
          // SafePay sends for paisa-denominated orders).
          const paidPkr = paid >= expected * 100 ? paid / 100 : paid;
          if (Math.abs(paidPkr - expected) >= 1) {
            console.error(
              `[safepay] amount mismatch for ${orderRef}: paid ${paidPkr}, expected ${expected} (${planType} ${billingPeriod})`
            );
            return Response.json({ error: "Amount mismatch" }, { status: 400 });
          }
        } else {
          console.warn(`[safepay] no amount reported for ${orderRef}; relying on signature only`);
        }

        await activatePlan(schoolId, planType, prisma, isAnnual ? ANNUAL_PERIOD_DAYS : undefined);
      }
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("[safepay/notification]", error);
    return Response.json({ error: "Notification handler failed" }, { status: 500 });
  }
}
