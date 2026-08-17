import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  ApiError,
  assertModuleRead,
  canManageOperations,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
  scopedCampusWhere,
} from "@/lib/api/scope";

// Bank accounts CRUD
// GET /api/accounts/bank-accounts?campusId=
// POST /api/accounts/bank-accounts {campusId,name,bankName?,accountNumber?,openingBalance?}
// PATCH /api/accounts/bank-accounts {id,...}
// DELETE /api/accounts/bank-accounts?id=   → blocked when ledger entries reference it

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertModuleRead(user, "accounts");
    const campusId = req.nextUrl.searchParams.get("campusId");
    const resolved = await resolveCampusId(user, campusId);

    const banks = await prisma.bankAccount.findMany({
      where: scopedCampusWhere(user, resolved ?? undefined) as any,
      orderBy: { name: "asc" },
    });

    return Response.json({ success: true, data: banks });
  } catch (error) {
    return errorResponse(error, "[accounts/bank-accounts] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);

    const body = await req.json();
    const campusId = await resolveCampusId(user, body.campusId);
    const name = String(body.name ?? "").trim();
    if (!name) throw new ApiError("name is required", 400);

    const openingBalance = Math.round(Number(body.openingBalance ?? 0));
    if (!Number.isInteger(openingBalance)) throw new ApiError("openingBalance must be an integer (paisa)", 400);

    const existing = await prisma.bankAccount.findFirst({ where: { campusId, name } });
    if (existing) throw new ApiError("A bank account with this name already exists", 409);

    const bank = await prisma.bankAccount.create({
      data: {
        campusId,
        name,
        bankName: body.bankName ? String(body.bankName).trim() : null,
        accountNumber: body.accountNumber ? String(body.accountNumber).trim() : null,
        openingBalance,
        isActive: body.isActive !== false,
      },
    });

    return Response.json({ success: true, data: bank }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "accounts/bank-accounts POST failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);

    const body = await req.json();
    if (!body.id) throw new ApiError("id is required", 400);

    const bank = await prisma.bankAccount.findFirst({
      where: { id: body.id, campus: { schoolId: user.schoolId } },
    });
    if (!bank) throw new ApiError("Bank account not found", 404);

    if (body.name && String(body.name).trim() !== bank.name) {
      const dup = await prisma.bankAccount.findFirst({
        where: { campusId: bank.campusId, name: String(body.name).trim() },
      });
      if (dup) throw new ApiError("A bank account with this name already exists", 409);
    }

    const updated = await prisma.bankAccount.update({
      where: { id: bank.id },
      data: {
        name: body.name ? String(body.name).trim() : undefined,
        bankName: body.bankName !== undefined ? (String(body.bankName).trim() || null) : undefined,
        accountNumber: body.accountNumber !== undefined ? (String(body.accountNumber).trim() || null) : undefined,
        openingBalance: body.openingBalance !== undefined
          ? (() => {
              const v = Math.round(Number(body.openingBalance));
              if (!Number.isInteger(v)) throw new ApiError("openingBalance must be an integer (paisa)", 400);
              return v;
            })()
          : undefined,
        isActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
      },
    });

    return Response.json({ success: true, data: updated });
  } catch (error) {
    return errorResponse(error, "accounts/bank-accounts PATCH failed");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);

    const id = req.nextUrl.searchParams.get("id");
    if (!id) throw new ApiError("id is required", 400);

    const bank = await prisma.bankAccount.findFirst({
      where: { id, campus: { schoolId: user.schoolId } },
      include: { _count: { select: { entries: true } } },
    });
    if (!bank) throw new ApiError("Bank account not found", 404);
    if (bank._count.entries > 0) {
      throw new ApiError("Cannot delete: this bank account has ledger entries", 409);
    }

    await prisma.bankAccount.delete({ where: { id: bank.id } });
    return Response.json({ success: true, message: "Bank account deleted" });
  } catch (error) {
    return errorResponse(error, "accounts/bank-accounts DELETE failed");
  }
}