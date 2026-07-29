import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  errorResponse,
  requireAuthUser,
  resolveCampusId,
} from "@/lib/api/scope";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const { searchParams } = new URL(req.url);

    const requestedCampusId = searchParams.get("campusId");
    const campusId =
      user.role === "SUPER_ADMIN" && !requestedCampusId
        ? null
        : await resolveCampusId(user, requestedCampusId);

    const campusWhere = {
      schoolId: user.schoolId,
      ...(campusId ? { id: campusId } : {}),
    };
    const campuses = await prisma.campus.findMany({
      where: campusWhere,
      select: { id: true },
    });
    const campusIds = campuses.map((c) => c.id);

    const invoices = await prisma.invoice.findMany({
      where: { campusId: { in: campusIds } },
      include: {
        student: {
          select: {
            class: { select: { id: true, name: true, section: true } },
          },
        },
      },
    });

    const classMap = new Map<string, {
      className: string;
      studentIds: Set<string>;
      totalDue: number;
      totalPaid: number;
      totalOverdue: number;
    }>();

    for (const inv of invoices) {
      const key = inv.student.class.id;
      const cls = classMap.get(key) ?? {
        className: `${inv.student.class.name}${inv.student.class.section ? ` ${inv.student.class.section}` : ""}`,
        studentIds: new Set<string>(),
        totalDue: 0,
        totalPaid: 0,
        totalOverdue: 0,
      };
      cls.studentIds.add(inv.studentId);
      cls.totalDue += inv.totalAmount;
      cls.totalPaid += inv.totalAmountPaid;
      if (inv.status === "PENDING" || inv.status === "OVERDUE") {
        cls.totalOverdue += inv.balanceDue;
      }
      classMap.set(key, cls);
    }

    const byClass = Array.from(classMap.values())
      .map((c) => ({
        className: c.className,
        totalStudents: c.studentIds.size,
        totalDue: c.totalDue,
        totalPaid: c.totalPaid,
        totalOverdue: c.totalOverdue,
        collectionRate: c.totalDue > 0 ? Math.round((c.totalPaid / c.totalDue) * 100) : 0,
      }))
      .sort((a, b) => a.collectionRate - b.collectionRate);

    const payments = await prisma.payment.findMany({
      where: { campusId: { in: campusIds } },
      select: { paymentMethod: true, amount: true },
    });

    const methodMap = new Map<string, { count: number; total: number }>();
    let grandTotal = 0;
    for (const p of payments) {
      const m = methodMap.get(p.paymentMethod) ?? { count: 0, total: 0 };
      m.count += 1;
      m.total += p.amount;
      grandTotal += p.amount;
      methodMap.set(p.paymentMethod, m);
    }

    const byMethod = Array.from(methodMap.entries())
      .map(([method, vals]) => ({
        method,
        count: vals.count,
        total: vals.total,
        percentage: grandTotal > 0 ? Math.round((vals.total / grandTotal) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);

    return Response.json({
      success: true,
      data: { byClass, byMethod },
    });
  } catch (error) {
    return errorResponse(error, "[fees/reports/collection] GET failed");
  }
}
