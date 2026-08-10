import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, canManageOperations, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
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
    if (!canManageOperations(user)) throw new ApiError("Forbidden", 403);

    const body = await req.json();
    const { number, model, driverName, driverPhone, capacity, campusId: rawCampusId } = body;
    const campusId = await resolveCampusId(user, rawCampusId);

    if (!number) throw new ApiError("number is required", 400);

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
    if (!canManageOperations(user)) throw new ApiError("Forbidden", 403);

    const body = await req.json();
    const { id, number, model, driverName, driverPhone, capacity, campusId: rawCampusId } = body;
    if (!id) throw new ApiError("id is required", 400);

    const campusId = await resolveCampusId(user, rawCampusId);

    const existing = await prisma.vehicle.findFirst({ where: { id, campusId } });
    if (!existing) throw new ApiError("Vehicle not found", 404);

    const vehicle = await prisma.vehicle.update({
      where: { id },
      data: {
        ...(number !== undefined ? { number } : {}),
        ...(model !== undefined ? { model } : {}),
        ...(driverName !== undefined ? { driverName } : {}),
        ...(driverPhone !== undefined ? { driverPhone } : {}),
        ...(capacity !== undefined ? { capacity } : {}),
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

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Forbidden", 403);

    const id = req.nextUrl.searchParams.get("id");
    if (!id) throw new ApiError("id is required", 400);

    const campusId = await resolveCampusId(user, req.nextUrl.searchParams.get("campusId"));

    const existing = await prisma.vehicle.findFirst({
      where: { id, campusId },
      include: { _count: { select: { routes: true } } },
    });
    if (!existing) throw new ApiError("Vehicle not found", 404);

    if (existing._count.routes > 0) {
      return Response.json(
        {
          error: `Cannot delete vehicle: it is assigned to ${existing._count.routes} route(s)`,
          count: existing._count.routes,
        },
        { status: 409 }
      );
    }

    await prisma.vehicle.delete({ where: { id } });

    return Response.json({ success: true, data: { id } });
  } catch (error) {
    return errorResponse(error, "[transport-vehicles] DELETE failed");
  }
}
