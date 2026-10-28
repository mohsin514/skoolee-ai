import { pageWindow } from "@/lib/lists/query";
import { assertListBudget } from "@/lib/lists/access";
import { ownerPagination, boundedInteger } from "@/lib/owner/list-query";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, errorResponse, requirePlatformOwner } from "@/lib/api/scope";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requirePlatformOwner();
    await assertListBudget(user, "owner/audit-logs");

    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action") || "";
    const days = boundedInteger(searchParams.get("days"), 30, 365);
    const { page: requestedPage, limit } = ownerPagination(searchParams, 50, 200);

    const where: any = {
      createdAt: { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) },
    };
    if (action) where.action = action;

    const total = await prisma.superAdminAuditLog.count({ where });
    const { page, skip, pages } = pageWindow(total, requestedPage, limit);
    const logs = await prisma.superAdminAuditLog.findMany({
        where,
        include: {
          user: { select: { id: true, fullName: true, email: true, role: true } },
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
    return errorResponse(error, "[owner/audit-logs] GET failed");
  }
}
