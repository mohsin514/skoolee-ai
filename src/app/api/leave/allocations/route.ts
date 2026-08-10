import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, assertPermission, canManageOperations, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";
import { daysToTenths, tenthsToDays } from "@/lib/leave";

// Leave allocations — role-wide rows (role set, userId null) or per-user
// overrides (userId set, role null).
// GET           — list (admin; includes leave type + user names)
// POST          — create (admin)
// PATCH         — update days / scope (admin)
// DELETE ?id=   — remove (admin)

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    const { searchParams } = new URL(req.url);
    const campusId = await resolveCampusId(user, searchParams.get("campusId"));
    const yearParam = searchParams.get("academicYear");
    const academicYear = yearParam ? Number(yearParam) : new Date().getFullYear();

    const allocations = await prisma.leaveAllocation.findMany({
      where: { campusId, academicYear },
      include: {
        leaveType: { select: { name: true } },
        user: { select: { id: true, fullName: true, role: true } },
      },
      orderBy: [{ role: "asc" }, { userId: "asc" }, { leaveType: { name: "asc" } }],
    });

    return Response.json({
      success: true,
      data: allocations.map((a) => ({ ...a, daysDisplay: tenthsToDays(a.days) })),
    });
  } catch (error) {
    return errorResponse(error, "[leave/allocations] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "leave", "add");
    const body = await req.json();

    const campusId = await resolveCampusId(user, body.campusId);
    const leaveTypeId = String(body.leaveTypeId ?? "");
    const academicYear = Number(body.academicYear) || new Date().getFullYear();
    const role = body.role ? String(body.role).toUpperCase() : null;
    const userId = body.userId ? String(body.userId) : null;
    if (!leaveTypeId) throw new ApiError("leaveTypeId is required", 400);
    if (!role && !userId) throw new ApiError("Provide either a role or a user", 400);
    if (role && userId) throw new ApiError("Provide either a role or a user, not both", 400);

    const leaveType = await prisma.leaveType.findFirst({
      where: { id: leaveTypeId, campusId },
    });
    if (!leaveType) throw new ApiError("Leave type not found", 404);

    if (userId) {
      const target = await prisma.user.findFirst({
        where: { id: userId, campusId, schoolId: user.schoolId },
      });
      if (!target) throw new ApiError("User not found on this campus", 404);
    }

    const days = daysToTenths(Number(body.days ?? 0));
    const duplicate = await prisma.leaveAllocation.findFirst({
      where: {
        campusId,
        leaveTypeId,
        academicYear,
        role: role ?? null,
        userId: userId ?? null,
      },
    });
    if (duplicate) throw new ApiError("An allocation for this leave type / scope / year already exists", 409);

    const allocation = await prisma.leaveAllocation.create({
      data: { campusId, leaveTypeId, role, userId, days, academicYear },
    });
    return Response.json({ success: true, data: allocation }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "[leave/allocations] POST failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "leave", "edit");
    const body = await req.json();
    if (!body.id) throw new ApiError("id is required", 400);

    const allocation = await prisma.leaveAllocation.findFirst({
      where: { id: body.id, campus: { schoolId: user.schoolId } },
    });
    if (!allocation) throw new ApiError("Allocation not found", 404);

    const data: Record<string, unknown> = {};
    if (body.days !== undefined) data.days = daysToTenths(Number(body.days));
    if (body.academicYear !== undefined) data.academicYear = Number(body.academicYear);
    if (body.role !== undefined) data.role = body.role ? String(body.role).toUpperCase() : null;
    if (body.userId !== undefined) data.userId = body.userId ? String(body.userId) : null;

    const updated = await prisma.leaveAllocation.update({ where: { id: allocation.id }, data });
    return Response.json({ success: true, data: updated });
  } catch (error) {
    return errorResponse(error, "[leave/allocations] PATCH failed");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "leave", "delete");
    const id = req.nextUrl.searchParams.get("id");
    if (!id) throw new ApiError("id required", 400);

    const allocation = await prisma.leaveAllocation.findFirst({
      where: { id, campus: { schoolId: user.schoolId } },
    });
    if (!allocation) throw new ApiError("Allocation not found", 404);

    await prisma.leaveAllocation.delete({ where: { id } });
    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error, "[leave/allocations] DELETE failed");
  }
}
