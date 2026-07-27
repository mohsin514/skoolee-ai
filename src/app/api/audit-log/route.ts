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

    return Response.json({ success: true, data: logs });
  } catch (error) {
    return errorResponse(error, "[audit-log] GET failed");
  }
}
