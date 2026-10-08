import { assertPermission, errorResponse } from "@/lib/api/scope";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth";
import { billingAccessResponse } from "@/lib/billing/response";
import { isCampusAdminRole } from "@/lib/roles";
import { sendReportCardPublishedNotifications } from "@/lib/notifications/service";

export const runtime = "nodejs";

function canSendReportCards(role: string) {
  return role === "TEACHER" || role === "PRINCIPAL" || role === "SUPER_ADMIN" || isCampusAdminRole(role);
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const billingBlocked = await billingAccessResponse(user.schoolId);
    if (billingBlocked) return billingBlocked;
    if (!canSendReportCards(user.role)) {
      return Response.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    await assertPermission(user, "reports", "edit");
    const { id } = await params;

    const reportCard = await prisma.reportCard.findFirst({
      where: { id, campus: { schoolId: user.schoolId }, ...(user.role === "TEACHER" ? { exam: { class: { OR: [{ classTeacherId: user.userId }, { subjects: { some: { teacherId: user.userId } } }] } } } : {}) },
      include: {
        exam: { select: { campusId: true, status: true, publishedAt: true } },
        student: { select: { id: true } },
      },
    });

    if (!reportCard) {
      return Response.json({ error: "Report card not found" }, { status: 404 });
    }
    if (user.campusId && reportCard.exam.campusId !== user.campusId) {
      return Response.json({ error: "Report card is outside your campus" }, { status: 403 });
    }
    if (reportCard.exam.status !== "PUBLISHED") {
      return Response.json({ error: "Publish report cards before sending" }, { status: 409 });
    }
    const communications = await sendReportCardPublishedNotifications({
      reportCardId: id,
      createdById: user.userId,
    });

    return Response.json({ success: true, queued: communications.filter(c => c.status === "PENDING").length, communications });
  } catch (error) {
    console.error("[reports/[id]/send] POST failed", error);
    return errorResponse(error, "Delivery unavailable");
  }
}
