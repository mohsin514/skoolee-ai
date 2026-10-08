import { prisma } from "@/lib/db/prisma";
import { ApiError, canManageSubscription, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { findApprovedPlanChange, saveSubscriptionRequest } from "@/lib/billing/lifecycle";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  plan: z.enum(["BASIC", "PRO", "ENTERPRISE"]),
  billingPeriod: z.enum(["monthly", "annual"]),
  idempotencyKey: z.string().trim().min(12).max(120),
  receiptRef: z.string().trim().max(500).optional().nullable(),
});

export async function POST(req: Request) {
  try {
    const user = await requireAuthUser({ allowSuspended: true });
    if (!canManageSubscription(user)) throw new ApiError("Insufficient permissions", 403);

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) throw new ApiError("Invalid payment report", 400);
    const { plan, receiptRef, billingPeriod, idempotencyKey } = parsed.data;
    const approved = await findApprovedPlanChange(user.schoolId, plan, billingPeriod);
    if (!approved) throw new ApiError("A platform-reviewed plan change is required before reporting payment", 409);

    const report = await saveSubscriptionRequest({
      schoolId: user.schoolId,
      userId: user.userId,
      idempotencyKey,
      kind: "PAYMENT_REPORT",
      requestedPlan: plan,
      details: {
        billingPeriod,
        receiptRef: receiptRef || null,
        approvedPlanChangeRequestId: approved.id,
        status: "REVIEW_REQUIRED",
      },
    });

    const config = await prisma.platformConfig.findUnique({ where: { key: "payment_requests" } });
    const requests = ((config?.value ?? []) as any[]) || [];
    const newRequest = {
      id: report.id,
      schoolId: user.schoolId,
      schoolName: user.fullName || user.email,
      plan,
      receiptRef: receiptRef || null,
      billingPeriod,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    requests.push(newRequest);

    await prisma.platformConfig.upsert({
      where: { key: "payment_requests" },
      create: { key: "payment_requests", value: requests as any },
      update: { value: requests as any },
    });

    return Response.json({ success: true, requestId: report.id, message: "Payment report submitted for platform review." }, { status: 202 });
  } catch (error) {
    return errorResponse(error, "[billing/payment-request] POST failed");
  }
}
