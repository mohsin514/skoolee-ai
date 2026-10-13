import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  assertFeesRead,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
  scopedCampusWhere,
} from "@/lib/api/scope";

const INVOICE_STATUSES = new Set(["PENDING", "PARTIAL", "PAID", "OVERDUE", "CANCELLED"]);

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertFeesRead(user);
    const { searchParams } = new URL(req.url);
    const requestedCampusId = searchParams.get("campusId");
    const status = searchParams.get("status")?.toUpperCase();
    const classId = searchParams.get("classId");
    const campusId = user.role === "SUPER_ADMIN" && !requestedCampusId
      ? null
      : await resolveCampusId(user, requestedCampusId);

    const invoices = await prisma.invoice.findMany({
      where: {
        ...scopedCampusWhere(user, campusId),
        ...(status && INVOICE_STATUSES.has(status) ? { status: status as any } : {}),
        ...(status === "DUE" ? { status: { in: ["PENDING", "PARTIAL"] as any }, dueDate: { lt: new Date() } } : {}),
        ...(classId ? { enrollment: { classId } } : {}),
      },
      include: {
        enrollment: true,
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
        payments: { select: { id: true, amount: true, paymentMethod: true, receiptNo: true, paymentDate: true } },
      },
      orderBy: [{ dueDate: "asc" }, { generatedAt: "desc" }],
    });

    const withBalances = invoices.map((invoice) => {
      return {
        ...invoice,
        ...(invoice.enrollment ? { student: { ...invoice.student, rollNo: invoice.enrollment.rollNo, class: { id: invoice.enrollment.classId, name: invoice.enrollment.className, section: null } } } : {}),
        paidAmount: invoice.totalAmountPaid,
        balanceDue: invoice.balanceDue,
      };
    });

    return Response.json({ success: true, invoices: withBalances }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error, "[billing/invoices] GET failed");
  }
}
