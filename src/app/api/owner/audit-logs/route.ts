import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser({ allowSuspended: true });
    if (user.role !== "APP_OWNER") throw new ApiError("Forbidden", 403);

    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action") || "";
    const days = Math.min(Math.max(parseInt(searchParams.get("days") || "30", 10), 1), 365);
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "50", 10), 1), 200);
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10), 1);

    const where: any = {
      createdAt: { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) },
    };
    if (action) where.action = action;

    const [logs, total] = await Promise.all([
      prisma.superAdminAuditLog.findMany({
        where,
        include: {
          user: { select: { id: true, fullName: true, email: true, role: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.superAdminAuditLog.count({ where }),
    ]);

    return Response.json({
      success: true,
      data: logs,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    return errorResponse(error, "[owner/audit-logs] GET failed");
  }
}
