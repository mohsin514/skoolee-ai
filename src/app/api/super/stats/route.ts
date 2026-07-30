import { prisma } from "@/lib/db/prisma";
import {
  ApiError,
  errorResponse,
  requireAuthUser,
} from "@/lib/api/scope";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireAuthUser();
    if (user.role !== "SUPER_ADMIN") throw new ApiError("Forbidden", 403);

    const schoolId = user.schoolId;

    const [
      campusCount,
      studentCount,
      teacherCount,
      totalUsers,
      activeUsers,
      recentLogins,
      recentAuditActions,
      totalPayments,
      pendingInvoices,
    ] = await Promise.all([
      prisma.campus.count({ where: { schoolId } }),
      prisma.student.count({ where: { campus: { schoolId } } }),
      prisma.user.count({ where: { schoolId, role: "TEACHER" } }),
      prisma.user.count({ where: { schoolId } }),
      prisma.user.count({ where: { schoolId, isActive: true } }),
      prisma.loginSession.count({
        where: {
          user: { schoolId },
          loginAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
      prisma.superAdminAuditLog.count({
        where: {
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      }),
      prisma.payment.aggregate({
        where: { campus: { schoolId } },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.invoice.count({
        where: {
          campus: { schoolId },
          status: { in: ["PENDING", "OVERDUE", "PARTIAL"] },
        },
      }),
    ]);

    return Response.json({
      success: true,
      data: {
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
      },
    });
  } catch (error) {
    return errorResponse(error, "[super/stats] GET failed");
  }
}
