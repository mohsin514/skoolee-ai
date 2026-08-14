import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, errorResponse, requirePlatformOwner } from "@/lib/api/scope";
import { logSuperAdminAction } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requirePlatformOwner();

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId") || "";
    const activeOnly = searchParams.get("active") === "true";
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "50", 10), 1), 200);
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10), 1);

    const where: any = {};
    if (userId) where.userId = userId;
    if (activeOnly) where.isActive = true;

    const [sessions, total] = await Promise.all([
      prisma.loginSession.findMany({
        where,
        include: {
          user: { select: { id: true, fullName: true, email: true, role: true, school: { select: { id: true, name: true } } } },
        },
        orderBy: { loginAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.loginSession.count({ where }),
    ]);

    return Response.json({
      success: true,
      data: sessions,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    return errorResponse(error, "[owner/sessions] GET failed");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requirePlatformOwner();

    const { sessionId } = await req.json();
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
