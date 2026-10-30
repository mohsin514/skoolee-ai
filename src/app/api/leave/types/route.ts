import { operationDeleteResponse } from "@/lib/destructive/operations";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  ApiError,
  assertModuleRead,
  assertPermission,
  canManageCampusOps,
  requireAuthUser,
  resolveCampusId,
} from "@/lib/api/scope";
import { created, failFrom, ok } from "@/lib/api/envelope";
import { daysToTenths, tenthsToDays } from "@/lib/leave";
import { createLeaveType } from "@/lib/leave/create-type-command";
import { parseBody } from "@/lib/api/validate";
import { idBody, jsonObjectBody } from "@/lib/validators/route-bodies";

// Leave types per campus.
// GET           — list (any signed-in staff)
// POST          — create (admin)
// PATCH         — rename / default days (admin)
// DELETE ?id=   — remove (admin)

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertModuleRead(user, "leave");
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

    return ok(types.map((t) => ({ ...t, defaultDaysDisplay: tenthsToDays(t.defaultDays) })));
  } catch (error) {
    return failFrom(error, "[leave/types] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageCampusOps(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "leave", "add");
    const body = await parseBody(req, jsonObjectBody);
    const type = await createLeaveType(user, body);
    return created(type);
  } catch (error) {
    return failFrom(error, "[leave/types] POST failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageCampusOps(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "leave", "edit");
    const body = await parseBody(req, idBody);

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
    return ok(updated);
  } catch (error) {
    return failFrom(error, "[leave/types] PATCH failed");
  }
}

export async function DELETE(req: NextRequest) {
  return operationDeleteResponse(req, "leave/types");
}
