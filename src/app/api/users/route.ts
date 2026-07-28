import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  ApiError,
  canManageOperations,
  errorResponse,
  requireAuthUser,
  scopedCampusWhere,
} from "@/lib/api/scope";

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);

    const body = await req.json();
    const { id, ...updates } = body;
    if (!id) throw new ApiError("User id is required", 400);

    const existing = await prisma.user.findFirst({
      where: { id, ...scopedCampusWhere(user, user.role === "SUPER_ADMIN" ? null : user.campusId) },
      select: { id: true, fullName: true, phone: true },
    });
    if (!existing) throw new ApiError("User not found", 404);

    const data: any = {};
    if (updates.fullName !== undefined) {
      const name = String(updates.fullName).trim();
      if (name.length < 2) throw new ApiError("Name must be at least 2 characters", 400);
      data.fullName = name;
    }
    if (updates.phone !== undefined) data.phone = updates.phone ? String(updates.phone).trim() : null;

    if (!Object.keys(data).length) throw new ApiError("No valid fields to update", 400);

    const updated = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        profileImageUrl: true,
      },
    });

    return Response.json({ success: true, data: updated });
  } catch (error) {
    return errorResponse(error, "[users] PATCH failed");
  }
}
