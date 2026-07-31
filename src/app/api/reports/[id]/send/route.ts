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
  const user = await getAuthUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const billingBlocked = await billingAccessResponse(user.schoolId);
  if (billingBlocked) return billingBlocked;
  if (!canSendReportCards(user.role)) {
    return Response.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const { id } = await params;

  const reportCard = await prisma.reportCard.findFirst({
    where: { id, campus: { schoolId: user.schoolId } },
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
  if (reportCard.isSent) {
    return Response.json({ success: true, alreadySent: true });
  }

  const communications = await sendReportCardPublishedNotifications({
    reportCardId: id,
    createdById: user.userId,
    approvedData: true,
  });

  const channels: string[] = [];
  const errors: string[] = [];

  for (const communication of communications) {
    if (communication.status === "SENT") {
      channels.push(communication.channel);
    } else if (communication.failedReason) {
      errors.push(`${communication.channel}: ${communication.failedReason}`);
    } else if (communication.status !== "PENDING") {
      errors.push(`${communication.channel}: ${communication.status}`);
    }
  }

  if (channels.length === 0 && communications.every((communication) => communication.status === "NO_RECIPIENT")) {
    await prisma.reportCard.update({
      where: { id },
      data: {
        deliveryStatus: "NO_CONTACT",
        deliveryError: "No parent WhatsApp or email on file",
      },
    });
    return Response.json({ error: "No parent WhatsApp or email on file for this student" }, { status: 400 });
  }

  if (channels.length > 0) {
    await prisma.reportCard.update({
      where: { id },
      data: {
        isSent: true,
        status: "SENT",
        sentVia: channels.length === 2 ? "BOTH" : channels[0],
        sentAt: new Date(),
        deliveryStatus: "SENT",
        deliveryError: errors.length ? errors.join("; ") : null,
      },
    });
    return Response.json({ success: true, sent: 1 });
  }

  const blocked = communications.some((communication) => communication.status === "BLOCKED");
  await prisma.reportCard.update({
    where: { id },
    data: {
      deliveryStatus: blocked ? "BLOCKED" : "FAILED",
      deliveryError: errors.join("; ") || "Delivery failed",
    },
  });
  return Response.json({ error: errors.join("; ") || "Delivery failed" }, { status: 400 });
}
