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
    const search = searchParams.get("search")?.trim();

    const data = await prisma.book.findMany({
      where: {
        campusId,
        ...(search
          ? {
              OR: [
                { title: { contains: search, mode: "insensitive" } },
                { author: { contains: search, mode: "insensitive" } },
                { isbn: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: {
        category: true,
        _count: { select: { issues: true } },
      },
      orderBy: { title: "asc" },
    });

    return Response.json({ success: true, data });
  } catch (error) {
    return errorResponse(error, "[library] GET books failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageLibrary(user)) throw new ApiError("Insufficient permissions", 403);

    const body = await req.json();
    const campusId = await resolveCampusId(user, body.campusId);
    const { title, author, isbn, subject, categoryId } = body;
    const copiesTotal = Number(body.copiesTotal);

    if (!title) throw new ApiError("title is required", 400);
    if (!Number.isFinite(copiesTotal) || copiesTotal < 0) {
      throw new ApiError("copiesTotal must be a non-negative number", 400);
    }

    const data = await prisma.book.create({
      data: {
        campusId,
        title,
        author: author || null,
        isbn: isbn || null,
        subject: subject || null,
        categoryId: categoryId || null,
        copiesTotal,
        copiesAvailable: copiesTotal,
      },
    });

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
    const { id, title, author, isbn, subject, categoryId } = body;
    if (!id) throw new ApiError("id is required", 400);

    const existing = await prisma.book.findFirst({
      where: { id, campus: { schoolId: user.schoolId } },
    });
    if (!existing) throw new ApiError("Book not found", 404);

    let copiesAvailable = existing.copiesAvailable;
    let copiesTotal = existing.copiesTotal;
    if (body.copiesTotal !== undefined) {
      const newTotal = Number(body.copiesTotal);
      if (!Number.isFinite(newTotal) || newTotal < 0) {
        throw new ApiError("copiesTotal must be a non-negative number", 400);
      }
      const diff = newTotal - existing.copiesTotal;
      copiesAvailable = Math.max(0, existing.copiesAvailable + diff);
      copiesTotal = newTotal;
    }

    const data = await prisma.book.update({
      where: { id },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(author !== undefined ? { author: author || null } : {}),
        ...(isbn !== undefined ? { isbn: isbn || null } : {}),
        ...(subject !== undefined ? { subject: subject || null } : {}),
        ...(categoryId !== undefined ? { categoryId: categoryId || null } : {}),
        copiesTotal,
        copiesAvailable,
      },
    });

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
