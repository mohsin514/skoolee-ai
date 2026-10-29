import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { z } from "zod";
import { resolvePaymentProvider } from "@/lib/payments/provider";
import { fieldErrorsOf } from "@/lib/api/validate";
import { activatePlan, getBillingSnapshot } from "@/lib/billing/entitlements";
import { ANNUAL_DISCOUNT, normalizePlan } from "@/config/plans";
import { recordPayment } from "@/lib/fees/payment";
import { runUnscoped, runWithTenantContext } from "@/lib/db/tenant-context";
import { decodePlanContractMetadata } from "@/config/commercial-contract";
import { settleVerifiedCheckoutIntent } from "@/lib/billing/checkout-intents";
import { claimProviderEvent, finishProviderEvent, NeedsReview } from "@/lib/billing/provider-events";

const ANNUAL_PERIOD_DAYS = 365;

// SKAI-1195: SafePay notifications are small; anything larger is refused unread.
const MAX_WEBHOOK_BYTES = 64 * 1024;
const text = (max: number) => z.string().max(max);
const amount = z.union([z.number(), text(32)]);
/** Shape of the fields this handler reads. Unknown fields pass through so the signed payload is untouched. */
const notificationSchema = z.object({
  event: text(64).min(1),
  data: z.object({
    order_ref: text(200).optional(),
    amount: amount.nullish(),
    order: z.object({ amount: amount.nullish() }).passthrough().nullish(),
    metadata: z.record(z.string(), text(16_000)).optional(),
  }).passthrough().optional(),
}).passthrough();

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

    // SKAI-1195: read the raw body, verify the signature over it, and only then parse and validate.
    // Every rejection here happens before any read or write.
    if (Number(req.headers.get("content-length") ?? 0) > MAX_WEBHOOK_BYTES) {
      return Response.json({ error: "Notification too large" }, { status: 413 });
    }
    const rawBody = await req.text();
    if (Buffer.byteLength(rawBody) > MAX_WEBHOOK_BYTES) {
      return Response.json({ error: "Notification too large" }, { status: 413 });
    }
    const provider = resolvePaymentProvider("PKR")!;
    if (!provider.verifyWebhook({ rawBody, headers: Object.fromEntries(req.headers) })) {
      return Response.json({ error: "Invalid signature" }, { status: 400 });
    }
    const parsed = notificationSchema.safeParse(JSON.parse(rawBody));
    if (!parsed.success) {
      return Response.json({ error: "Invalid notification", details: fieldErrorsOf(parsed.error) }, { status: 400 });
    }
    const body = parsed.data;

    const event = body.event as string;
    const data = body.data as Record<string, any> | undefined;

    if (["order.completed", "order.cancelled", "order.failed"].includes(event) && data) {
      const orderRef = (data.order_ref || data.metadata?.orderRef || data.metadata?.orderId) as string | undefined;
      const schoolId = (data.metadata?.schoolId) as string | undefined;
      const plan = (data.metadata?.plan) as string | undefined;
      const kind = (data.metadata?.kind) as string | undefined;
      const billingPeriod = (data.metadata?.billingPeriod) as string | undefined;
      const quotedContract = decodePlanContractMetadata(data.metadata?.commercialContract, normalizePlan(plan || ""));

      const checkoutIntentId = data.metadata?.checkoutIntentId as string | undefined;
      if (checkoutIntentId) {
        const orderRef = (data.order_ref || data.metadata?.orderRef || data.metadata?.orderId) as string | undefined;
        const schoolId = data.metadata?.schoolId as string | undefined;
        const plan = data.metadata?.plan as string | undefined;
        const billingPeriod = data.metadata?.billingPeriod as string | undefined;
        if (!orderRef || !schoolId || !plan || !["monthly", "annual"].includes(billingPeriod || "")) {
          return Response.json({ error: "Checkout confirmation is incomplete" }, { status: 400 });
        }

        const intent = await prisma.onboardingCheckoutIntent.findFirst({
          where: { id: checkoutIntentId, schoolId },
        });
        if (!intent || intent.provider !== "SAFEPAY" || intent.providerReference !== orderRef ||
            intent.plan !== plan || intent.billingPeriod !== billingPeriod) {
          return Response.json({ error: "Checkout confirmation does not match a saved intent" }, { status: 409 });
        }

        if (event === "order.completed") {
          const paid = parsePaidAmount(data.amount ?? data.order?.amount);
          const expected = intent.amount;
          if (paid == null || expected == null) {
            return Response.json({ error: "SafePay did not report a verifiable paid amount" }, { status: 400 });
          }
          const paidPkr = paid >= expected * 100 ? paid / 100 : paid;
          if (Math.abs(paidPkr - expected) >= 1) {
            return Response.json({ error: "Amount mismatch" }, { status: 400 });
          }
          const callbackPlan = normalizePlan(plan);
          const quotedContract = decodePlanContractMetadata(
            data.metadata?.commercialContract as string | undefined,
            callbackPlan,
          );
          if (!quotedContract || quotedContract.catalogVersion !== intent.catalogueVersion) {
            return Response.json({ error: "Saved commercial terms could not be verified" }, { status: 409 });
          }
          await settleVerifiedCheckoutIntent({
            id: intent.id,
            schoolId: intent.schoolId,
            provider: "SAFEPAY",
            providerReference: orderRef,
            plan: callbackPlan,
            billingPeriod: billingPeriod as "monthly" | "annual",
          });
        } else if (event === "order.cancelled" || event === "order.failed") {
          await prisma.onboardingCheckoutIntent.updateMany({
            where: { id: intent.id, schoolId, provider: "SAFEPAY", providerReference: orderRef,
              status: { in: ["CHECKOUT_PENDING", "PENDING_SETTLEMENT"] } },
            data: { status: event === "order.cancelled" ? "CANCELLED" : "FAILED",
              failureReason: event === "order.cancelled" ? null : "SafePay reported a failed payment." },
          });
        }
        return Response.json({ success: true });
      }

      // Fee payment — settle the OnlinePaymentOrder idempotently
      if (kind === "FEE" && orderRef) {
        const order = await prisma.onlinePaymentOrder.findUnique({ where: { orderRef } });
        if (order && order.status !== "COMPLETED") {
          // Now that the owning school is known, settle inside its scope so
          // the guard constrains every write below.
          await runWithTenantContext({ schoolId: order.schoolId }, () =>
            prisma.$transaction(async (tx) => {
              // SKO-431: concurrent or replayed confirmations wait here and then see COMPLETED.
              await tx.$queryRaw`SELECT id FROM online_payment_orders WHERE id=${order.id} FOR UPDATE`;
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
      } else if (event === "order.completed" && orderRef && schoolId && plan) {
        // Plan purchase — license record: plan, status, paid-through date.
        // SKO-373: one receipt per order, claimed before any effect, so a
        // replayed confirmation never extends the paid-through date twice.
        const eventId = `safepay:${event}:${orderRef}`;
        const claim = await claimProviderEvent({ provider: "SAFEPAY", eventId, eventType: event, eventCreated: Math.floor(Date.now() / 1000) });
        if (claim === "duplicate") return Response.json({ success: true, duplicate: true });
        if (claim === "in_progress") return Response.json({ success: true, pending: true }, { status: 202 });
        try {
          if (!(await prisma.school.findUnique({ where: { id: schoolId }, select: { id: true } }))) throw new NeedsReview("No institution matches this SafePay order.");
          // The signature protects metadata integrity; the paid amount is
          // still checked against the plan price so only a real payment for
          // the selected plan can activate it.
          const planType = normalizePlan(plan);
          const isAnnual = billingPeriod === "annual";
          const snapshot = quotedContract ? null : await getBillingSnapshot(schoolId);
          const planPrice = quotedContract?.price ?? (snapshot?.plans[planType] as { price?: number | null } | undefined)?.price;
          if (planPrice == null) throw new NeedsReview(`No price is defined for plan ${planType}; the plan was not activated.`, schoolId);
          const expected = planPrice * (isAnnual ? (1 - ANNUAL_DISCOUNT) * 12 : 1);
          const paid = parsePaidAmount(data.amount ?? data.order?.amount);
          if (paid == null) throw new NeedsReview("SafePay reported no paid amount; the plan was not activated.", schoolId);
          // Normalize paisa → PKR when the reported amount is clearly paisa.
          const paidPkr = paid >= expected * 100 ? paid / 100 : paid;
          if (Math.abs(paidPkr - expected) >= 1) throw new NeedsReview(`Paid ${paidPkr} does not match the expected ${expected} for ${planType} ${billingPeriod}; the plan was not activated.`, schoolId);
          await prisma.$transaction(async tx => {
            await activatePlan(schoolId, planType, tx, isAnnual ? ANNUAL_PERIOD_DAYS : undefined, quotedContract);
            await tx.stripeWebhookReceipt.update({ where: { eventId }, data: { state: "PROCESSED", processedAt: new Date(), schoolId, error: null } });
          });
        } catch (error) {
          if (error instanceof NeedsReview) {
            await finishProviderEvent(eventId, "NEEDS_REVIEW", { error: error.message, schoolId: error.schoolId ?? null });
            return Response.json({ success: true, review: true });
          }
          await finishProviderEvent(eventId, "FAILED", { error }).catch(() => undefined);
          throw error;
        }
      }
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("[safepay/notification]", error);
    return Response.json({ error: "Notification handler failed" }, { status: 500 });
  }
}
