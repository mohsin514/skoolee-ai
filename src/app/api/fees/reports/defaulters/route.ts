import { dominantInvoiceCurrency } from "../invoice-currency";
import { getLocalePackage } from "@/lib/locale/store";
import { CURRENCIES } from "@/lib/locale/package";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { listPagination, pageWindow } from "@/lib/lists/query";
import {
  assertFeesRead,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
} from "@/lib/api/scope";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Students with an overdue balance under the same filter as the route's `where`. $queryRaw bypasses the tenant guard, so school_id is in the SQL. */
async function countDefaulters(schoolId: string, currency: string, campusIds: string[], cutoff: Date, inclusive: boolean) {
  if (!campusIds.length) return 0;
  // Columns are UTC wall-clock `timestamp`s, so the cutoff goes in as UTC wall-clock too.
  const due = Prisma.sql`${cutoff.toISOString().slice(0, 23)}::timestamp`;
  const [row] = await prisma.$queryRaw<[{ n: number }]>(Prisma.sql`
    SELECT COUNT(DISTINCT student_id)::int AS n FROM invoices
    WHERE school_id = ${schoolId} AND currency = ${currency} AND campus_id IN (${Prisma.join(campusIds)})
      AND status <> 'CANCELLED' AND balance_due > 0
      AND ${inclusive ? Prisma.sql`due_date <= ${due}` : Prisma.sql`due_date < ${due}`}`);
  return Number(row?.n ?? 0);
}

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

    const minDaysOverdue = Number(searchParams.get("minDays") ?? "1");
    if (!Number.isSafeInteger(minDaysOverdue) || minDaysOverdue < 0) {
      return Response.json({ error: "Invalid minimum overdue days" }, { status: 400 });
    }

    const campusWhere = {
      schoolId: user.schoolId,
      ...(campusId ? { id: campusId } : {}),
    };
    const campuses = await prisma.campus.findMany({
      where: campusWhere,
      select: { id: true },
    });
    const campusIds = campuses.map((c) => c.id);

    // Default to the currency the campus actually bills in, not the locale default.
    const currency = searchParams.get("currency")
      || (await dominantInvoiceCurrency(user.schoolId, campusIds, (await getLocalePackage(user.schoolId, campusId)).currency));
    if (!CURRENCIES.includes(currency as typeof CURRENCIES[number])) return Response.json({ error: "Invalid currency" }, { status: 400 });

    // A student defaults once an unpaid invoice is at least `minDays` whole days past due.
    const now = new Date();
    const cutoff = minDaysOverdue === 0 ? now : new Date(now.getTime() - minDaysOverdue * DAY_MS);
    const dueDate = minDaysOverdue === 0 ? { lt: cutoff } : { lte: cutoff };
    const where = {
      schoolId: user.schoolId,
      currency,
      campusId: { in: campusIds },
      status: { not: "CANCELLED" as const },
      balanceDue: { gt: 0 },
      dueDate,
    };

    // SKAI-1827: aggregate per student in SQL. `page`/`limit` return one page; without them the
    // whole list comes back (export and send-all still need every defaulter).
    const paged = searchParams.has("page") || searchParams.has("limit");
    let total = 0, skip = 0, take: number | undefined, page = 1;
    const pageOf = (skip: number, take: number | undefined) => prisma.invoice.groupBy({
      by: ["studentId"],
      where,
      _sum: { totalAmount: true, totalAmountPaid: true, balanceDue: true },
      _count: { _all: true },
      _min: { dueDate: true },
      orderBy: [{ _sum: { balanceDue: "desc" } }, { _min: { dueDate: "asc" } }, { studentId: "asc" }],
      skip,
      take,
    });
    let groups: Awaited<ReturnType<typeof pageOf>>;
    if (paged) {
      const { page: requestedPage, limit } = listPagination(searchParams, 25, 100);
      take = limit;
      // SKAI-1970: count defaulters in SQL (one row, not one per student) alongside the requested page; only a
      // page past the end needs a second read once the total has clamped it to the last page.
      [total, groups] = await Promise.all([
        countDefaulters(user.schoolId, currency, campusIds, cutoff, minDaysOverdue > 0),
        pageOf((requestedPage - 1) * limit, take),
      ]);
      ({ skip, page } = pageWindow(total, requestedPage, limit));
      if (page !== requestedPage) groups = await pageOf(skip, take);
    } else {
      groups = await pageOf(skip, take);
    }
    if (!paged) total = groups.length;

    // Names, guardian contact and the class snapshot come from each student's earliest overdue invoice.
    const firstInvoices = groups.length ? await prisma.invoice.findMany({
      where: { ...where, studentId: { in: groups.map((g) => g.studentId) } },
      distinct: ["studentId"],
      orderBy: { dueDate: "asc" },
      select: {
        studentId: true,
        enrollment: { select: { rollNo: true, className: true } },
        student: {
          select: {
            fullName: true, rollNo: true, guardianName: true, guardianPhone: true,
            guardianEmail: true, class: { select: { name: true, section: true } },
          },
        },
      },
    }) : [];
    const firstByStudent = new Map(firstInvoices.map((inv) => [inv.studentId, inv]));

    const defaulters = groups.flatMap((g) => {
      const inv = firstByStudent.get(g.studentId);
      if (!inv) return [];
      const oldestDue = g._min.dueDate ?? now;
      const daysOverdue = Math.floor((now.getTime() - oldestDue.getTime()) / DAY_MS);
      return [{
        studentId: g.studentId,
        studentName: inv.student.fullName,
        rollNo: inv.enrollment?.rollNo || inv.student.rollNo,
        className: inv.enrollment?.className || inv.student.class.name,
        section: inv.enrollment ? null : inv.student.class.section,
        guardianName: inv.student.guardianName,
        guardianPhone: inv.student.guardianPhone,
        guardianEmail: inv.student.guardianEmail,
        totalDue: g._sum.totalAmount ?? 0,
        totalPaid: g._sum.totalAmountPaid ?? 0,
        totalOverdue: g._sum.balanceDue ?? 0,
        maxDaysOverdue: daysOverdue,
        overdueInvoices: g._count._all,
        currency,
        daysOverdue,
      }];
    });

    return Response.json({
      success: true,
      data: defaulters,
      total,
      ...(paged ? { pagination: { page, limit: take, total, pages: Math.max(1, Math.ceil(total / (take ?? 1))) } } : {}),
    });
  } catch (error) {
    return errorResponse(error, "[fees/reports/defaulters] GET failed");
  }
}
