import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, canManageFrontDesk, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const { searchParams } = new URL(request.url);
    const campusId = await resolveCampusId(user, searchParams.get("campusId"));
    const date = searchParams.get("date");

    const where: Record<string, unknown> = { campusId };
    if (date) {
      const start = new Date(`${date}T00:00:00.000Z`);
      const end = new Date(`${date}T23:59:59.999Z`);
      where.inTime = { gte: start, lte: end };
    }

    const data = await prisma.visitorLog.findMany({
      where,
      orderBy: { inTime: "desc" },
    });

    return Response.json({ success: true, data });
  } catch (error) {
    return errorResponse(error, "[front-desk] visitors GET failed");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageFrontDesk(user)) throw new ApiError("Forbidden", 403);

    const body = await request.json();
    const { name, phone, purpose, toMeet, inTime, note, campusId: requestedCampusId } = body;
    const campusId = await resolveCampusId(user, requestedCampusId);

    if (!name || !inTime) throw new ApiError("name and inTime are required", 400);

    const data = await prisma.visitorLog.create({
      data: {
        campusId,
        name,
        phone,
        purpose,
        toMeet,
        inTime: new Date(inTime),
        note,
      },
    });

    return Response.json({ success: true, data });
  } catch (error) {
    return errorResponse(error, "[front-desk] visitors POST failed");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageFrontDesk(user)) throw new ApiError("Forbidden", 403);

    const body = await request.json();
    const { id, outTime, note } = body;
    if (!id) throw new ApiError("id is required", 400);

    const campusId = await resolveCampusId(user, body.campusId);
    const existing = await prisma.visitorLog.findFirst({ where: { id, campusId } });
    if (!existing) throw new ApiError("Visitor log not found", 404);

    const data = await prisma.visitorLog.update({
      where: { id },
      data: {
        ...(outTime !== undefined ? { outTime: outTime ? new Date(outTime) : null } : {}),
        ...(note !== undefined ? { note } : {}),
      },
    });

    return Response.json({ success: true, data });
  } catch (error) {
    return errorResponse(error, "[front-desk] visitors PATCH failed");
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
    const existing = await prisma.visitorLog.findFirst({ where: { id, campusId } });
    if (!existing) throw new ApiError("Visitor log not found", 404);

    await prisma.visitorLog.delete({ where: { id } });

    return Response.json({ success: true, data: { id } });
  } catch (error) {
    return errorResponse(error, "[front-desk] visitors DELETE failed");
  }
}
