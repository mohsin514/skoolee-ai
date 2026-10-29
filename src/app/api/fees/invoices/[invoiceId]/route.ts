import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  ApiError,
  canManageFinance,
  errorResponse,
  requireAuthUser,
  assertSharedModuleRead,
  scopedCampusWhere,
  assertPermission,
} from "@/lib/api/scope";
import { studentScope } from "@/lib/auth/policy";
import { parseBody } from "@/lib/api/validate";
import { jsonObjectBody } from "@/lib/validators/route-bodies";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  try {
    const user = await requireAuthUser();
    const { invoiceId } = await params;
    await assertSharedModuleRead(user, "fees");

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, student: studentScope(user, "finances") },
      include: {
        student: {
          select: {
            id: true,
            fullName: true,
            rollNo: true,
            guardianName: true,
            guardianPhone: true,
            class: { select: { name: true, section: true } },
          },
        },
        payments: {
          orderBy: { paymentDate: "desc" },
          include: {
            recorder: { select: { fullName: true } },
          },
        },
      },
    });
    if (!invoice) throw new ApiError("Invoice not found", 404);

    if (user.role === "PARENT") {
      return Response.json({ success: true, data: {
        ...invoice,
        student: { ...invoice.student, guardianName: null, guardianPhone: null },
        payments: invoice.payments.map(({ recorder: _recorder, ...payment }) => payment),
      } }, { headers: { "Cache-Control": "private, no-store" } });
    }
    return Response.json({ success: true, data: invoice });
  } catch (error) {
    return errorResponse(error, "[fees/invoices/detail] GET failed");
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  try {
    const user = await requireAuthUser();
    if (!canManageFinance(user)) throw new ApiError("Insufficient permissions", 403);

    const { invoiceId } = await params;
    const body = await parseBody(req, jsonObjectBody);
    const { status } = body;

    if (!["OVERDUE", "CANCELLED"].includes(status)) {
      return Response.json({ error: "Status must be OVERDUE or CANCELLED" }, { status: 400 });
    }

    await assertPermission(user, "fees", "edit");
    // SKO-389: the change is scoped to the caller's campus, refused once any money is recorded against
    // the invoice, never reopens a cancelled invoice, and a repeat of the same request changes nothing.
    const updated = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: { id: invoiceId, schoolId: user.schoolId, ...scopedCampusWhere(user, user.role === "SUPER_ADMIN" ? null : user.campusId) },
        select: { id: true, status: true, totalAmountPaid: true, _count: { select: { paymentAllocations: true } } },
      });
      if (!invoice) throw new ApiError("Invoice not found", 404);
      if (invoice.status === status) return { invoice: await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } }), changed: false };
      if (invoice.status === "PAID") throw new ApiError("Cannot modify a paid invoice", 400);
      if (invoice.status === "CANCELLED") throw new ApiError("A cancelled invoice cannot be reopened. Issue a new invoice instead.", 409);
      if (status === "CANCELLED" && (invoice.totalAmountPaid > 0 || invoice._count.paymentAllocations > 0)) throw new ApiError("This invoice has payments recorded. Reverse or refund them through finance corrections before cancelling it.", 409);
      const result = await tx.invoice.updateMany({ where: { id: invoiceId, status: invoice.status, totalAmountPaid: invoice.totalAmountPaid }, data: { status } });
      if (result.count !== 1) throw new ApiError("This invoice changed. Refresh it before trying again.", 409);
      await tx.auditLog.create({ data: { tableName: "invoice", recordId: invoiceId, newValue: { action: "status_change", from: invoice.status, to: status }, userId: user.userId } });
      return { invoice: await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } }), changed: true };
    });

    return Response.json({
      success: true,
      data: updated.invoice,
      unchanged: !updated.changed,
      message: `Invoice marked as ${status}`,
    });
  } catch (error) {
    return errorResponse(error, "[fees/invoices/detail] PATCH failed");
  }
}
