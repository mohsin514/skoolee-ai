// ===========================================
// POST /api/whatsapp/send – Send WhatsApp notifications
// ===========================================

import { NextRequest } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { z } from "zod";
import { getTenantForUser, withTenant, tenantExec } from "@/lib/db/tenant";
import { sendReportCardNotification } from "@/lib/whatsapp/client";
import { prisma } from "@/lib/db/prisma";
import { canUseFeature } from "@/config/plans";

const schema = z.object({
  studentId: z.string().min(1),
  examId: z.string().min(1),
  pdfUrl: z.string().url().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    const userId = user?.userId;
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenant = await getTenantForUser(userId);
    if (!tenant) {
      return Response.json({ error: "No tenant" }, { status: 403 });
    }

    // Check plan allows WhatsApp
    const tenantRecord = await prisma.school.findUnique({
      where: { id: tenant.schoolId },
    });
    if (!tenantRecord || !canUseFeature(tenantRecord.plan, "whatsappEnabled")) {
      return Response.json(
        { error: "WhatsApp notifications require Basic or Pro plan" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { studentId, examId, pdfUrl } = parsed.data;

    // Fetch student + guardian info
    const students = await withTenant(tenant.schemaName, async (query) => {
      return query<
        Array<{
          first_name: string;
          last_name: string;
          guardian_whatsapp: string | null;
        }>
      >(
        `SELECT first_name, last_name, guardian_whatsapp FROM students WHERE id = $1`,
        [studentId]
      );
    });

    const student = Array.isArray(students) ? students[0] : null;
    if (!student?.guardian_whatsapp) {
      return Response.json(
        { error: "Student has no guardian WhatsApp number" },
        { status: 400 }
      );
    }

    // Fetch exam name
    const exams = await withTenant(tenant.schemaName, async (query) => {
      return query<Array<{ name: string }>>(
        `SELECT name FROM exams WHERE id = $1`,
        [examId]
      );
    });
    const examName = Array.isArray(exams) && exams[0] ? exams[0].name : "Exam";

    // Send WhatsApp
    const result = await sendReportCardNotification(
      student.guardian_whatsapp,
      `${student.first_name} ${student.last_name}`,
      examName,
      pdfUrl
    );

    // Log notification
    await withTenant(tenant.schemaName, async () => {
      return tenantExec(tenant.schemaName, 
        `INSERT INTO notifications (student_id, type, recipient, message, attachment_url, status)
         VALUES ($1, 'WHATSAPP', $2, $3, $4, $5)`,
        [
          studentId,
          student.guardian_whatsapp,
          `Report card sent for ${examName}`,
          pdfUrl || null,
          result.success ? "SENT" : "FAILED",
        ]
      );
    });

    if (!result.success) {
      return Response.json(
        { error: result.error || "Failed to send WhatsApp" },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      data: { messageId: result.messageId },
    });
  } catch (error) {
    console.error("[whatsapp/send] Error:", error);
    return Response.json(
      { error: "Failed to send notification" },
      { status: 500 }
    );
  }
}
