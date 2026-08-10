import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, canManageOperations, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
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

    const body = await req.json();
    const { title, fare, campusId: rawCampusId } = body;
    const campusId = await resolveCampusId(user, rawCampusId);

    if (!title) throw new ApiError("title is required", 400);

    const route = await prisma.transportRoute.create({
      data: {
        campusId,
        title,
        fare: typeof fare === "number" ? fare : 0,
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

    const body = await req.json();
    const { id, title, fare, campusId: rawCampusId, vehicleIds } = body;
    if (!id) throw new ApiError("id is required", 400);

    const campusId = await resolveCampusId(user, rawCampusId);

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
        ...(title !== undefined ? { title } : {}),
        ...(fare !== undefined ? { fare } : {}),
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
