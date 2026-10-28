import { pageWindow } from "@/lib/lists/query";
import { assertListBudget } from "@/lib/lists/access";
import { boundedInteger, ownerPagination } from "@/lib/owner/list-query";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  ApiError,
  errorResponse,
  requireAuthUser,
} from "@/lib/api/scope";
import { isInstitutionAuthority } from "@/lib/auth/institution";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertListBudget(user, "super/audit-logs");
    // G12: the institution authority (group admin, or the school admin of a single school), school-scoped.
    if (!isInstitutionAuthority(user)) throw new ApiError("Only the institution administrator can open this.", 403);

    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action") || "";
    const days = boundedInteger(searchParams.get("days"), 30, 365);
    const { page: requestedPage, limit } = ownerPagination(searchParams, 50, 200);

    // The platform audit table is global; this school sees only actions by its own people or about itself.
    const where: any = {
      createdAt: { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) },
      OR: [{ user: { schoolId: user.schoolId } }, { newValues: { path: ["schoolId"], equals: user.schoolId } }],
    };
    if (action) where.action = action;

    const total = await prisma.superAdminAuditLog.count({ where });
    const { page, skip, pages } = pageWindow(total, requestedPage, limit);
    const logs = await prisma.superAdminAuditLog.findMany({
        where,
        include: {
          user: { select: { id: true, fullName: true, email: true } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: limit,
      });

    return Response.json({
      success: true,
      data: logs,
      pagination: { page, limit, total, pages },
    });
  } catch (error) {
    return errorResponse(error, "[super/audit-logs] GET failed");
  }
}
