import { operationDeleteResponse } from "@/lib/destructive/operations";
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
import { createMember } from "@/lib/library/catalogue-command";
import { parseBody } from "@/lib/api/validate";
import { jsonObjectBody } from "@/lib/validators/route-bodies";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertModuleRead(user, "library");
    await assertListBudget(user, "library/members");
    const { searchParams } = new URL(req.url);
    const campusId = await resolveCampusId(user, searchParams.get("campusId"));
    // SKAI-1858: one page of members with an optional name or card search, not every reader on the campus.
    const search = (searchParams.get("search") ?? "").trim().slice(0, 100);
    const { page: requestedPage, limit } = listPagination(searchParams, 24, 100);
    const where = {
      schoolId: user.schoolId,
      campusId,
      ...(search ? { OR: [{ memberNo: { contains: search, mode: "insensitive" as const } }, { user: { fullName: { contains: search, mode: "insensitive" as const } } }] } : {}),
    };
    const total = await prisma.libraryMember.count({ where });
    const { page, skip, pages } = pageWindow(total, requestedPage, limit);

    const data = await prisma.libraryMember.findMany({
      where,
      include: {
        user: { select: { fullName: true, role: true } },
        // SKAI-1625: Active Issues means open loans, the same rule as the lending desk.
        _count: { select: { issues: { where: { returnedAt: null } } } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip, take: limit,
    });

    return Response.json({ success: true, data, pagination: { page, limit, total, pages } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "[library] GET members failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageLibrary(user)) throw new ApiError("Insufficient permissions", 403);

    const body = await parseBody(req, jsonObjectBody);
    const data = await createMember(user, body);

    return Response.json({ success: true, data });
  } catch (error) {
    return errorResponse(error, "[library] POST members failed");
  }
}

export async function DELETE(request: NextRequest) {
  return operationDeleteResponse(request, "library/members");
}
