import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { ApiError, assertPermission, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { campusScope } from "@/lib/auth/policy";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { readBoundedJson } from "@/lib/school-ai/http";
import { sendStudentTemplatedCommunication } from "@/lib/notifications/service";

/** One existing invoice, current verified guardians and truthful provider acceptance. */
export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const user = await requireAuthUser(); await assertPermission(user, "fees", "edit");
    if (["PARENT", "STUDENT", "TEACHER"].includes(user.role)) throw new ApiError("Insufficient permissions", 403);
    const parsed = z.strictObject({ studentId: z.string().min(1).max(128) }).safeParse(await readBoundedJson(req, 2000));
    if (!parsed.success) throw new ApiError("A valid studentId is required", 400);
    const body = parsed.data;
    const student = await prisma.student.findFirst({ where: { id: body.studentId, ...campusScope(user), archivedAt: null }, select: { id: true, invoices: { where: { status: { in: ["PENDING", "OVERDUE"] }, balanceDue: { gt: 0 } }, orderBy: [{ dueDate: "asc" }, { id: "asc" }], take: 1, select: { id: true, balanceDue: true, dueDate: true, status: true } } } });
    if (!student) throw new ApiError("Student not found", 404);
    const invoice = student.invoices[0]; if (!invoice) throw new ApiError("No outstanding dues for this student", 400);
    const communications = await sendStudentTemplatedCommunication({ studentId: student.id, key: invoice.status === "OVERDUE" ? "FEE_OVERDUE_REMINDER" : "FEE_DUE_REMINDER", channels: ["WHATSAPP"], context: { balanceDueMinor: invoice.balanceDue }, createdById: user.userId, relatedType: "INVOICE", relatedId: invoice.id, approvedData: true, idempotencyBase: `fee-reminder:${invoice.id}:${new Date().toISOString().slice(0, 10)}` });
    if (!communications.length) throw new ApiError("No current guardian has verified WhatsApp consent and financial record access. Review guardian channel preferences.", 409);
    return Response.json({ success: true, data: { studentId: student.id, accepted: communications.filter(item => item.status === "SENT").length, delivered: false, communications: communications.map(item => ({ id: item.id, status: item.status })), message: "Provider acceptance is shown separately from confirmed delivery." } });
  } catch (error) { return errorResponse(error, "[fees/remind] POST failed"); }
}
