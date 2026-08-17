import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  assertFeesRead,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
} from "@/lib/api/scope";
import { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertFeesRead(user);
    const { searchParams } = new URL(req.url);
    const requestedCampusId = searchParams.get("campusId");

    const campusId = user.role === "SUPER_ADMIN" && !requestedCampusId
      ? null
      : await resolveCampusId(user, requestedCampusId);

    const campusWhere: Prisma.CampusWhereInput = {
      schoolId: user.schoolId,
      ...(campusId ? { id: campusId } : {}),
    };

    const campuses = await prisma.campus.findMany({
      where: campusWhere,
      select: { id: true, name: true },
    });

    const campusIds = campuses.map((c) => c.id);

    const [invoiceAgg, overdueAgg, byClassRaw, overdueInvoices, recentPayments] = await Promise.all([
      prisma.invoice.aggregate({
        where: { campusId: { in: campusIds } },
        _sum: { totalAmount: true, totalAmountPaid: true, balanceDue: true },
      }),
      prisma.invoice.aggregate({
        where: { campusId: { in: campusIds }, status: { in: ["PENDING", "OVERDUE"] } },
        _sum: { balanceDue: true },
      }),
      prisma.invoice.groupBy({
        by: ["studentId"],
        where: { campusId: { in: campusIds } },
        _sum: { totalAmount: true, totalAmountPaid: true },
      }),
      prisma.invoice.findMany({
        where: { campusId: { in: campusIds }, status: { in: ["PENDING", "OVERDUE"] }, balanceDue: { gt: 0 } },
        include: { student: { select: { id: true, fullName: true, class: { select: { name: true } } } } },
        orderBy: { dueDate: "asc" },
        take: 50,
      }),
      prisma.payment.findMany({
        where: { campusId: { in: campusIds } },
        include: {
          student: { select: { fullName: true } },
          invoice: { select: { invoiceNumber: true } },
        },
        orderBy: { paymentDate: "desc" },
        take: 10,
      }),
    ]);

    const totalReceivable = invoiceAgg._sum.totalAmount ?? 0;
    const totalCollected = invoiceAgg._sum.totalAmountPaid ?? 0;
    const totalOutstanding = invoiceAgg._sum.balanceDue ?? 0;
    const totalOverdue = overdueAgg._sum.balanceDue ?? 0;
    // Capped at 100. Rows written before overpayments were split into carry-forward
    // credit can still carry a totalAmountPaid above their totalAmount, and a
    // headline "102% collected" reads as a reporting bug rather than as overpayment.
    const collectionRate =
      totalReceivable > 0 ? Math.min(100, Math.round((totalCollected / totalReceivable) * 100)) : 0;

    const studentIds = byClassRaw.map((r) => r.studentId);
    const students = studentIds.length > 0 ? await prisma.student.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, class: { select: { id: true, name: true } } },
    }) : [];
    const studentClassMap = new Map(students.map((s) => [s.id, s.class.name]));

    const classMap = new Map<string, { totalDue: number; totalPaid: number }>();
    for (const row of byClassRaw) {
      const className = studentClassMap.get(row.studentId) ?? "Unknown";
      const prev = classMap.get(className) ?? { totalDue: 0, totalPaid: 0 };
      prev.totalDue += row._sum.totalAmount ?? 0;
      prev.totalPaid += row._sum.totalAmountPaid ?? 0;
      classMap.set(className, prev);
    }

    const byClass = Array.from(classMap.entries()).map(([className, vals]) => ({
      className,
      totalDue: vals.totalDue,
      totalPaid: vals.totalPaid,
      collectionRate:
        vals.totalDue > 0 ? Math.min(100, Math.round((vals.totalPaid / vals.totalDue) * 100)) : 0,
    }));

    const atRiskStudents = overdueInvoices
      .map((inv) => {
        const daysOverdue = Math.floor((Date.now() - inv.dueDate.getTime()) / (1000 * 60 * 60 * 24));
        return {
          studentId: inv.studentId,
          studentName: inv.student.fullName,
          className: inv.student.class.name,
          totalOverdue: inv.balanceDue,
          daysOverdue,
          paymentStatus: daysOverdue > 30 ? "critical" : daysOverdue > 15 ? "warning" : "due",
        };
      })
      .filter((s, idx, self) => self.findIndex((t) => t.studentId === s.studentId) === idx)
      .slice(0, 20);

    return Response.json({
      success: true,
      data: {
        totalReceivable,
        totalCollected,
        totalOutstanding,
        totalOverdue,
        collectionRate,
        byClass,
        atRiskStudents,
        recentPayments: recentPayments.map((p) => ({
          id: p.id,
          studentName: p.student.fullName,
          amount: p.amount,
          paymentDate: p.paymentDate.toISOString().split("T")[0],
          paymentMethod: p.paymentMethod,
          receiptNo: p.receiptNo ?? "",
          invoiceNumber: p.invoice.invoiceNumber ?? "",
        })),
      },
    });
  } catch (error) {
    return errorResponse(error, "[fees/campus/summary] GET failed");
  }
}
