import { z } from "zod";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";
import { prisma } from "@/lib/db/prisma";
import type { AuthUser } from "@/lib/auth";
import { ApiError, assertPermission, canManageLibrary, resolveCampusId } from "@/lib/api/scope";
import { parseWith } from "@/lib/api/validate";
import { bookPatchSchema, bookSchema } from "@/lib/validators/operations";

/**
 * Catalogue writes extracted from the library routes (categories POST, books POST/PATCH, members POST) so
 * the routes and the AI Workflows adapters call one command. Each keeps the route's own validation,
 * messages and status codes; the routes return exactly what these return.
 */
type Body = Record<string, unknown>;

// SKAI-2150: the role predicate is not enough; the school's permission matrix (library.add / library.edit) must also allow the write.
async function assertLibrary(user: AuthUser, action: "add" | "edit") {
  if (!canManageLibrary(user)) throw new ApiError("Insufficient permissions", 403);
  await assertPermission(user, "library", action);
}

/** POST /api/library/categories. */
export async function createCategory(user: AuthUser, body: Body) {
  await assertLibrary(user, "add");
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
  await assertLibrary(user, "add");
  const campusId = await resolveCampusId(user, body.campusId as string | null | undefined);
  // SKAI-2153: the route and the AI workflow adapter both reach the database through here, so the schema runs here.
  const { title, author, isbn, subject, categoryId, copiesTotal } = parseWith(bookSchema, {
    title: body.title, author: body.author, isbn: body.isbn, subject: body.subject, categoryId: body.categoryId, copiesTotal: body.copiesTotal,
  });

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
  await assertLibrary(user, "edit");
  const { id, title, author, isbn, subject, categoryId, copiesTotal: requestedTotal } = parseWith(bookPatchSchema, {
    id: body.id, title: body.title, author: body.author, isbn: body.isbn, subject: body.subject, categoryId: body.categoryId, copiesTotal: body.copiesTotal,
  });

  const existing = await prisma.book.findFirst({
    where: { id, campus: { schoolId: user.schoolId } },
  });
  if (!existing) throw new ApiError("Book not found", 404);

  let copiesAvailable = existing.copiesAvailable;
  let copiesTotal = existing.copiesTotal;
  if (requestedTotal !== undefined) {
    const newTotal = requestedTotal;
    // SKAI-1560: stock cannot drop below the copies that physically exist here: those out on loan,
    // and the barcoded copies still in stock. Otherwise a return later pushes available above total.
    const onLoan = Math.max(0, existing.copiesTotal - existing.copiesAvailable);
    const tracked = await prisma.bookCopy.count({ where: { bookId: existing.id, schoolId: user.schoolId, status: { in: ["AVAILABLE", "ON_LOAN", "RESERVED_HOLD"] } } });
    const floor = Math.max(onLoan, tracked);
    if (newTotal < floor) throw new ApiError(`This title has ${floor} ${floor === 1 ? "copy" : "copies"} on loan or on the shelf with a barcode. The total cannot be lower than that.`, 409);
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
  await assertLibrary(user, "add");
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


export const categoryRenameSchema = z.strictObject({
  id: z.string().min(1).max(128), name: z.string().trim().min(1).max(120),
  expectedName: z.string().min(1).max(120).optional(),
});

/** Rename within the current campus; a stale preview cannot overwrite a colleague's edit. */
export async function renameCategory(user: AuthUser, input: unknown) {
  await assertLibrary(user, "edit");
  const data = categoryRenameSchema.parse(input);
  return schoolAiTransaction(user, async tx => {
    const existing = await tx.bookCategory.findFirst({ where: {
      id: data.id, schoolId: user.schoolId,
      ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" }),
    } });
    if (!existing) throw new ApiError("Category not found", 404);
    if (existing.name === data.name) return existing;
    if (data.expectedName !== undefined && data.expectedName !== existing.name) throw new ApiError("Category changed. Review its current name before saving.", 409);
    const duplicate = await tx.bookCategory.findFirst({ where: {
      schoolId: user.schoolId, campusId: existing.campusId, name: { equals: data.name, mode: "insensitive" }, id: { not: data.id },
    } });
    if (duplicate) throw new ApiError("Category with this name already exists", 409);
    return tx.bookCategory.update({ where: { id: existing.id }, data: { name: data.name } });
  });
}
