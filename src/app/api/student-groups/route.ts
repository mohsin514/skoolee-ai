import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  ApiError,
  canManageOperations,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
  scopedCampusWhere,
} from "@/lib/api/scope";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const { searchParams } = new URL(req.url);
    const requestedCampusId = searchParams.get("campusId");
    const campusId = user.role === "SUPER_ADMIN" && !requestedCampusId
      ? null
      : await resolveCampusId(user, requestedCampusId);

    const groups = await prisma.studentGroup.findMany({
      where: scopedCampusWhere(user, campusId),
      include: { _count: { select: { students: true } } },
      orderBy: { name: "asc" },
    });

    return Response.json({ success: true, data: groups });
  } catch (error) {
    return errorResponse(error, "[student-groups] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);

    const body = await req.json();
    const name = String(body.name || "").trim();
    if (!name) throw new ApiError("Group name is required", 400);

    const campusId = await resolveCampusId(user, body.campusId || null);

    const group = await prisma.studentGroup.create({
      data: {
        campusId,
        name,
        description: body.description ? String(body.description).trim() : null,
      },
      include: { _count: { select: { students: true } } },
    });

    return Response.json({ success: true, data: group }, { status: 201 });
  } catch (error: any) {
    if (error?.code === "P2002") {
      return Response.json({ error: "A group with this name already exists in this campus" }, { status: 409 });
    }
    return errorResponse(error, "[student-groups] POST failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);

    const body = await req.json();
    if (!body.id) throw new ApiError("Group id is required", 400);

    const existing = await prisma.studentGroup.findFirst({
      where: { id: body.id, ...scopedCampusWhere(user, user.role === "SUPER_ADMIN" ? body.campusId : user.campusId) },
      select: { id: true },
    });
    if (!existing) throw new ApiError("Group not found", 404);

    const data: any = {};
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) throw new ApiError("Group name is required", 400);
      data.name = name;
    }
    if (body.description !== undefined) data.description = body.description ? String(body.description).trim() : null;

    const group = await prisma.studentGroup.update({
      where: { id: body.id },
      data,
      include: { _count: { select: { students: true } } },
    });

    return Response.json({ success: true, data: group });
  } catch (error: any) {
    if (error?.code === "P2002") {
      return Response.json({ error: "A group with this name already exists in this campus" }, { status: 409 });
    }
    return errorResponse(error, "[student-groups] PATCH failed");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) throw new ApiError("Group id is required", 400);

    const group = await prisma.studentGroup.findFirst({
      where: { id, ...scopedCampusWhere(user, user.role === "SUPER_ADMIN" ? null : user.campusId) },
      include: { _count: { select: { students: true } } },
    });
    if (!group) throw new ApiError("Group not found", 404);

    // Block deletion while any student references the tag.
    if (group._count.students > 0) {
      throw new ApiError(
        `This group is used by ${group._count.students} student${group._count.students === 1 ? "" : "s"}. Move them to another group before deleting it.`,
        409
      );
    }

    await prisma.studentGroup.delete({ where: { id } });

    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error, "[student-groups] DELETE failed");
  }
}
