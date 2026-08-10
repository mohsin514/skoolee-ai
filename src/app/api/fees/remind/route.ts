import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, canManageOperations, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { sendWhatsAppMessage } from "@/lib/whatsapp/client";

// POST /api/fees/remind
// body: { studentId }  — sends a fee reminder to the guardian via WhatsApp
// (falls back to SMS-less: records the ParentCommunication regardless).

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);

    const body = await req.json();
    if (!body.studentId) throw new ApiError("studentId required", 400);

    const student = await prisma.student.findFirst({
      where: { id: body.studentId, campus: { schoolId: user.schoolId } },
      include: {
        class: { select: { name: true, section: true } },
        campus: { select: { name: true } },
        invoices: {
          where: { status: { in: ["PENDING", "OVERDUE"] }, balanceDue: { gt: 0 } },
          orderBy: { dueDate: "asc" },
          select: { balanceDue: true, dueDate: true, invoiceNumber: true },
        },
      },
    });
    if (!student) throw new ApiError("Student not found", 404);
    if (student.invoices.length === 0) {
      throw new ApiError("No outstanding dues for this student", 400);
    }

    const target = student.guardianWhatsapp || student.guardianPhone;
    if (!target) throw new ApiError("Student has no guardian phone on file", 400);

    const totalDue = student.invoices.reduce((s, i) => s + i.balanceDue, 0);
    const overdue = student.invoices[0];
    const text =
      `Assalamu Alaikum ${student.guardianName || "Guardian"},\n` +
      `This is a friendly reminder from ${student.campus?.name || "your school"} that ` +
      `${student.fullName} (${student.rollNo}) has a pending fee balance of Rs ${(totalDue / 100).toLocaleString()}.` +
      (overdue?.dueDate
        ? `\nOldest due: Rs ${(overdue.balanceDue / 100).toLocaleString()} (due ${overdue.dueDate.toLocaleDateString()}).`
        : "") +
      `\nPlease settle at the accounts office at your earliest convenience.\n\nThank you.`;

    const sent = await sendWhatsAppMessage({ to: target, text });

    await prisma.parentCommunication.create({
      data: {
        schoolId: user.schoolId,
        campusId: student.campusId,
        studentId: student.id,
        createdById: user.userId,
        templateKey: "FEE_REMINDER",
        channel: "WHATSAPP",
        recipientName: student.guardianName,
        recipient: target,
        body: text,
        relatedType: "INVOICE",
        status: sent.success ? "DELIVERED" : "FAILED",
        providerMessageId: sent.messageId ?? null,
        failedReason: sent.success ? null : (sent.error ?? null),
        metadata: { feeReminder: true, totalDue },
      },
    });

    return Response.json({
      success: true,
      data: {
        studentId: student.id,
        sentTo: target,
        delivered: sent.success,
        error: sent.error ?? null,
        message: sent.success ? "Reminder sent" : "Reminder queued (WhatsApp unavailable, logged)",
      },
    });
  } catch (error) {
    return errorResponse(error, "[fees/remind] POST failed");
  }
}