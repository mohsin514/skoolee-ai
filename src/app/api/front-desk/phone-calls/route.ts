import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  ApiError,
  assertModuleRead,
  canManageFrontDesk,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
} from "@/lib/api/scope";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertModuleRead(user, "front-desk");
    const { searchParams } = new URL(request.url);
    const campusId = await resolveCampusId(user, searchParams.get("campusId"));
    const direction = searchParams.get("direction");

    const where: Record<string, unknown> = { campusId };
    if (direction) where.direction = direction;

    const data = await prisma.phoneCallLog.findMany({
      where,
      orderBy: { date: "desc" },
    });

    return Response.json({ success: true, data });
  } catch (error) {
    return errorResponse(error, "[front-desk] phone-calls GET failed");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageFrontDesk(user)) throw new ApiError("Forbidden", 403);

    const body = await request.json();
    const { name, phone, direction, date, followUpDate, note, campusId: requestedCampusId } = body;
    const campusId = await resolveCampusId(user, requestedCampusId);

    if (!name || !phone || !direction || !date) {
      throw new ApiError("name, phone, direction and date are required", 400);
    }

    const data = await prisma.phoneCallLog.create({
      data: {
        campusId,
        name,
        phone,
        direction,
        date: new Date(date),
        followUpDate: followUpDate ? new Date(followUpDate) : null,
        note,
      },
    });

    return Response.json({ success: true, data });
  } catch (error) {
    return errorResponse(error, "[front-desk] phone-calls POST failed");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageFrontDesk(user)) throw new ApiError("Forbidden", 403);

    const body = await request.json();
    const { id, followUpDate, note } = body;
    if (!id) throw new ApiError("id is required", 400);

    const campusId = await resolveCampusId(user, body.campusId);
    const existing = await prisma.phoneCallLog.findFirst({ where: { id, campusId } });
    if (!existing) throw new ApiError("Phone call log not found", 404);

    const data = await prisma.phoneCallLog.update({
      where: { id },
      data: {
        ...(followUpDate !== undefined ? { followUpDate: followUpDate ? new Date(followUpDate) : null } : {}),
        ...(note !== undefined ? { note } : {}),
      },
    });

    return Response.json({ success: true, data });
  } catch (error) {
    return errorResponse(error, "[front-desk] phone-calls PATCH failed");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageFrontDesk(user)) throw new ApiError("Forbidden", 403);

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) throw new ApiError("id is required", 400);

    const campusId = await resolveCampusId(user, searchParams.get("campusId"));
    const existing = await prisma.phoneCallLog.findFirst({ where: { id, campusId } });
    if (!existing) throw new ApiError("Phone call log not found", 404);

    await prisma.phoneCallLog.delete({ where: { id } });

    return Response.json({ success: true, data: { id } });
  } catch (error) {
    return errorResponse(error, "[front-desk] phone-calls DELETE failed");
  }
}
