import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, canManageFrontDesk, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const { searchParams } = new URL(request.url);
    const campusId = await resolveCampusId(user, searchParams.get("campusId"));
    const status = searchParams.get("status");

    const where: Record<string, unknown> = { campusId };
    if (status) where.status = status;

    const data = await prisma.complaint.findMany({
      where,
      orderBy: { date: "desc" },
    });

    return Response.json({ success: true, data });
  } catch (error) {
    return errorResponse(error, "[front-desk] complaints GET failed");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageFrontDesk(user)) throw new ApiError("Forbidden", 403);

    const body = await request.json();
    const { complainantName, type, phone, date, description, campusId: requestedCampusId } = body;
    const campusId = await resolveCampusId(user, requestedCampusId);

    if (!complainantName || !type || !date) {
      throw new ApiError("complainantName, type and date are required", 400);
    }

    const data = await prisma.complaint.create({
      data: {
        campusId,
        complainantName,
        type,
        phone,
        date: new Date(date),
        description,
      },
    });

    return Response.json({ success: true, data });
  } catch (error) {
    return errorResponse(error, "[front-desk] complaints POST failed");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageFrontDesk(user)) throw new ApiError("Forbidden", 403);

    const body = await request.json();
    const { id, actionTaken, status } = body;
    if (!id) throw new ApiError("id is required", 400);

    const campusId = await resolveCampusId(user, body.campusId);
    const existing = await prisma.complaint.findFirst({ where: { id, campusId } });
    if (!existing) throw new ApiError("Complaint not found", 404);

    const data = await prisma.complaint.update({
      where: { id },
      data: {
        ...(actionTaken !== undefined ? { actionTaken } : {}),
        ...(status !== undefined ? { status } : {}),
      },
    });

    return Response.json({ success: true, data });
  } catch (error) {
    return errorResponse(error, "[front-desk] complaints PATCH failed");
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
    const existing = await prisma.complaint.findFirst({ where: { id, campusId } });
    if (!existing) throw new ApiError("Complaint not found", 404);

    await prisma.complaint.delete({ where: { id } });

    return Response.json({ success: true, data: { id } });
  } catch (error) {
    return errorResponse(error, "[front-desk] complaints DELETE failed");
  }
}
