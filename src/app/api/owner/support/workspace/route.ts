import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, errorResponse, requirePlatformOwner } from "@/lib/api/scope";
import { auditSupport, requireSupportGrant } from "@/lib/owner/support-access";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const actor = await requirePlatformOwner({ allowSupportAccess: true });
    const grant = await requireSupportGrant(actor, req.nextUrl.searchParams.get("grantId") || undefined);
    const domain = req.nextUrl.searchParams.get("domain") || "";
    if (!grant.scope.includes(domain)) throw new ApiError("This domain is outside the approved support scope", 403);
    let data: unknown;
    if (domain === "school_profile") {
      data = await prisma.school.findFirst({ where: { id: grant.schoolId }, select: { id: true, name: true, city: true, status: true, contactEmail: true, phone: true, website: true } });
    } else if (domain === "operations") {
      const [students, staff, campuses] = await Promise.all([
        prisma.student.count({ where: { schoolId: grant.schoolId } }),
        prisma.user.count({ where: { schoolId: grant.schoolId, role: { notIn: ["APP_OWNER", "SUPER_ADMIN"] } } }),
        prisma.campus.count({ where: { schoolId: grant.schoolId } }),
      ]);
      data = { students, staff, campuses };
    } else if (domain === "users") {
      data = await prisma.user.findMany({ where: { schoolId: grant.schoolId, role: { notIn: ["APP_OWNER", "SUPER_ADMIN"] } }, select: { id: true, fullName: true, role: true, isActive: true, campusId: true }, take: 100, orderBy: { fullName: "asc" } });
    } else if (domain === "finance") {
      const [payments, invoices] = await Promise.all([
        prisma.payment.aggregate({ where: { schoolId: grant.schoolId }, _count: true, _sum: { amount: true } }),
        prisma.invoice.groupBy({ by: ["status"], where: { schoolId: grant.schoolId }, _count: true }),
      ]);
      data = { paymentCount: payments._count, totalPayments: payments._sum.amount || 0, invoices: invoices.map((item) => ({ status: item.status, count: item._count })) };
    } else if (domain === "learning") {
      const [students, exams] = await Promise.all([
        prisma.student.count({ where: { schoolId: grant.schoolId } }),
        prisma.exam.groupBy({ by: ["status"], where: { schoolId: grant.schoolId }, _count: true }),
      ]);
      data = { students, exams: exams.map((item) => ({ status: item.status, count: item._count })) };
    } else throw new ApiError("Unsupported support domain", 400);
    await auditSupport(actor.userId, "support_sensitive_read", grant.id, { schoolId: grant.schoolId, domain });
    return Response.json({ success: true, data, grant: { id: grant.id, purpose: grant.purpose, scope: grant.scope, actions: grant.actions, expiresAt: grant.expiresAt.toISOString() } });
  } catch (error) { return errorResponse(error, "[owner/support/workspace] GET failed"); }
}
