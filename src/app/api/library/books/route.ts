import { operationDeleteResponse } from "@/lib/destructive/operations";
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

export async function DELETE(request: NextRequest) {
  return operationDeleteResponse(request, "library/books");
}
