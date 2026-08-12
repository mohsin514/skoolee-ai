import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser, type AuthUser } from "@/lib/auth";
import { billingAccessResponse } from "@/lib/billing/response";
import { isCampusAdminRole } from "@/lib/roles";
import { assertPermission } from "@/lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function canReviewAI(user: AuthUser) {
  return user.role === "SUPER_ADMIN" || user.role === "PRINCIPAL" || isCampusAdminRole(user.role);
}

function stringFromDraft(draft: unknown, key: string) {
  if (!draft || typeof draft !== "object") return null;
  const value = (draft as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value : null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const billingBlocked = await billingAccessResponse(user.schoolId);
    if (billingBlocked) return billingBlocked;
    if (!canReviewAI(user)) {
      return Response.json({ error: "Insufficient permissions" }, { status: 403 });
    }
    await assertPermission(user, "ai", "edit");

    const body = await req.json();
    const action = body?.action;
    if (action !== "approve" && action !== "reject") {
      return Response.json({ error: "action must be approve or reject" }, { status: 400 });
    }

    const { id } = await params;
    const item = await prisma.aIReviewItem.findFirst({
      where: {
        id,
        schoolId: user.schoolId,
        ...(user.campusId ? { campusId: user.campusId } : {}),
      },
    });

    if (!item) return Response.json({ error: "Review item not found" }, { status: 404 });
    if (item.status !== "PENDING") {
      return Response.json({ error: "Review item is already closed" }, { status: 409 });
    }

    const now = new Date();
    const status = action === "approve" ? "APPROVED" : "REJECTED";

    const updated = await prisma.$transaction(async (tx) => {
      const reviewItem = await tx.aIReviewItem.update({
        where: { id: item.id },
        data: {
          status,
          approvedBy: action === "approve" ? user.userId : null,
          approvedAt: action === "approve" ? now : null,
        },
      });

      if (item.relatedType === "REPORT_CARD") {
        if (action === "approve") {
          await tx.reportCard.update({
            where: { id: item.relatedId },
            data: {
              remarksEn: stringFromDraft(item.draft, "remarkEn"),
              remarksUr: stringFromDraft(item.draft, "remarkUr"),
              remarksApproved: true,
              approvedBy: user.userId,
              approvedAt: now,
              status: "REVIEWED",
              pdfUrl: null,
            },
          });
        } else {
          await tx.reportCard.update({
            where: { id: item.relatedId },
            data: {
              remarksApproved: false,
              approvedBy: null,
              approvedAt: null,
              status: "GENERATED",
              pdfUrl: null,
            },
          });
        }
      }

      if (item.relatedType === "AI_INSIGHT") {
        await tx.aIInsight.update({
          where: { id: item.relatedId },
          data: {
            approvalStatus: status,
            approvedBy: action === "approve" ? user.userId : null,
            approvedAt: action === "approve" ? now : null,
            status: action === "reject" ? "REJECTED" : "ACTIVE",
          },
        });
      }

      if (item.relatedType === "INTERVENTION_PLAN") {
        await tx.interventionPlan.update({
          where: { id: item.relatedId },
          data: {
            status,
            approvedBy: action === "approve" ? user.userId : null,
            approvedAt: action === "approve" ? now : null,
          },
        });
      }

      await tx.aIUsageLog.updateMany({
        where: {
          schoolId: user.schoolId,
          campusId: item.campusId,
          feature: item.feature,
          approvalStatus: "PENDING_REVIEW",
        },
        data: { approvalStatus: status },
      });

      return reviewItem;
    });

    return Response.json({ success: true, reviewItem: updated });
  } catch (error) {
    console.error("[ai/review/[id]] PATCH failed", error);
    return Response.json({ error: "Operation failed" }, { status: 500 });
  }
}
