import { z } from "zod";
import { ApiError, canManageSubscription, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { prisma } from "@/lib/db/prisma";
import { parsePlan, previewPlanChange, saveSubscriptionRequest } from "@/lib/billing/lifecycle";
import { stripe } from "@/lib/stripe/server";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  action: z.enum(["preview", "request-change", "cancel", "refund"]),
  plan: z.string().optional(),
  billingPeriod: z.enum(["monthly", "annual"]).optional().default("monthly"),
  reason: z.string().trim().max(1000).optional(),
  idempotencyKey: z.string().trim().min(12).max(120),
});

export async function GET() {
  try {
    const user = await requireAuthUser({ allowSuspended: true });
    if (!canManageSubscription(user)) {
      const payer = await prisma.user.findFirst({ where: { schoolId: user.schoolId, isInstitutionOwner: true, isActive: true }, select: { fullName: true, email: true } });
      const school = await prisma.school.findUnique({ where: { id: user.schoolId }, select: { name: true } });
      return Response.json({ canManage: false, billingContact: payer, institutionName: school?.name || "your institution", requests: [] });
    }
    const school = await prisma.school.findUnique({
      where: { id: user.schoolId },
      select: { name: true, plan: true, status: true, subscriptionLifecycleState: true,
        planEndsAt: true, cancellationEffectiveAt: true, graceEndsAt: true, stripeSubscriptionId: true },
    });
    if (!school) throw new ApiError("Institution not found", 404);
    const requests = await prisma.subscriptionRequest.findMany({
      where: { schoolId: user.schoolId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, kind: true, state: true, requestedPlan: true, effectiveAt: true, details: true, createdAt: true },
    });
    return Response.json({ school, requests });
  } catch (error) {
    return errorResponse(error, "[billing/lifecycle] GET failed");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuthUser({ allowSuspended: true });
    if (!canManageSubscription(user)) throw new ApiError("Subscription management is not delegated to this membership", 403);
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError("Choose a valid subscription action", 400);
    const input = parsed.data;

    if (input.action === "preview") {
      const plan = parsePlan(input.plan);
      if (!plan || plan === "FREE" || plan === "ENTERPRISE") throw new ApiError("Choose a published plan to preview", 400);
      return Response.json({ preview: await previewPlanChange(user.schoolId, plan, input.billingPeriod) });
    }

    if (input.action === "request-change") {
      const plan = parsePlan(input.plan);
      if (!plan || plan === "FREE" || plan === "ENTERPRISE") throw new ApiError("Choose a published plan to request", 400);
      const preview = await previewPlanChange(user.schoolId, plan, input.billingPeriod);
      const requestRow = await saveSubscriptionRequest({
        schoolId: user.schoolId,
        userId: user.userId,
        idempotencyKey: input.idempotencyKey,
        kind: "PLAN_CHANGE",
        requestedPlan: plan,
        effectiveAt: preview.effectiveAt ? new Date(preview.effectiveAt) : null,
        details: { preview, reason: input.reason || null, recordsRetained: true },
      });
      return Response.json({ success: true, request: requestRow, preview }, { status: 202 });
    }

    if (input.action === "refund") {
      const school = await prisma.school.findUnique({ where: { id: user.schoolId }, select: { plan: true, planEndsAt: true } });
      if (!school) throw new ApiError("Institution not found", 404);
      const requestRow = await saveSubscriptionRequest({
        schoolId: user.schoolId,
        userId: user.userId,
        idempotencyKey: input.idempotencyKey,
        kind: "REFUND",
        effectiveAt: null,
        details: { reason: input.reason || "Refund review requested", plan: school.plan, paidThrough: school.planEndsAt, status: "REVIEW_REQUIRED" },
      });
      return Response.json({ success: true, reviewRequired: true, request: requestRow }, { status: 202 });
    }

    const school = await prisma.school.findUnique({ where: { id: user.schoolId }, select: { planEndsAt: true, stripeSubscriptionId: true } });
    if (!school) throw new ApiError("Institution not found", 404);
    let effectiveAt = school.planEndsAt;
    let providerConfirmed = false;
    if (school.stripeSubscriptionId && stripe) {
      const subscription = await stripe.subscriptions.update(school.stripeSubscriptionId, { cancel_at_period_end: true });
      if (!subscription.cancel_at_period_end) throw new ApiError("The provider did not confirm scheduled cancellation", 502);
      effectiveAt = subscription.cancel_at ? new Date(subscription.cancel_at * 1000) :
        subscription.items.data[0]?.current_period_end ? new Date(subscription.items.data[0].current_period_end * 1000) : school.planEndsAt;
      providerConfirmed = true;
    }
    const requestRow = await saveSubscriptionRequest({
      schoolId: user.schoolId,
      userId: user.userId,
      idempotencyKey: input.idempotencyKey,
      kind: "CANCELLATION",
      state: providerConfirmed ? "SCHEDULED" : "PENDING_REVIEW",
      effectiveAt,
      details: {
        providerConfirmed,
        effectiveAt: effectiveAt?.toISOString() || null,
        accessUntilEffectiveDate: true,
        recordsRetained: true,
        renewalStopsAtEffectiveDate: providerConfirmed,
        reviewRequired: !providerConfirmed,
        reason: input.reason || null,
      },
    });
    if (providerConfirmed) {
      await prisma.school.update({ where: { id: user.schoolId }, data: {
        subscriptionLifecycleState: "CANCELLATION_SCHEDULED",
        cancellationEffectiveAt: effectiveAt,
      } });
    }
    return Response.json({ success: true, request: requestRow, providerConfirmed, effectiveAt }, { status: 202 });
  } catch (error) {
    return errorResponse(error, "[billing/lifecycle] POST failed");
  }
}
