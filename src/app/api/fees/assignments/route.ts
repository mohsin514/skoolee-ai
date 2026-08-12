import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, canManageOperations, errorResponse, requireAuthUser, resolveCampusId, scopedCampusWhere } from "@/lib/api/scope";

// FeeGroupAssignment: which fee group serves which class for an academic year.

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const { searchParams } = new URL(req.url);
    const campusId = user.role === "SUPER_ADMIN" ? searchParams.get("campusId") : user.campusId;

    const assignments = await prisma.feeGroupAssignment.findMany({
      where: { ...scopedCampusWhere(user, campusId) },
      include: {
        feeGroup: { select: { id: true, name: true } },
        class: { select: { id: true, name: true, section: true } },
      },
      orderBy: [{ academicYear: "desc" }, { class: { name: "asc" } }],
    });
    return Response.json({ success: true, data: assignments });
  } catch (error) {
    return errorResponse(error, "[fees/assignments] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);

    const body = await req.json();
    const campusId = await resolveCampusId(user, body.campusId);
    if (!body.feeGroupId || !body.classId) throw new ApiError("feeGroupId and classId required", 400);
    const academicYear = Number(body.academicYear ?? new Date().getFullYear());
    if (!Number.isInteger(academicYear) || academicYear < 2000) throw new ApiError("invalid academicYear", 400);

    const [group, cls] = await Promise.all([
      prisma.feeGroup.findFirst({ where: { id: body.feeGroupId, campusId } }),
      prisma.class.findFirst({ where: { id: body.classId, campusId } }),
    ]);
    if (!group) throw new ApiError("Fee group not found", 404);
    if (!cls) throw new ApiError("Class not found", 404);

    const existing = await prisma.feeGroupAssignment.findUnique({
      where: { feeGroupId_classId_academicYear: { feeGroupId: body.feeGroupId, classId: body.classId, academicYear } },
    });
    if (existing) throw new ApiError("This class already has this group for the year", 409);

    const assignment = await prisma.feeGroupAssignment.create({
      data: { campusId, feeGroupId: body.feeGroupId, classId: body.classId, academicYear },
      include: { feeGroup: { select: { id: true, name: true } }, class: { select: { id: true, name: true, section: true } } },
    });
    return Response.json({ success: true, data: assignment }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "[fees/assignments] POST failed");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);

    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new ApiError("id required", 400);

    const existing = await prisma.feeGroupAssignment.findFirst({ where: { id, ...scopedCampusWhere(user) } });
    if (!existing) throw new ApiError("Assignment not found", 404);

    await prisma.feeGroupAssignment.delete({ where: { id } });
    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error, "[fees/assignments] DELETE failed");
  }
}
