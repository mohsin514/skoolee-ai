import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { canUseFeature } from "@/config/plans";
import { isCampusAdminRole } from "@/lib/roles";
import { errorResponse, requireAuthUser } from "@/lib/api/scope";
import {
  DEFAULT_NOTIFICATION_TEMPLATES,
  type NotificationTemplateKey,
} from "@/lib/notifications/templates";
import {
  parseNotificationTemplateKey,
  sendReportCardPublishedNotifications,
  sendStudentTemplatedCommunication,
} from "@/lib/notifications/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sendWhatsAppSchema = z.object({
  studentId: z.string().min(1),
  templateKey: z.string().optional(),
  examId: z.string().optional(),
  reportCardId: z.string().optional(),
  context: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  relatedType: z.string().optional(),
  relatedId: z.string().optional(),
  attachmentUrl: z.string().url().optional(),
  approvedSchoolData: z.boolean().optional(),
});

function canSendParentMessages(role: string) {
  return role === "SUPER_ADMIN" || role === "PRINCIPAL" || isCampusAdminRole(role);
}

export async function GET() {
  return Response.json({
    success: true,
    templates: DEFAULT_NOTIFICATION_TEMPLATES.filter((template) => template.channel === "WHATSAPP"),
  });
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canSendParentMessages(user.role)) {
      return Response.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const school = await prisma.school.findUnique({ where: { id: user.schoolId } });
    if (!school || !canUseFeature(school.plan, "whatsappEnabled")) {
      return Response.json(
        { error: "WhatsApp notifications require Basic or Pro plan" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = sendWhatsAppSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const student = await prisma.student.findFirst({
      where: {
        id: parsed.data.studentId,
        campus: { schoolId: user.schoolId },
        ...(user.campusId ? { campusId: user.campusId } : {}),
      },
      select: { id: true },
    });
    if (!student) return Response.json({ error: "Student not found" }, { status: 404 });

    if (parsed.data.reportCardId || parsed.data.examId) {
      const reportCard = await prisma.reportCard.findFirst({
        where: {
          ...(parsed.data.reportCardId ? { id: parsed.data.reportCardId } : {}),
          ...(parsed.data.examId ? { examId: parsed.data.examId } : {}),
          studentId: student.id,
          campus: { schoolId: user.schoolId },
        },
        select: { id: true },
      });

      if (!reportCard) return Response.json({ error: "Report card not found" }, { status: 404 });

      const communications = await sendReportCardPublishedNotifications({
        reportCardId: reportCard.id,
        channels: ["WHATSAPP"],
        createdById: user.userId,
      });

      return Response.json({ success: true, communications });
    }

    const key = parseNotificationTemplateKey(parsed.data.templateKey || "GENERAL_ANNOUNCEMENT");
    if (!key) return Response.json({ error: "Unknown notification template" }, { status: 400 });

    const communications = await sendStudentTemplatedCommunication({
      studentId: student.id,
      key: key as NotificationTemplateKey,
      channels: ["WHATSAPP"],
      context: parsed.data.context || {},
      createdById: user.userId,
      attachmentUrl: parsed.data.attachmentUrl,
      relatedType: parsed.data.relatedType || "MANUAL",
      relatedId: parsed.data.relatedId || undefined,
      approvedData: parsed.data.approvedSchoolData === true,
      idempotencyBase: parsed.data.relatedId ? `manual-whatsapp:${key}:${parsed.data.relatedId}` : undefined,
      metadata: { source: "api_whatsapp" },
    });

    return Response.json({ success: true, communications });
  } catch (error) {
    return errorResponse(error, "[whatsapp] send failed");
  }
}
