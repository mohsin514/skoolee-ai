import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  assertFeesRead,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
} from "@/lib/api/scope";

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

    const minDaysOverdue = parseInt(searchParams.get("minDays") ?? "1", 10);

    const campusWhere = {
      schoolId: user.schoolId,
      ...(campusId ? { id: campusId } : {}),
    };
    const campuses = await prisma.campus.findMany({
      where: campusWhere,
      select: { id: true },
    });
    const campusIds = campuses.map((c) => c.id);

    const overdueInvoices = await prisma.invoice.findMany({
      where: {
        campusId: { in: campusIds },
        status: { in: ["PENDING", "OVERDUE"] },
        balanceDue: { gt: 0 },
        dueDate: { lt: new Date() },
      },
      select: {
        id: true, studentId: true, invoiceNumber: true, totalAmount: true, totalAmountPaid: true,
        balanceDue: true, dueDate: true, status: true,
        student: {
          select: {
            id: true, fullName: true, rollNo: true, guardianName: true, guardianPhone: true,
            guardianEmail: true, class: { select: { name: true, section: true } },
          },
        },
      },
      orderBy: { dueDate: "asc" },
    });

    const studentMap = new Map<string, {
      studentId: string;
      studentName: string;
      rollNo: string | null;
      className: string;
      section: string | null;
      guardianName: string | null;
      guardianPhone: string | null;
      guardianEmail: string | null;
      totalDue: number;
      totalPaid: number;
      totalOverdue: number;
      maxDaysOverdue: number;
      overdueInvoices: number;
    }>();

    for (const inv of overdueInvoices) {
      const daysOverdue = Math.floor(
        (Date.now() - inv.dueDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysOverdue < minDaysOverdue) continue;

      const existing = studentMap.get(inv.studentId);
      if (existing) {
        existing.totalDue += inv.totalAmount;
        existing.totalPaid += inv.totalAmountPaid;
        existing.totalOverdue += inv.balanceDue;
        existing.overdueInvoices += 1;
        if (daysOverdue > existing.maxDaysOverdue) existing.maxDaysOverdue = daysOverdue;
      } else {
        studentMap.set(inv.studentId, {
          studentId: inv.studentId,
          studentName: inv.student.fullName,
          rollNo: inv.student.rollNo,
          className: inv.student.class.name,
          section: inv.student.class.section,
          guardianName: inv.student.guardianName,
          guardianPhone: inv.student.guardianPhone,
          guardianEmail: inv.student.guardianEmail,
          totalDue: inv.totalAmount,
          totalPaid: inv.totalAmountPaid,
          totalOverdue: inv.balanceDue,
          maxDaysOverdue: daysOverdue,
          overdueInvoices: 1,
        });
      }
    }

    const defaulters = Array.from(studentMap.values())
      .sort((a, b) => b.totalOverdue - a.totalOverdue)
      .map((d) => ({ ...d, daysOverdue: d.maxDaysOverdue }));

    return Response.json({
      success: true,
      data: defaulters,
      total: defaulters.length,
    });
  } catch (error) {
    return errorResponse(error, "[fees/reports/defaulters] GET failed");
  }
}
