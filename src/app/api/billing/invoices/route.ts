import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  errorResponse,
  requireAuthUser,
  resolveCampusId,
  scopedCampusWhere,
} from "@/lib/api/scope";

const INVOICE_STATUSES = new Set(["PENDING", "PARTIAL", "PAID", "CANCELLED"]);

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const { searchParams } = new URL(req.url);
    const requestedCampusId = searchParams.get("campusId");
    const status = searchParams.get("status")?.toUpperCase();
    const term = searchParams.get("term");
    const classId = searchParams.get("classId");
    const campusId = user.role === "SUPER_ADMIN" && !requestedCampusId
      ? null
      : await resolveCampusId(user, requestedCampusId);

    const invoices = await prisma.invoice.findMany({
      where: {
        ...scopedCampusWhere(user, campusId),
        ...(term ? { term } : {}),
        ...(status && INVOICE_STATUSES.has(status) ? { status: status as any } : {}),
        ...(status === "DUE" ? { status: { in: ["PENDING", "PARTIAL"] as any }, dueDate: { lt: new Date() } } : {}),
        ...(classId ? { student: { classId } } : {}),
      },
      include: {
        student: {
          select: {
            fullName: true,
            rollNo: true,
            guardianName: true,
            guardianPhone: true,
            class: { select: { id: true, name: true, section: true } },
          },
        },
        campus: { select: { id: true, name: true } },
        payments: { select: { id: true, amountPaid: true, method: true, receiptNo: true, paidAt: true } },
      },
      orderBy: [{ dueDate: "asc" }, { generatedAt: "desc" }],
    });

    const withBalances = invoices.map((invoice) => {
      const paidAmount = invoice.payments.reduce((sum, payment) => sum + payment.amountPaid, 0);
      return {
        ...invoice,
        paidAmount,
        balanceDue: Math.max(invoice.totalAmount - paidAmount, 0),
      };
    });

    return Response.json({ success: true, invoices: withBalances });
  } catch (error) {
    return errorResponse(error, "[billing/invoices] GET failed");
  }
}
