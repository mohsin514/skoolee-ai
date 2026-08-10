import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, canManageFrontDesk, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const { searchParams } = new URL(request.url);
    const campusId = await resolveCampusId(user, searchParams.get("campusId"));
    const direction = searchParams.get("direction");

    const where: Record<string, unknown> = { campusId };
    if (direction) where.direction = direction;

    const data = await prisma.postalRecord.findMany({
      where,
      orderBy: { date: "desc" },
    });

    return Response.json({ success: true, data });
  } catch (error) {
    return errorResponse(error, "[front-desk] postal GET failed");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageFrontDesk(user)) throw new ApiError("Forbidden", 403);

    const body = await request.json();
    const { direction, fromName, toName, referenceNo, date, note, fileKey, campusId: requestedCampusId } = body;
    const campusId = await resolveCampusId(user, requestedCampusId);

    if (!direction || !date) throw new ApiError("direction and date are required", 400);

    const data = await prisma.postalRecord.create({
      data: {
        campusId,
        direction,
        fromName,
        toName,
        referenceNo,
        date: new Date(date),
        note,
        fileKey,
      },
    });

    return Response.json({ success: true, data });
  } catch (error) {
    return errorResponse(error, "[front-desk] postal POST failed");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageFrontDesk(user)) throw new ApiError("Forbidden", 403);

    const body = await request.json();
    const { id, note, fileKey } = body;
    if (!id) throw new ApiError("id is required", 400);

    const campusId = await resolveCampusId(user, body.campusId);
    const existing = await prisma.postalRecord.findFirst({ where: { id, campusId } });
    if (!existing) throw new ApiError("Postal record not found", 404);

    const data = await prisma.postalRecord.update({
      where: { id },
      data: {
        ...(note !== undefined ? { note } : {}),
        ...(fileKey !== undefined ? { fileKey } : {}),
      },
    });

    return Response.json({ success: true, data });
  } catch (error) {
    return errorResponse(error, "[front-desk] postal PATCH failed");
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
    const existing = await prisma.postalRecord.findFirst({ where: { id, campusId } });
    if (!existing) throw new ApiError("Postal record not found", 404);

    await prisma.postalRecord.delete({ where: { id } });

    return Response.json({ success: true, data: { id } });
  } catch (error) {
    return errorResponse(error, "[front-desk] postal DELETE failed");
  }
}
