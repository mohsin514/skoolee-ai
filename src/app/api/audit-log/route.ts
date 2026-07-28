import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  ApiError,
  canManageOperations,
  errorResponse,
  requireAuthUser,
} from "@/lib/api/scope";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);

    const { searchParams } = new URL(req.url);
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "30", 10), 1), 100);

    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    const userIds = [...new Set(logs.map((l) => l.userId))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, fullName: true, email: true },
    });
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

    const data = logs.map((log) => ({
      ...log,
      oldValue: log.oldValue ? (typeof log.oldValue === "string" ? JSON.parse(log.oldValue) : log.oldValue) : null,
      newValue: log.newValue ? (typeof log.newValue === "string" ? JSON.parse(log.newValue) : log.newValue) : null,
      user: userMap[log.userId] || null,
    }));

    return Response.json({ success: true, data });
  } catch (error) {
    return errorResponse(error, "[audit-log] GET failed");
  }
}
