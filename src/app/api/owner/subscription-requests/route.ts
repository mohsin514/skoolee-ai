import { z } from "zod";
import { ApiError, errorResponse, requirePlatformOwner } from "@/lib/api/scope";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requirePlatformOwner();
    const requests = await prisma.subscriptionRequest.findMany({
      where: { state: "PENDING_REVIEW" },
      orderBy: { createdAt: "asc" },
      take: 100,
      include: { school: { select: { id: true, name: true, plan: true } }, requestedBy: { select: { id: true, fullName: true, email: true } } },
    });
    return Response.json({ requests });
  } catch (error) {
    return errorResponse(error, "[owner/subscription-requests] GET failed");
  }
}

const reviewSchema = z.object({
  requestId: z.string().uuid(),
  decision: z.enum(["APPROVE_REQUEST", "DECLINE_REQUEST"]),
  reason: z.string().trim().min(8).max(1000),
});

export async function POST(request: Request) {
  try {
    const reviewer = await requirePlatformOwner();
    const parsed = reviewSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError("Provide a review decision and reason", 400);
    const input = parsed.data;
    const current = await prisma.subscriptionRequest.findUnique({ where: { id: input.requestId } });
    if (!current || current.state !== "PENDING_REVIEW") throw new ApiError("This request is no longer pending review", 409);
    const state = input.decision === "APPROVE_REQUEST" ? "REVIEWED_APPROVED" : "REVIEWED_DECLINED";
    await prisma.$transaction(async tx => {
      const changed = await tx.subscriptionRequest.updateMany({
        where: { id: current.id, schoolId: current.schoolId, state: "PENDING_REVIEW" },
        data: { state, reviewedById: reviewer.userId, reviewedAt: new Date(), details: {
          ...(current.details as Record<string, unknown>),
          review: { decision: input.decision, reason: input.reason, reviewerId: reviewer.userId, reviewedAt: new Date().toISOString() },
        } as any },
      });
      if (changed.count !== 1) throw new ApiError("This request was reviewed by another operator", 409);
      await tx.auditLog.create({
        data: { schoolId: current.schoolId, userId: reviewer.userId, tableName: "subscription_request",
          recordId: current.id, oldValue: { state: current.state }, newValue: { state, decision: input.decision, reason: input.reason } },
      });
    });
    return Response.json({ success: true, state, note: current.kind === "REFUND"
      ? "The refund request review is recorded. This decision does not submit or confirm a provider refund."
      : "The request review is recorded. Any provider change must still be confirmed by the authorized billing owner." });
  } catch (error) {
    return errorResponse(error, "[owner/subscription-requests] POST failed");
  }
}
