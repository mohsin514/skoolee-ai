import { operationDeleteResponse } from "@/lib/destructive/operations";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  ApiError,
  assertModuleRead,
  assertPermission,
  canManageCampusOps,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
} from "@/lib/api/scope";
import { parseWith } from "@/lib/api/validate";
import { vehicleSchema } from "@/lib/validators/operations";
import { assertVehicleChange } from "@/lib/transport/service";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertModuleRead(user, "transport");
    const campusId = await resolveCampusId(user, req.nextUrl.searchParams.get("campusId"));

    const vehicles = await prisma.vehicle.findMany({
      where: { campusId },
      include: {
        _count: { select: { routes: true } },
      },
      orderBy: { number: "asc" },
    });

    return Response.json({ success: true, data: vehicles });
  } catch (error) {
    return errorResponse(error, "[transport-vehicles] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageCampusOps(user)) throw new ApiError("Forbidden", 403);
    await assertPermission(user, "transport", "add");

    const body = await req.json();
    // SKO-437: the same field rules as the form — capacity 1–200, a valid phone — so a raw request
    // cannot store a zero or negative capacity.
    const { number, model, driverName, driverPhone, capacity } = parseWith(vehicleSchema, body);
    const campusId = await resolveCampusId(user, body.campusId);

    const vehicle = await prisma.vehicle.create({
      data: {
        campusId,
        number,
        model: model || null,
        driverName: driverName || null,
        driverPhone: driverPhone || null,
        capacity: typeof capacity === "number" ? capacity : null,
      },
      include: {
        _count: { select: { routes: true } },
      },
    });

    return Response.json({ success: true, data: vehicle });
  } catch (error) {
    return errorResponse(error, "[transport-vehicles] POST failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageCampusOps(user)) throw new ApiError("Forbidden", 403);
    await assertPermission(user, "transport", "edit");

    const body = await req.json();
    const id = body.id;
    if (!id) throw new ApiError("id is required", 400);
    const { number, model, driverName, driverPhone, capacity } = parseWith(vehicleSchema.partial(), body);
    const active = typeof body.active === "boolean" ? body.active : undefined;

    const campusId = await resolveCampusId(user, body.campusId);

    const existing = await prisma.vehicle.findFirst({ where: { id, campusId } });
    if (!existing) throw new ApiError("Vehicle not found", 404);
    // SKO-437: a route never keeps more riders than its largest active vehicle seats.
    if (capacity !== undefined || active !== undefined) await assertVehicleChange(user, id, { capacity, active });

    const vehicle = await prisma.vehicle.update({
      where: { id },
      data: {
        ...(number !== undefined ? { number } : {}),
        ...(model !== undefined ? { model } : {}),
        ...(driverName !== undefined ? { driverName } : {}),
        ...(driverPhone !== undefined ? { driverPhone } : {}),
        ...(capacity !== undefined ? { capacity } : {}),
        ...(active !== undefined ? { active } : {}),
      },
      include: {
        _count: { select: { routes: true } },
      },
    });

    return Response.json({ success: true, data: vehicle });
  } catch (error) {
    return errorResponse(error, "[transport-vehicles] PATCH failed");
  }
}

export async function DELETE(request: NextRequest) {
  return operationDeleteResponse(request, "transport/vehicles");
}
