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
import { parseBody } from "@/lib/api/validate";
import { jsonObjectBody } from "@/lib/validators/route-bodies";
import { returnIssue } from "@/lib/library/desk";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertModuleRead(user, "library");
    const { searchParams } = new URL(req.url);
    const campusId = await resolveCampusId(user, searchParams.get("campusId"));
    const status = searchParams.get("status");

    const data = await prisma.bookIssue.findMany({
      where: {
        book: { campusId },
        ...(status === "issued" ? { returnedAt: null } : {}),
        ...(status === "returned" ? { returnedAt: { not: null } } : {}),
      },
      include: {
        book: { select: { title: true } },
        member: { include: { user: { select: { fullName: true } } } },
      },
      orderBy: { issuedAt: "desc" },
    });

    return Response.json({ success: true, data });
  } catch (error) {
    return errorResponse(error, "[library] GET issues failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageLibrary(user)) throw new ApiError("Insufficient permissions", 403);

    const body = await parseBody(req, jsonObjectBody);
    const { bookId, memberId, dueAt } = body;
    if (!bookId) throw new ApiError("bookId is required", 400);
    if (!memberId) throw new ApiError("memberId is required", 400);
    if (!dueAt) throw new ApiError("dueAt is required", 400);

    const book = await prisma.book.findFirst({
      where: { id: bookId, campus: { schoolId: user.schoolId } },
    });
    if (!book) throw new ApiError("Book not found", 404);

    const member = await prisma.libraryMember.findFirst({
      where: { id: memberId, campus: { schoolId: user.schoolId } },
    });
    if (!member) throw new ApiError("Member not found", 404);

    const data = await prisma.$transaction(async (tx) => {
      const fresh = await tx.book.findUnique({ where: { id: bookId } });
      if (!fresh || fresh.copiesAvailable <= 0) {
        throw new ApiError("No copies available to issue", 409);
      }

      await tx.book.update({
        where: { id: bookId },
        data: { copiesAvailable: { decrement: 1 } },
      });

      return tx.bookIssue.create({
        data: {
          bookId,
          memberId,
          dueAt: new Date(dueAt),
        },
      });
    });

    return Response.json({ success: true, data });
  } catch (error) {
    return errorResponse(error, "[library] POST issues failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageLibrary(user)) throw new ApiError("Insufficient permissions", 403);

    const body = await parseBody(req, jsonObjectBody);
    const { id } = body;
    if (!id) throw new ApiError("id is required", 400);

    const data = await returnIssue(user, String(id));

    return Response.json({ success: true, data });
  } catch (error) {
    return errorResponse(error, "[library] PATCH issues failed");
  }
}
