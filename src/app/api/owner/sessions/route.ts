import { pageWindow } from "@/lib/lists/query";
import { assertListBudget } from "@/lib/lists/access";
import { ownerPagination } from "@/lib/owner/list-query";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, errorResponse, requirePlatformOwner } from "@/lib/api/scope";
import { logSuperAdminAction } from "@/lib/audit";
import { parseBody } from "@/lib/api/validate";
import { jsonObjectBody } from "@/lib/validators/route-bodies";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requirePlatformOwner();
    await assertListBudget(user, "owner/sessions");

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId") || "";
    const activeOnly = searchParams.get("active") === "true";
    const { page: requestedPage, limit } = ownerPagination(searchParams, 50, 200);

    const where: any = {};
    if (userId) where.userId = userId;
    if (activeOnly) { where.isActive = true; where.expiresAt = { gt: new Date() }; }

    const total = await prisma.loginSession.count({ where });
    const { page, skip, pages } = pageWindow(total, requestedPage, limit);
    const sessions = await prisma.loginSession.findMany({
        where,
        include: {
          user: { select: { id: true, fullName: true, email: true, role: true, school: { select: { id: true, name: true } } } },
        },
        orderBy: [{ loginAt: "desc" }, { id: "desc" }],
        skip,
        take: limit,
      });

    return Response.json({
      success: true,
      data: sessions,
      pagination: { page, limit, total, pages },
    });
  } catch (error) {
    return errorResponse(error, "[owner/sessions] GET failed");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requirePlatformOwner();

    const { sessionId } = await parseBody(req, jsonObjectBody);
    if (!sessionId) throw new ApiError("sessionId required", 400);

    const session = await prisma.loginSession.findUnique({
      where: { id: sessionId },
      include: { user: { select: { email: true } } },
    });

    if (!session) throw new ApiError("Session not found", 404);

    await prisma.loginSession.update({
      where: { id: sessionId },
      data: { isActive: false, logoutAt: new Date() },
    });

    await logSuperAdminAction({
      userId: user.userId,
      action: "session_terminated",
      targetType: "session",
      targetId: sessionId,
      targetName: session.user.email,
    }).catch(() => {});

    return Response.json({ success: true, message: "Session terminated" });
  } catch (error) {
    return errorResponse(error, "[owner/sessions] DELETE failed");
  }
}
