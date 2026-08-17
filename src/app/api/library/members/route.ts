import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  ApiError,
  assertModuleRead,
  canManageLibrary,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
} from "@/lib/api/scope";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertModuleRead(user, "library");
    const { searchParams } = new URL(req.url);
    const campusId = await resolveCampusId(user, searchParams.get("campusId"));

    const data = await prisma.libraryMember.findMany({
      where: { campusId },
      include: {
        user: { select: { fullName: true, role: true } },
        _count: { select: { issues: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return Response.json({ success: true, data });
  } catch (error) {
    return errorResponse(error, "[library] GET members failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageLibrary(user)) throw new ApiError("Insufficient permissions", 403);

    const body = await req.json();
    const campusId = await resolveCampusId(user, body.campusId);
    const { userId, memberNo } = body;

    if (!userId) throw new ApiError("userId is required", 400);
    if (!memberNo) throw new ApiError("memberNo is required", 400);

    const [dupUser, dupMemberNo] = await Promise.all([
      prisma.libraryMember.findFirst({ where: { campusId, userId } }),
      prisma.libraryMember.findFirst({ where: { campusId, memberNo } }),
    ]);
    if (dupUser) throw new ApiError("This user is already a library member", 409);
    if (dupMemberNo) throw new ApiError("Member number already in use", 409);

    const data = await prisma.libraryMember.create({
      data: { campusId, userId, memberNo },
    });

    return Response.json({ success: true, data });
  } catch (error) {
    return errorResponse(error, "[library] POST members failed");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageLibrary(user)) throw new ApiError("Insufficient permissions", 403);

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) throw new ApiError("id is required", 400);

    const existing = await prisma.libraryMember.findFirst({
      where: { id, campus: { schoolId: user.schoolId } },
    });
    if (!existing) throw new ApiError("Member not found", 404);

    const unreturned = await prisma.bookIssue.count({
      where: { memberId: id, returnedAt: null },
    });
    if (unreturned > 0) throw new ApiError("Cannot delete member with unreturned issues", 409);

    await prisma.libraryMember.delete({ where: { id } });

    return Response.json({ success: true, data: { id } });
  } catch (error) {
    return errorResponse(error, "[library] DELETE members failed");
  }
}
