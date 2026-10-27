import { listPagination, pageWindow } from "@/lib/lists/query";
import { assertListBudget } from "@/lib/lists/access";
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
import { createBook, updateBook } from "@/lib/library/catalogue-command";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertModuleRead(user, "library");
    await assertListBudget(user, "library/books");
    const params = req.nextUrl.searchParams;
    const campusId = await resolveCampusId(user, params.get("campusId"));
    const search = (params.get("search") ?? "").trim().slice(0, 100);
    const categoryId = params.get("categoryId");
    const { page: requestedPage, limit } = listPagination(params, 24, 100);
    const where = { schoolId: user.schoolId, campusId, ...(categoryId ? { categoryId } : {}), ...(search ? { OR: [{ title: { contains: search, mode: "insensitive" as const } }, { author: { contains: search, mode: "insensitive" as const } }, { isbn: { contains: search, mode: "insensitive" as const } }] } : {}) };
    const total = await prisma.book.count({ where });
    const { page, skip, pages } = pageWindow(total, requestedPage, limit);
    const data = await prisma.book.findMany({
      where, include: { category: true, _count: { select: { issues: true } } },
      orderBy: [{ title: params.get("sort") === "name-desc" ? "desc" : "asc" }, { id: "asc" }],
      skip, take: limit,
    });
    return Response.json({ success: true, data, pagination: { page, limit, total, pages } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error, "[library/books] GET failed"); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageLibrary(user)) throw new ApiError("Insufficient permissions", 403);

    const body = await req.json();
    const data = await createBook(user, body);

    return Response.json({ success: true, data });
  } catch (error) {
    return errorResponse(error, "[library] POST books failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageLibrary(user)) throw new ApiError("Insufficient permissions", 403);

    const body = await req.json();
    const data = await updateBook(user, body);

    return Response.json({ success: true, data });
  } catch (error) {
    return errorResponse(error, "[library] PATCH books failed");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageLibrary(user)) throw new ApiError("Insufficient permissions", 403);

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) throw new ApiError("id is required", 400);

    const existing = await prisma.book.findFirst({
      where: { id, campus: { schoolId: user.schoolId } },
    });
    if (!existing) throw new ApiError("Book not found", 404);

    const unreturned = await prisma.bookIssue.count({
      where: { bookId: id, returnedAt: null },
    });
    if (unreturned > 0) throw new ApiError("Cannot delete book with unreturned issues", 409);

    await prisma.book.delete({ where: { id } });

    return Response.json({ success: true, data: { id } });
  } catch (error) {
    return errorResponse(error, "[library] DELETE books failed");
  }
}
