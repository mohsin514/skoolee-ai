import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { writeAuditEvent } from "@/lib/audit-events";
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
// PATCH /api/accounts/chart {id, name?, type?, isActive?}  → type is fixed once entries exist
// DELETE /api/accounts/chart?id=           → blocked when entries exist; deactivate instead

const TYPES = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"];
// Campus staff may only change accounts in their own campus; school owners may change any campus.
const campusFence = (user: { role: string; schoolId: string; campusId?: string | null }) => ({ schoolId: user.schoolId, ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId || "" }) });

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

    const account = await prisma.$transaction(async (tx) => {
      const created = await tx.chartOfAccount.create({
        data: { campusId, name, type, isSystem: false },
      });
      await writeAuditEvent(tx, user, {
        table: "chart_of_accounts", recordId: created.id, action: "CREATE", campusId: created.campusId,
        after: { type: created.type, isSystem: created.isSystem },
      });
      return created;
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
      where: { id: body.id, ...campusFence(user) },
      include: { _count: { select: { entries: true } } },
    });
    if (!account) throw new ApiError("Account not found", 404);

    const type = body.type ? String(body.type).toUpperCase() : account.type;
    if (!TYPES.includes(type)) throw new ApiError("Invalid account type", 400);
    // Changing the type of a used account would silently move posted money between income and expense.
    if (account.isSystem && (body.isActive === false || type !== account.type)) throw new ApiError("Fee and payroll postings use this system account, so it stays active with its type.", 409);
    if (type !== account.type && account._count.entries > 0) throw new ApiError("This account already has ledger entries, so its type cannot change. Create a new account instead.", 409);

    if (body.name && String(body.name).trim() !== account.name) {
      const dup = await prisma.chartOfAccount.findFirst({
        where: { campusId: account.campusId, name: String(body.name).trim() },
      });
      if (dup) throw new ApiError("An account with this name already exists", 409);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.chartOfAccount.update({
        where: { id: account.id },
        data: {
          name: body.name ? String(body.name).trim() : undefined,
          type: body.type ? type : undefined,
          isActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
        },
      });
      await writeAuditEvent(tx, user, {
        table: "chart_of_accounts", recordId: next.id, action: "UPDATE", campusId: next.campusId,
        before: { type: account.type, isActive: account.isActive },
        after: { type: next.type, isActive: next.isActive },
      });
      return next;
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
      where: { id, ...campusFence(user) },
      include: { _count: { select: { entries: true } } },
    });
    if (!account) throw new ApiError("Account not found", 404);
    if (account._count.entries > 0) {
      throw new ApiError("This account has ledger entries and stays for audit. Deactivate it to stop new entries.", 409);
    }

    await prisma.$transaction(async (tx) => {
      await tx.chartOfAccount.delete({ where: { id: account.id } });
      await writeAuditEvent(tx, user, {
        table: "chart_of_accounts", recordId: account.id, action: "DELETE", campusId: account.campusId,
        before: { type: account.type, isSystem: account.isSystem },
      });
    });
    return Response.json({ success: true, message: "Account deleted" });
  } catch (error) {
    return errorResponse(error, "accounts/chart DELETE failed");
  }
}