import { operationDeleteResponse } from "@/lib/destructive/operations";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  ApiError,
  assertPermission,
  assertStaffRole,
  canManageCampusOps,
  requireAuthUser,
  resolveCampusId,
  scopedCampusWhere,
} from "@/lib/api/scope";
import { created, fail, failFrom, ok } from "@/lib/api/envelope";
import { parseBody } from "@/lib/api/validate";
import { jsonObjectBody } from "@/lib/validators/route-bodies";
import { writeAuditEvent } from "@/lib/audit-events";
import { assertCategoryCurrent, parseCategoryInput } from "@/lib/students/category-policy";

// GET    /api/student-categories?campusId=   → staff only (families never read the campus tag list)
// POST   { name, description?, isActive?, campusId? }
// PATCH  { id, name?, description?, isActive?, expected? } → 409 when `expected` is stale
// DELETE via the reviewed-delete flow (blocked while students or fee discounts use it)
// SKAI-168: names are unique per campus ignoring case; every write is audited.

// The tenant guard checks each reference inside the transaction, which is slow over a remote pool.
const TX_OPTIONS = { maxWait: 20_000, timeout: 60_000 };
const DUPLICATE = "A category with this name already exists in this campus";

async function assertNameFree(campusId: string, name: string, exceptId?: string) {
  const clash = await prisma.studentCategory.findFirst({
    where: { campusId, name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (clash) throw new ApiError(DUPLICATE, 409);
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    assertStaffRole(user);
    const { searchParams } = new URL(req.url);
    const requestedCampusId = searchParams.get("campusId");
    const campusId = user.role === "SUPER_ADMIN" && !requestedCampusId
      ? null
      : await resolveCampusId(user, requestedCampusId);

    const categories = await prisma.studentCategory.findMany({
      where: scopedCampusWhere(user, campusId),
      include: { _count: { select: { students: true, feeDiscounts: true } } },
      orderBy: { name: "asc" },
    });

    return ok(categories);
  } catch (error) {
    return failFrom(error, "[student-categories] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageCampusOps(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "students", "add");

    const body = await parseBody(req, jsonObjectBody);
    const input = parseCategoryInput(body, false) as { name: string; description: string | null; isActive: boolean };
    const campusId = await resolveCampusId(user, body.campusId || null);
    await assertNameFree(campusId, input.name);

    const category = await prisma.$transaction(async (tx) => {
      const row = await tx.studentCategory.create({
        data: { schoolId: user.schoolId, campusId, ...input },
        include: { _count: { select: { students: true, feeDiscounts: true } } },
      });
      await writeAuditEvent(tx, user, { table: "student_categories", recordId: row.id, action: "CREATE", campusId, after: input });
      return row;
    }, TX_OPTIONS);

    return created(category);
  } catch (error: any) {
    if (error?.code === "P2002") return fail("CONFLICT", DUPLICATE);
    return failFrom(error, "[student-categories] POST failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageCampusOps(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "students", "edit");

    const body = await parseBody(req, jsonObjectBody);
    if (!body.id) throw new ApiError("Category id is required", 400);
    const data = parseCategoryInput(body, true);

    const existing = await prisma.studentCategory.findFirst({
      where: { id: String(body.id), ...scopedCampusWhere(user, user.role === "SUPER_ADMIN" ? body.campusId : user.campusId) },
      select: { id: true, campusId: true, name: true, description: true, isActive: true },
    });
    if (!existing) throw new ApiError("Category not found", 404);
    assertCategoryCurrent(body.expected, existing);
    if (data.name !== undefined) await assertNameFree(existing.campusId, data.name, existing.id);

    const category = await prisma.$transaction(async (tx) => {
      const row = await tx.studentCategory.update({
        where: { id: existing.id },
        data,
        include: { _count: { select: { students: true, feeDiscounts: true } } },
      });
      const { id: _id, campusId: _campus, ...before } = existing;
      await writeAuditEvent(tx, user, { table: "student_categories", recordId: row.id, action: "UPDATE", campusId: existing.campusId, before, after: data });
      return row;
    }, TX_OPTIONS);

    return ok(category);
  } catch (error: any) {
    if (error?.code === "P2002") return fail("CONFLICT", DUPLICATE);
    return failFrom(error, "[student-categories] PATCH failed");
  }
}

export async function DELETE(req: NextRequest) {
  return operationDeleteResponse(req, "student-categories");
}
