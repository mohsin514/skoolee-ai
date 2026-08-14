import { prisma } from "@/lib/db/prisma";
import { ApiError, errorResponse, requirePlatformOwner } from "@/lib/api/scope";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requirePlatformOwner();

    const [
      schoolCount,
      campusCount,
      studentCount,
      teacherCount,
      totalUsers,
      activeUsers,
      recentLogins,
      recentAuditActions,
      totalPayments,
      pendingInvoices,
      schoolsByStatus,
      schoolsByPlan,
      schools,
    ] = await Promise.all([
      prisma.school.count(),
      prisma.campus.count(),
      prisma.student.count(),
      prisma.user.count({ where: { role: "TEACHER" } }),
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.loginSession.count({
        where: { loginAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      }),
      prisma.superAdminAuditLog.count({
        where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      }),
      prisma.payment.aggregate({ _sum: { amount: true }, _count: true }),
      prisma.invoice.count({ where: { status: { in: ["PENDING", "OVERDUE", "PARTIAL"] } } }),
      prisma.school.groupBy({ by: ["status"], _count: true }),
      prisma.school.groupBy({ by: ["plan"], _count: true }),
      prisma.school.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ]);

    return Response.json({
      success: true,
      data: {
        schoolCount,
        campusCount,
        studentCount,
        teacherCount,
        totalUsers,
        activeUsers,
        inactiveUsers: totalUsers - activeUsers,
        recentLogins,
        recentAuditActions,
        totalRevenue: totalPayments._sum.amount || 0,
        totalPaymentCount: totalPayments._count,
        pendingInvoices,
        schoolsByStatus: Object.fromEntries(schoolsByStatus.map((s) => [s.status, s._count])),
        schoolsByPlan: Object.fromEntries(schoolsByPlan.map((s) => [s.plan, s._count])),
        schools,
      },
    });
  } catch (error) {
    return errorResponse(error, "[owner/stats] GET failed");
  }
}
