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
import { createCategory, renameCategory } from "@/lib/library/catalogue-command";
import { parseBody } from "@/lib/api/validate";
import { jsonObjectBody } from "@/lib/validators/route-bodies";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertModuleRead(user, "library");
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

    const body = await parseBody(req, jsonObjectBody);
    const data = await createCategory(user, body);

    return Response.json({ success: true, data });
  } catch (error) {
    return errorResponse(error, "[library] POST categories failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageLibrary(user)) throw new ApiError("Insufficient permissions", 403);

    const body = await parseBody(req, jsonObjectBody);
    const data = await renameCategory(user, body);

    return Response.json({ success: true, data });
  } catch (error) {
    return errorResponse(error, "[library] PATCH categories failed");
  }
}

export async function DELETE(request: NextRequest) {
  return operationDeleteResponse(request, "library/categories");
}
