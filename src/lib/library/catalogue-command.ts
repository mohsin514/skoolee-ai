import { prisma } from "@/lib/db/prisma";
import type { AuthUser } from "@/lib/auth";
import { ApiError, canManageLibrary, resolveCampusId } from "@/lib/api/scope";

/**
 * Catalogue writes extracted from the library routes (categories POST, books POST/PATCH, members POST) so
 * the routes and the AI Workflows adapters call one command. Each keeps the route's own validation,
 * messages and status codes; the routes return exactly what these return.
 */
type Body = Record<string, unknown>;

function assertLibrary(user: AuthUser) {
  if (!canManageLibrary(user)) throw new ApiError("Insufficient permissions", 403);
}

/** POST /api/library/categories. */
export async function createCategory(user: AuthUser, body: Body) {
  assertLibrary(user);
  const campusId = await resolveCampusId(user, body.campusId as string | null | undefined);
  const name = String(body.name || "").trim();
  if (!name) throw new ApiError("name is required", 400);

  const existing = await prisma.bookCategory.findFirst({ where: { campusId, name } });
  if (existing) throw new ApiError("Category with this name already exists", 409);

  return prisma.bookCategory.create({
    data: { campusId, name },
  });
}

/** POST /api/library/books. */
export async function createBook(user: AuthUser, body: Body) {
  assertLibrary(user);
  const campusId = await resolveCampusId(user, body.campusId as string | null | undefined);
  const { title, author, isbn, subject, categoryId } = body as Record<string, string | undefined>;
  const copiesTotal = Number(body.copiesTotal);

  if (!title) throw new ApiError("title is required", 400);
  if (!Number.isFinite(copiesTotal) || copiesTotal < 0) {
    throw new ApiError("copiesTotal must be a non-negative number", 400);
  }

  return prisma.book.create({
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
}

/** PATCH /api/library/books. */
export async function updateBook(user: AuthUser, body: Body) {
  assertLibrary(user);
  const { id, title, author, isbn, subject, categoryId } = body as Record<string, string | undefined>;
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

  return prisma.book.update({
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
}

/** POST /api/library/members. */
export async function createMember(user: AuthUser, body: Body) {
  assertLibrary(user);
  const campusId = await resolveCampusId(user, body.campusId as string | null | undefined);
  const { userId, memberNo } = body as Record<string, string | undefined>;

  if (!userId) throw new ApiError("userId is required", 400);
  if (!memberNo) throw new ApiError("memberNo is required", 400);

  const [dupUser, dupMemberNo] = await Promise.all([
    prisma.libraryMember.findFirst({ where: { campusId, userId } }),
    prisma.libraryMember.findFirst({ where: { campusId, memberNo } }),
  ]);
  if (dupUser) throw new ApiError("This user is already a library member", 409);
  if (dupMemberNo) throw new ApiError("Member number already in use", 409);

  return prisma.libraryMember.create({
    data: { campusId, userId, memberNo },
  });
}
