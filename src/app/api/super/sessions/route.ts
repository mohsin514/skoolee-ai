import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  ApiError,
  errorResponse,
  requireAuthUser,
} from "@/lib/api/scope";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (user.role !== "SUPER_ADMIN") throw new ApiError("Forbidden", 403);

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId") || "";
    const activeOnly = searchParams.get("active") === "true";
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "30", 10), 1), 100);

    const where: any = {
      user: { schoolId: user.schoolId },
    };
    if (userId) where.userId = userId;
    if (activeOnly) where.isActive = true;

    const sessions = await prisma.loginSession.findMany({
      where,
      include: {
        user: { select: { id: true, fullName: true, email: true, role: true } },
      },
      orderBy: { loginAt: "desc" },
      take: limit,
    });

    return Response.json({ success: true, data: sessions });
  } catch (error) {
    return errorResponse(error, "[super/sessions] GET failed");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (user.role !== "SUPER_ADMIN") throw new ApiError("Forbidden", 403);

    const { sessionId } = await req.json();
    if (!sessionId) throw new ApiError("sessionId required", 400);

    await prisma.loginSession.update({
      where: { id: sessionId },
      data: { isActive: false, logoutAt: new Date() },
    });

    return Response.json({ success: true, message: "Session terminated" });
  } catch (error) {
    return errorResponse(error, "[super/sessions] DELETE failed");
  }
}
