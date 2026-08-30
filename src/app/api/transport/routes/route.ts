import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  ApiError,
  assertModuleRead,
  canManageOperations,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
} from "@/lib/api/scope";
import { parseWith, readJsonBody } from "@/lib/api/validate";
import { transportRoutePatchSchema, transportRouteSchema } from "@/lib/validators/operations";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertModuleRead(user, "transport");
    const campusId = await resolveCampusId(user, req.nextUrl.searchParams.get("campusId"));

    const routes = await prisma.transportRoute.findMany({
      where: { campusId },
      include: {
        _count: { select: { students: true } },
        vehicles: { include: { vehicle: true } },
      },
      orderBy: { title: "asc" },
    });

    return Response.json({ success: true, data: routes });
  } catch (error) {
    return errorResponse(error, "[transport-routes] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Forbidden", 403);

    const body = await readJsonBody(req);
    const { title, description, fare } = parseWith(transportRouteSchema, body);
    const campusId = await resolveCampusId(user, (body as { campusId?: unknown }).campusId);

    const route = await prisma.transportRoute.create({
      data: {
        campusId,
        title,
        description: description ?? null,
        fare,
      },
      include: {
        _count: { select: { students: true } },
        vehicles: { include: { vehicle: true } },
      },
    });

    return Response.json({ success: true, data: route });
  } catch (error) {
    return errorResponse(error, "[transport-routes] POST failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Forbidden", 403);

    const body = await readJsonBody(req);
    // A PATCH sends only what changed, so the create schema is relaxed to
    // partial — the field *rules* still apply to whatever is present.
    const { id, vehicleIds, ...patch } = parseWith(transportRoutePatchSchema, body);

    const campusId = await resolveCampusId(user, (body as { campusId?: unknown }).campusId);

    const existing = await prisma.transportRoute.findFirst({ where: { id, campusId } });
    if (!existing) throw new ApiError("Route not found", 404);

    if (Array.isArray(vehicleIds)) {
      await prisma.$transaction(async (tx) => {
        await tx.routeVehicle.deleteMany({ where: { routeId: id } });
        if (vehicleIds.length > 0) {
          await tx.routeVehicle.createMany({
            data: vehicleIds.map((vehicleId: string) => ({ routeId: id, vehicleId })),
          });
        }
      });
    }

    const route = await prisma.transportRoute.update({
      where: { id },
      data: {
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.description !== undefined ? { description: patch.description ?? null } : {}),
        ...(patch.fare !== undefined ? { fare: patch.fare } : {}),
      },
      include: {
        _count: { select: { students: true } },
        vehicles: { include: { vehicle: true } },
      },
    });

    return Response.json({ success: true, data: route });
  } catch (error) {
    return errorResponse(error, "[transport-routes] PATCH failed");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Forbidden", 403);

    const id = req.nextUrl.searchParams.get("id");
    if (!id) throw new ApiError("id is required", 400);

    const campusId = await resolveCampusId(user, req.nextUrl.searchParams.get("campusId"));

    const existing = await prisma.transportRoute.findFirst({
      where: { id, campusId },
      include: { _count: { select: { students: true } } },
    });
    if (!existing) throw new ApiError("Route not found", 404);

    if (existing._count.students > 0) {
      return Response.json(
        {
          error: `Cannot delete route: ${existing._count.students} student(s) are assigned to it`,
          count: existing._count.students,
        },
        { status: 409 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.routeVehicle.deleteMany({ where: { routeId: id } });
      await tx.transportRoute.delete({ where: { id } });
    });

    return Response.json({ success: true, data: { id } });
  } catch (error) {
    return errorResponse(error, "[transport-routes] DELETE failed");
  }
}
