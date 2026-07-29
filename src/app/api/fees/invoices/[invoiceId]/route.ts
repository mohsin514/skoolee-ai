import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  ApiError,
  canManageOperations,
  errorResponse,
  requireAuthUser,
} from "@/lib/api/scope";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  try {
    const user = await requireAuthUser();
    const { invoiceId } = await params;

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, campus: { schoolId: user.schoolId } },
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
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);

    const { invoiceId } = await params;
    const body = await req.json();
    const { status } = body;

    if (!["OVERDUE", "CANCELLED"].includes(status)) {
      return Response.json({ error: "Status must be OVERDUE or CANCELLED" }, { status: 400 });
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, campus: { schoolId: user.schoolId } },
    });
    if (!invoice) throw new ApiError("Invoice not found", 404);

    if (invoice.status === "PAID") {
      return Response.json({ error: "Cannot modify a paid invoice" }, { status: 400 });
    }

    const updated = await prisma.invoice.update({
      where: { id: invoiceId },
      data: { status },
    });

    await prisma.auditLog.create({
      data: {
        tableName: "invoice",
        recordId: invoiceId,
        newValue: { action: "status_change", from: invoice.status, to: status },
        userId: user.userId,
      },
    });

    return Response.json({
      success: true,
      data: updated,
      message: `Invoice marked as ${status}`,
    });
  } catch (error) {
    return errorResponse(error, "[fees/invoices/detail] PATCH failed");
  }
}
