import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { logSuperAdminAction } from "@/lib/audit";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthUser({ allowSuspended: true });
    if (user.role !== "APP_OWNER") throw new ApiError("Forbidden", 403);

    const { id } = await params;

    const school = await prisma.school.findUnique({
      where: { id },
      include: {
        campuses: {
          select: {
            id: true,
            name: true,
            city: true,
            address: true,
            _count: { select: { students: true, users: true, classes: true } },
          },
        },
        users: {
          where: { role: "SUPER_ADMIN" },
          select: { id: true, fullName: true, email: true, phone: true, isActive: true, lastLogin: true },
        },
        _count: { select: { users: true, campuses: true } },
      },
    });

    if (!school) throw new ApiError("School not found", 404);

    return Response.json({ success: true, data: school });
  } catch (error) {
    return errorResponse(error, "[owner/schools/id] GET failed");
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthUser({ allowSuspended: true });
    if (user.role !== "APP_OWNER") throw new ApiError("Forbidden", 403);

    const { id } = await params;
    const body = await req.json();
    const { status } = body;

    if (!status || !["ACTIVE", "SUSPENDED"].includes(status)) {
      throw new ApiError("status must be ACTIVE or SUSPENDED", 400);
    }

    const school = await prisma.school.findUnique({
      where: { id },
      select: { id: true, name: true, status: true },
    });

    if (!school) throw new ApiError("School not found", 404);

    if (school.status === status) {
      return Response.json({ success: true, message: `School is already ${status}` });
    }

    await prisma.school.update({
      where: { id },
      data: { status },
    });

    await logSuperAdminAction({
      userId: user.userId,
      action: status === "SUSPENDED" ? "school_suspended" : "school_activated",
      targetType: "school",
      targetId: id,
      targetName: school.name,
      oldValues: { status: school.status },
      newValues: { status },
    }).catch(() => {});

    return Response.json({
      success: true,
      message: `School ${status === "SUSPENDED" ? "suspended" : "activated"} successfully`,
    });
  } catch (error) {
    return errorResponse(error, "[owner/schools/id] PATCH failed");
  }
}
