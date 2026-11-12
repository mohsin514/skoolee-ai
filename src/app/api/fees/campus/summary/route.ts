import { dominantInvoiceCurrency } from "../../reports/invoice-currency";
import { getLocalePackage } from "@/lib/locale/store";
import { CURRENCIES } from "@/lib/locale/package";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  assertFeesRead,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
} from "@/lib/api/scope";
import { Prisma } from "@prisma/client";

type ByClassRow = { className: string; totalDue: bigint; totalPaid: bigint };

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertFeesRead(user);
    const { searchParams } = new URL(req.url);
    const requestedCampusId = searchParams.get("campusId");

    const campusId = user.role === "SUPER_ADMIN" && !requestedCampusId
      ? null
      : await resolveCampusId(user, requestedCampusId);

    // Default to the currency this scope actually bills in, not the locale default.
    const currency = searchParams.get("currency")
      || (await dominantInvoiceCurrency(user.schoolId, campusId ? [campusId] : null, (await getLocalePackage(user.schoolId, campusId)).currency));
    if (!CURRENCIES.includes(currency as typeof CURRENCIES[number])) return Response.json({ error: "Invalid currency" }, { status: 400 });
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
        where: { currency, campusId: { in: campusIds }, status: { not: "CANCELLED" } },
        _sum: { totalAmount: true, totalAmountPaid: true, balanceDue: true },
      }),
      prisma.invoice.aggregate({
        where: { currency, campusId: { in: campusIds }, status: { not: "CANCELLED" }, balanceDue: { gt: 0 }, dueDate: { lt: new Date() } },
        _sum: { balanceDue: true },
      }),
      // SKAI-1864: group by the student's current class in SQL instead of loading one row per billed
      // student and then every student. $queryRaw bypasses the tenant guard, so the school and campus
      // scope are written into the SQL (and the student join is pinned to the same school).
      prisma.$queryRaw<ByClassRow[]>`
        SELECT COALESCE(c.name, 'Unknown') AS "className",
          COALESCE(SUM(i.total_amount), 0)::bigint AS "totalDue",
          COALESCE(SUM(i.total_amount_paid), 0)::bigint AS "totalPaid"
        FROM invoices i
        LEFT JOIN students s ON s.id = i.student_id AND s.school_id = i.school_id
        LEFT JOIN classes c ON c.id = s.class_id
        WHERE i.school_id = ${user.schoolId} AND i.campus_id = ANY(${campusIds}::text[]) AND i.currency = ${currency}
          AND i.status::text <> 'CANCELLED'
        GROUP BY 1`,
      prisma.invoice.findMany({
        where: { currency, campusId: { in: campusIds }, status: { not: "CANCELLED" }, balanceDue: { gt: 0 }, dueDate: { lt: new Date() } },
        include: { student: { select: { id: true, fullName: true, class: { select: { name: true } } } } },
        orderBy: { dueDate: "asc" },
        take: 50,
      }),
      prisma.payment.findMany({
        where: { invoice: { currency }, campusId: { in: campusIds } },
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

    const byClass = byClassRaw.map((row) => {
      const totalDue = Number(row.totalDue);
      const totalPaid = Number(row.totalPaid);
      return {
        className: row.className,
        totalDue,
        totalPaid,
        collectionRate: totalDue > 0 ? Math.min(100, Math.round((totalPaid / totalDue) * 100)) : 0,
      };
    });

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
        currency,
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
