import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, canManageLibrary, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const { searchParams } = new URL(req.url);
    const campusId = await resolveCampusId(user, searchParams.get("campusId"));

    const data = await prisma.bookCategory.findMany({
      where: { campusId },
      include: { _count: { select: { books: true } } },
      orderBy: { name: "asc" },
    });

    return Response.json({ success: true, data });
  } catch (error) {
    return errorResponse(error, "[library] GET categories failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageLibrary(user)) throw new ApiError("Insufficient permissions", 403);

    const body = await req.json();
    const campusId = await resolveCampusId(user, body.campusId);
    const name = String(body.name || "").trim();
    if (!name) throw new ApiError("name is required", 400);

    const existing = await prisma.bookCategory.findFirst({ where: { campusId, name } });
    if (existing) throw new ApiError("Category with this name already exists", 409);

    const data = await prisma.bookCategory.create({
      data: { campusId, name },
    });

    return Response.json({ success: true, data });
  } catch (error) {
    return errorResponse(error, "[library] POST categories failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageLibrary(user)) throw new ApiError("Insufficient permissions", 403);

    const body = await req.json();
    const { id, name } = body;
    if (!id) throw new ApiError("id is required", 400);

    const existing = await prisma.bookCategory.findFirst({
      where: { id, campus: { schoolId: user.schoolId } },
    });
    if (!existing) throw new ApiError("Category not found", 404);

    if (name && name !== existing.name) {
      const dup = await prisma.bookCategory.findFirst({
        where: { campusId: existing.campusId, name, id: { not: id } },
      });
      if (dup) throw new ApiError("Category with this name already exists", 409);
    }

    const data = await prisma.bookCategory.update({
      where: { id },
      data: { ...(name ? { name } : {}) },
    });

    return Response.json({ success: true, data });
  } catch (error) {
    return errorResponse(error, "[library] PATCH categories failed");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageLibrary(user)) throw new ApiError("Insufficient permissions", 403);

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) throw new ApiError("id is required", 400);

    const existing = await prisma.bookCategory.findFirst({
      where: { id, campus: { schoolId: user.schoolId } },
    });
    if (!existing) throw new ApiError("Category not found", 404);

    const bookCount = await prisma.book.count({ where: { categoryId: id } });
    if (bookCount > 0) throw new ApiError("Cannot delete category that has books assigned", 409);

    await prisma.bookCategory.delete({ where: { id } });

    return Response.json({ success: true, data: { id } });
  } catch (error) {
    return errorResponse(error, "[library] DELETE categories failed");
  }
}
