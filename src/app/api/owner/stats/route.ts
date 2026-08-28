import { prisma } from "@/lib/db/prisma";
import { ApiError, errorResponse, requirePlatformOwner } from "@/lib/api/scope";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requirePlatformOwner();

    // The dashboard plots a year of signups and revenue and a fortnight of
    // logins. Both windows are computed once so every series shares them.
    const yearAgo = new Date();
    yearAgo.setMonth(yearAgo.getMonth() - 11, 1);
    yearAgo.setHours(0, 0, 0, 0);
    const fortnightAgo = new Date(Date.now() - 13 * 24 * 60 * 60 * 1000);
    fortnightAgo.setHours(0, 0, 0, 0);

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
      usersByRole,
      invoicesByStatus,
      studentsBySchool,
      campusesBySchool,
      signupsRaw,
      revenueRaw,
      loginsRaw,
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
      prisma.school.findMany({
        select: { id: true, name: true, plan: true, status: true, createdAt: true },
        orderBy: { name: "asc" },
      }),
      prisma.user.groupBy({ by: ["role"], _count: true }),
      prisma.invoice.groupBy({ by: ["status"], _count: true, _sum: { totalAmount: true } }),
      prisma.student.groupBy({ by: ["schoolId"], _count: true }),
      prisma.campus.groupBy({ by: ["schoolId"], _count: true }),
      // Prisma cannot group by a truncated date, and pulling a year of rows
      // into the app to bucket them there would grow with the platform.
      prisma.$queryRaw<{ bucket: Date; count: bigint }[]>`
        SELECT date_trunc('month', created_at) AS bucket, COUNT(*)::bigint AS count
        FROM schools
        WHERE created_at >= ${yearAgo}
        GROUP BY bucket
        ORDER BY bucket
      `,
      prisma.$queryRaw<{ bucket: Date; total: bigint; count: bigint }[]>`
        SELECT date_trunc('month', payment_date) AS bucket,
               COALESCE(SUM(amount), 0)::bigint AS total,
               COUNT(*)::bigint AS count
        FROM payments
        WHERE payment_date >= ${yearAgo}
        GROUP BY bucket
        ORDER BY bucket
      `,
      prisma.$queryRaw<{ bucket: Date; count: bigint }[]>`
        SELECT date_trunc('day', login_at) AS bucket, COUNT(*)::bigint AS count
        FROM login_sessions
        WHERE login_at >= ${fortnightAgo}
        GROUP BY bucket
        ORDER BY bucket
      `,
    ]);

    // COUNT/SUM come back as BigInt, which JSON.stringify refuses to serialise.
    const num = (v: bigint | number | null) => Number(v ?? 0);
    const isoDay = (d: Date) => new Date(d).toISOString().slice(0, 10);

    const studentsPerSchool = new Map(studentsBySchool.map((r) => [r.schoolId, r._count]));
    const campusesPerSchool = new Map(campusesBySchool.map((r) => [r.schoolId, r._count]));

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
        schools: schools.map(({ id, name }) => ({ id, name })),
        usersByRole: Object.fromEntries(usersByRole.map((r) => [r.role, r._count])),
        invoicesByStatus: invoicesByStatus.map((r) => ({
          status: r.status,
          count: r._count,
          amount: r._sum.totalAmount ?? 0,
        })),
        signupsByMonth: signupsRaw.map((r) => ({ month: isoDay(r.bucket), count: num(r.count) })),
        revenueByMonth: revenueRaw.map((r) => ({
          month: isoDay(r.bucket),
          amount: num(r.total),
          count: num(r.count),
        })),
        loginsByDay: loginsRaw.map((r) => ({ day: isoDay(r.bucket), count: num(r.count) })),
        schoolBreakdown: schools.map((school) => ({
          id: school.id,
          name: school.name,
          plan: school.plan,
          status: school.status,
          createdAt: school.createdAt,
          students: studentsPerSchool.get(school.id) ?? 0,
          campuses: campusesPerSchool.get(school.id) ?? 0,
        })),
      },
    });
  } catch (error) {
    return errorResponse(error, "[owner/stats] GET failed");
  }
}
