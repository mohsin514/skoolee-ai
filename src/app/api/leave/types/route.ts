import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, assertPermission, canManageOperations, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";
import { daysToTenths, tenthsToDays } from "@/lib/leave";

// Leave types per campus.
// GET           — list (any signed-in staff)
// POST          — create (admin)
// PATCH         — rename / default days (admin)
// DELETE ?id=   — remove (admin)

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const { searchParams } = new URL(req.url);
    const campusId = await resolveCampusId(user, searchParams.get("campusId"));

    const types = await prisma.leaveType.findMany({
      where: { campusId },
      select: {
        id: true,
        name: true,
        defaultDays: true,
        _count: { select: { allocations: true, requests: true } },
      },
      orderBy: { name: "asc" },
    });

    return Response.json({
      success: true,
      data: types.map((t) => ({ ...t, defaultDaysDisplay: tenthsToDays(t.defaultDays) })),
    });
  } catch (error) {
    return errorResponse(error, "[leave/types] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "leave", "add");
    const body = await req.json();
    const name = String(body.name ?? "").trim();
    if (!name) throw new ApiError("name is required", 400);

    const campusId = await resolveCampusId(user, body.campusId);

    const existing = await prisma.leaveType.findUnique({
      where: { campusId_name: { campusId, name } },
    });
    if (existing) throw new ApiError(`Leave type "${name}" already exists`, 409);

    const type = await prisma.leaveType.create({
      data: { campusId, name, defaultDays: daysToTenths(Number(body.defaultDays ?? 0)) },
    });
    return Response.json({ success: true, data: type }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "[leave/types] POST failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "leave", "edit");
    const body = await req.json();
    if (!body.id) throw new ApiError("id is required", 400);

    const type = await prisma.leaveType.findFirst({
      where: { id: body.id, campus: { schoolId: user.schoolId } },
    });
    if (!type) throw new ApiError("Leave type not found", 404);

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) throw new ApiError("name cannot be empty", 400);
      const clash = await prisma.leaveType.findFirst({
        where: { campusId: type.campusId, name, NOT: { id: type.id } },
      });
      if (clash) throw new ApiError(`Leave type "${name}" already exists`, 409);
      data.name = name;
    }
    if (body.defaultDays !== undefined) data.defaultDays = daysToTenths(Number(body.defaultDays));

    const updated = await prisma.leaveType.update({ where: { id: type.id }, data });
    return Response.json({ success: true, data: updated });
  } catch (error) {
    return errorResponse(error, "[leave/types] PATCH failed");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "leave", "delete");
    const id = req.nextUrl.searchParams.get("id");
    if (!id) throw new ApiError("id required", 400);

    const type = await prisma.leaveType.findFirst({
      where: { id, campus: { schoolId: user.schoolId } },
      include: { _count: { select: { requests: true } } },
    });
    if (!type) throw new ApiError("Leave type not found", 404);
    if (type._count.requests > 0) {
      throw new ApiError(`Cannot delete "${type.name}" — ${type._count.requests} leave request(s) reference it`, 409);
    }

    await prisma.leaveType.delete({ where: { id } });
    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error, "[leave/types] DELETE failed");
  }
}
