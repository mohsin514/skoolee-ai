import { assertListBudget } from "@/lib/lists/access";
import { boundedInteger } from "@/lib/owner/list-query";
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
    await assertListBudget(user, "super/sessions");
    // G12: the institution authority (group admin, or the school admin of a single school), school-scoped.
    if (!isInstitutionAuthority(user)) throw new ApiError("Only the institution administrator can open this.", 403);

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId") || "";
    const activeOnly = searchParams.get("active") === "true";
    const limit = boundedInteger(searchParams.get("limit"), 30, 100);

    const where: any = {
      user: { schoolId: user.schoolId },
    };
    if (userId) where.userId = userId;
    if (activeOnly) { where.isActive = true; where.expiresAt = { gt: new Date() }; }

    const sessions = await prisma.loginSession.findMany({
      where,
      include: {
        user: { select: { id: true, fullName: true, email: true, role: true } },
      },
      orderBy: [{ loginAt: "desc" }, { id: "desc" }],
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
    // G12: the institution authority (group admin, or the school admin of a single school), school-scoped.
    if (!isInstitutionAuthority(user)) throw new ApiError("Only the institution administrator can open this.", 403);

    const { sessionId } = await req.json();
    if (!sessionId) throw new ApiError("sessionId required", 400);

    // Only a session that belongs to someone in this school.
    const ended = await prisma.loginSession.updateMany({
      where: { id: String(sessionId), user: { schoolId: user.schoolId } },
      data: { isActive: false, logoutAt: new Date() },
    });
    if (ended.count !== 1) throw new ApiError("Session not found", 404);

    return Response.json({ success: true, message: "Session terminated" });
  } catch (error) {
    return errorResponse(error, "[super/sessions] DELETE failed");
  }
}
