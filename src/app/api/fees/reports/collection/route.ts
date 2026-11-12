import { dominantInvoiceCurrency } from "../invoice-currency";
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

type ClassRow = { classKey: string; className: string; totalStudents: bigint; totalDue: bigint; totalPaid: bigint; totalOverdue: bigint };

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertFeesRead(user);
    const { searchParams } = new URL(req.url);

    const requestedCampusId = searchParams.get("campusId");
    const campusId =
      user.role === "SUPER_ADMIN" && !requestedCampusId
        ? null
        : await resolveCampusId(user, requestedCampusId);

    // Default to the currency this scope actually bills in, not the locale default.
    const currency = searchParams.get("currency")
      || (await dominantInvoiceCurrency(user.schoolId, campusId ? [campusId] : null, (await getLocalePackage(user.schoolId, campusId)).currency));
    if (!CURRENCIES.includes(currency as typeof CURRENCIES[number])) return Response.json({ error: "Invalid currency" }, { status: 400 });
    const campusWhere = {
      schoolId: user.schoolId,
      ...(campusId ? { id: campusId } : {}),
    };
    const campuses = await prisma.campus.findMany({
      where: campusWhere,
      select: { id: true },
    });
    const campusIds = campuses.map((c) => c.id);

    // SKAI-1826: totals are aggregated in the database; only one row per class and per method leaves it.
    // $queryRaw bypasses the Prisma tenant guard, so the school and campus scope are written into the SQL.
    const now = new Date();
    const [classRows, methodRows] = await Promise.all([
      prisma.$queryRaw<ClassRow[]>`
        SELECT COALESCE(NULLIF(e.class_id, ''), s.class_id) AS "classKey",
          MIN(COALESCE(NULLIF(e.class_name, ''), c.name || COALESCE(' ' || NULLIF(c.section, ''), ''))) AS "className",
          COUNT(DISTINCT i.student_id)::bigint AS "totalStudents",
          COALESCE(SUM(i.total_amount), 0)::bigint AS "totalDue",
          COALESCE(SUM(i.total_amount_paid), 0)::bigint AS "totalPaid",
          COALESCE(SUM(i.balance_due) FILTER (
            WHERE i.status::text IN ('PENDING', 'PARTIAL', 'OVERDUE') AND i.balance_due > 0
              AND i.due_date < (${now}::timestamptz AT TIME ZONE 'UTC')
          ), 0)::bigint AS "totalOverdue"
        FROM invoices i
        JOIN students s ON s.id = i.student_id
        JOIN classes c ON c.id = s.class_id
        LEFT JOIN student_enrollments e ON e.id = i.enrollment_id
        WHERE i.school_id = ${user.schoolId} AND i.campus_id = ANY(${campusIds}::text[]) AND i.currency = ${currency}
          AND i.status::text <> 'CANCELLED'
        GROUP BY 1`,
      prisma.payment.groupBy({
        by: ["paymentMethod"],
        where: { schoolId: user.schoolId, campusId: { in: campusIds }, invoice: { currency } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ]);

    // SKAI-1328: a cancelled invoice is not a charge; partly paid invoices are still outstanding.
    // SKAI-391: overdue means past its due date, the same rule as the defaulters report; an unpaid
    // invoice that is not due yet is outstanding, not overdue.
    const byClass = classRows
      .map((row) => {
        const totalDue = Number(row.totalDue), totalPaid = Number(row.totalPaid);
        return {
          currency,
          className: row.className,
          totalStudents: Number(row.totalStudents),
          totalDue,
          totalPaid,
          totalOverdue: Number(row.totalOverdue),
          // Capped for the same reason as the campus summary: overpaid invoices
          // written before the carry-forward split can push this past 100.
          collectionRate: totalDue > 0 ? Math.min(100, Math.round((totalPaid / totalDue) * 100)) : 0,
        };
      })
      .sort((a, b) => a.collectionRate - b.collectionRate);

    const grandTotal = methodRows.reduce((sum, row) => sum + (row._sum.amount ?? 0), 0);
    const byMethod = methodRows
      .map((row) => {
        const total = row._sum.amount ?? 0;
        return {
          currency,
          method: row.paymentMethod,
          count: row._count._all,
          total,
          percentage: grandTotal > 0 ? Math.round((total / grandTotal) * 100) : 0,
        };
      })
      .sort((a, b) => b.total - a.total);

    return Response.json({
      success: true,
      data: {
        currency, byClass, byMethod },
    });
  } catch (error) {
    return errorResponse(error, "[fees/reports/collection] GET failed");
  }
}
