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
    // G12: the institution authority (group admin, or the school admin of a single school), school-scoped.
    if (!isInstitutionAuthority(user)) throw new ApiError("Only the institution administrator can open this.", 403);

    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action") || "";
    const days = Math.min(Math.max(parseInt(searchParams.get("days") || "30", 10), 1), 365);
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "50", 10), 1), 200);
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10), 1);

    // The platform audit table is global; this school sees only actions by its own people or about itself.
    const where: any = {
      createdAt: { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) },
      OR: [{ user: { schoolId: user.schoolId } }, { newValues: { path: ["schoolId"], equals: user.schoolId } }],
    };
    if (action) where.action = action;

    const [logs, total] = await Promise.all([
      prisma.superAdminAuditLog.findMany({
        where,
        include: {
          user: { select: { id: true, fullName: true, email: true } },
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
    return errorResponse(error, "[super/audit-logs] GET failed");
  }
}
