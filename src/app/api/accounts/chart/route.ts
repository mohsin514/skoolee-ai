import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  ApiError,
  assertModuleRead,
  assertPermission,
  canManageOperations,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
  scopedCampusWhere,
} from "@/lib/api/scope";

// Chart of Accounts CRUD
// GET /api/accounts/chart?campusId=        → list (campus-scoped)
// POST /api/accounts/chart {campusId,name,type}
// PATCH /api/accounts/chart {id, name?, type?, isSystem?}
// DELETE /api/accounts/chart?id=           → blocked when entries exist

const TYPES = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"];

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertModuleRead(user, "accounts");
    const campusId = req.nextUrl.searchParams.get("campusId");
    const resolved = await resolveCampusId(user, campusId);

    const accounts = await prisma.chartOfAccount.findMany({
      where: scopedCampusWhere(user, resolved ?? undefined) as any,
      include: { _count: { select: { entries: true } } },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    });

    return Response.json({ success: true, data: accounts });
  } catch (error) {
    return errorResponse(error, "[accounts/chart] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "accounts", "edit");

    const body = await req.json();
    const campusId = await resolveCampusId(user, body.campusId);
    const name = String(body.name ?? "").trim();
    const type = String(body.type ?? "").toUpperCase();

    if (!name) throw new ApiError("name is required", 400);
    if (!TYPES.includes(type)) throw new ApiError(`type must be one of ${TYPES.join(", ")}`, 400);

    const existing = await prisma.chartOfAccount.findFirst({ where: { campusId, name } });
    if (existing) throw new ApiError("An account with this name already exists", 409);

    const account = await prisma.chartOfAccount.create({
      data: { campusId, name, type, isSystem: false },
    });

    return Response.json({ success: true, data: account }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "accounts/chart POST failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "accounts", "edit");

    const body = await req.json();
    if (!body.id) throw new ApiError("id is required", 400);

    const account = await prisma.chartOfAccount.findFirst({
      where: { id: body.id, campus: { schoolId: user.schoolId } },
    });
    if (!account) throw new ApiError("Account not found", 404);

    const type = body.type ? String(body.type).toUpperCase() : account.type;
    if (!TYPES.includes(type)) throw new ApiError("Invalid account type", 400);

    if (body.name && String(body.name).trim() !== account.name) {
      const dup = await prisma.chartOfAccount.findFirst({
        where: { campusId: account.campusId, name: String(body.name).trim() },
      });
      if (dup) throw new ApiError("An account with this name already exists", 409);
    }

    const updated = await prisma.chartOfAccount.update({
      where: { id: account.id },
      data: {
        name: body.name ? String(body.name).trim() : undefined,
        type: body.type ? type : undefined,
        isSystem: typeof body.isSystem === "boolean" ? body.isSystem : undefined,
      },
    });

    return Response.json({ success: true, data: updated });
  } catch (error) {
    return errorResponse(error, "accounts/chart PATCH failed");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "accounts", "delete");

    const id = req.nextUrl.searchParams.get("id");
    if (!id) throw new ApiError("id is required", 400);

    const account = await prisma.chartOfAccount.findFirst({
      where: { id, campus: { schoolId: user.schoolId } },
      include: { _count: { select: { entries: true } } },
    });
    if (!account) throw new ApiError("Account not found", 404);
    if (account._count.entries > 0) {
      throw new ApiError("Cannot delete: this account has ledger entries", 409);
    }
    if (account.isSystem && account._count.entries === 0) {
      // system accounts can be removed only when they have no entries
    }

    await prisma.chartOfAccount.delete({ where: { id: account.id } });
    return Response.json({ success: true, message: "Account deleted" });
  } catch (error) {
    return errorResponse(error, "accounts/chart DELETE failed");
  }
}