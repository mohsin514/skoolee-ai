import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth";
import { billingAccessResponse } from "@/lib/billing/response";
import { isCampusAdminRole } from "@/lib/roles";
import { reportRemarkSchema } from "@/lib/validators/schemas";

function canReviewReports(role: string) {
  return role === "SUPER_ADMIN" || role === "PRINCIPAL" || isCampusAdminRole(role);
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
    if (!canReviewReports(user.role)) {
      return Response.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const parsed = reportRemarkSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const reportCard = await prisma.reportCard.findFirst({
      where: { id, campus: { schoolId: user.schoolId } },
      include: { exam: { select: { campusId: true } } },
    });

    if (!reportCard) return Response.json({ error: "Report card not found" }, { status: 404 });
    if (user.campusId && reportCard.exam.campusId !== user.campusId) {
      return Response.json({ error: "Report card is outside your campus" }, { status: 403 });
    }
    if (reportCard.isSent) {
      return Response.json({ error: "Sent report cards cannot be edited" }, { status: 409 });
    }

    const nextRemarksEn = parsed.data.remarksEn !== undefined ? parsed.data.remarksEn : reportCard.remarksEn;
    const nextRemarksUr = parsed.data.remarksUr !== undefined ? parsed.data.remarksUr : reportCard.remarksUr;

    if (parsed.data.approve && !nextRemarksEn && !nextRemarksUr) {
      return Response.json({ error: "Add remarks before approving" }, { status: 400 });
    }

    const remarksChanged =
      parsed.data.remarksEn !== undefined || parsed.data.remarksUr !== undefined;

    const updated = await prisma.$transaction(async (tx) => {
      const report = await tx.reportCard.update({
        where: { id },
        data: {
          ...(parsed.data.remarksEn !== undefined ? { remarksEn: parsed.data.remarksEn || null } : {}),
          ...(parsed.data.remarksUr !== undefined ? { remarksUr: parsed.data.remarksUr || null } : {}),
          ...(remarksChanged ? { pdfUrl: null } : {}),
          ...(parsed.data.approve
            ? {
                remarksApproved: true,
                approvedBy: user.userId,
                approvedAt: new Date(),
                status: "REVIEWED",
              }
            : remarksChanged
              ? {
                  remarksApproved: false,
                  approvedBy: null,
                  approvedAt: null,
                  status: "GENERATED",
                }
              : {}),
        },
      });

      if (parsed.data.approve) {
        await tx.aIReviewItem.updateMany({
          where: {
            relatedType: "REPORT_CARD",
            relatedId: id,
            status: "PENDING",
            schoolId: user.schoolId,
          },
          data: {
            status: "APPROVED",
            approvedBy: user.userId,
            approvedAt: new Date(),
          },
        });
      } else if (remarksChanged) {
        await tx.aIReviewItem.updateMany({
          where: {
            relatedType: "REPORT_CARD",
            relatedId: id,
            schoolId: user.schoolId,
          },
          data: {
            status: "PENDING",
            approvedBy: null,
            approvedAt: null,
          },
        });
      }

      return report;
    });

    return Response.json({ success: true, reportCard: updated });
  } catch (error) {
    console.error("[reports/[id]] PATCH failed", error);
    return Response.json({ error: "Operation failed" }, { status: 500 });
  }
}
