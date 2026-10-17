import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { writeAuditEvent } from "@/lib/audit-events";
import { ApiError, assertPermission, canManageOperations, errorResponse, requireAuthUser, resolveCampusId, scopedCampusWhere,
  assertSharedModuleRead,
} from "@/lib/api/scope";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertSharedModuleRead(user, "fees");
    const { searchParams } = new URL(req.url);
    const campusId = user.role === "SUPER_ADMIN" ? searchParams.get("campusId") : user.campusId;

    const types = await prisma.feeType.findMany({
      where: { ...scopedCampusWhere(user, campusId) },
      include: { _count: { select: { masters: true } } },
      orderBy: { name: "asc" },
    });
    return Response.json({ success: true, data: types });
  } catch (error) {
    return errorResponse(error, "[fees/types] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "fees", "add");

    const body = await req.json();
    const campusId = await resolveCampusId(user, body.campusId);
    const name = String(body.name ?? "").trim();
    const code = String(body.code ?? "").trim().toUpperCase().replace(/\s+/g, "_");

    if (!name || !code) throw new ApiError("name and code are required", 400);

    const existing = await prisma.feeType.findUnique({ where: { campusId_code: { campusId, code } } });
    if (existing) throw new ApiError("A fee type with this code already exists", 409);

    const type = await prisma.$transaction(async (tx) => {
      const created = await tx.feeType.create({
        data: { campusId, name, code, description: body.description ?? null },
      });
      await writeAuditEvent(tx, user, { table: "fee_types", recordId: created.id, action: "CREATE", campusId });
      return created;
    });
    return Response.json({ success: true, data: type }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "[fees/types] POST failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
        await assertPermission(user, "fees", "edit");

    const body = await req.json();
    if (!body.id) throw new ApiError("id required", 400);

    const existing = await prisma.feeType.findFirst({
      where: { id: body.id, ...scopedCampusWhere(user) },
    });
    if (!existing) throw new ApiError("Fee type not found", 404);

    const code = body.code !== undefined
      ? String(body.code).trim().toUpperCase().replace(/\s+/g, "_")
      : existing.code;

    const dup = await prisma.feeType.findUnique({ where: { campusId_code: { campusId: existing.campusId, code } } });
    if (dup && dup.id !== body.id) throw new ApiError("A fee type with this code already exists", 409);

    const type = await prisma.$transaction(async (tx) => {
      const next = await tx.feeType.update({
        where: { id: body.id },
        data: {
          name: body.name !== undefined ? String(body.name).trim() : undefined,
          code,
          description: body.description !== undefined ? body.description : undefined,
        },
      });
      await writeAuditEvent(tx, user, { table: "fee_types", recordId: next.id, action: "UPDATE", campusId: existing.campusId, after: { renamed: next.name !== existing.name, recoded: next.code !== existing.code } });
      return next;
    });
    return Response.json({ success: true, data: type });
  } catch (error) {
    return errorResponse(error, "[fees/types] PATCH failed");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
        await assertPermission(user, "fees", "delete");

    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new ApiError("id required", 400);

    const existing = await prisma.feeType.findFirst({ where: { id, ...scopedCampusWhere(user) } });
    if (!existing) throw new ApiError("Fee type not found", 404);

    await prisma.$transaction(async (tx) => {
      // SKO-389: a fee type still priced in master lines is not deleted out from under them.
      const lines = await tx.feesMasterLine.count({ where: { feeTypeId: id } });
      if (lines) throw new ApiError(`This fee type is used by ${lines} master line(s). Remove it from those lines first; invoices already issued are not affected.`, 409);
      await tx.feeType.delete({ where: { id } });
      await writeAuditEvent(tx, user, { table: "fee_types", recordId: id, action: "DELETE", campusId: existing.campusId });
    });
    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error, "[fees/types] DELETE failed");
  }
}
