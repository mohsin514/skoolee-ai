import { getLocalePackage } from "@/lib/locale/store";
import { CURRENCIES } from "@/lib/locale/package";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  ApiError,
  assertModuleRead,
  assertPermission,
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
    await assertPermission(user, "accounts", "add");

    const body = await req.json();
    const campusId = await resolveCampusId(user, body.campusId);
    const name = String(body.name ?? "").trim();
    if (!name) throw new ApiError("name is required", 400);

    const currency = body.currency || (await getLocalePackage(user.schoolId, campusId)).currency;
    if (!CURRENCIES.includes(currency)) throw new ApiError("Invalid currency", 400);
    const openingBalance = Number(body.openingBalance ?? 0);
    if (!Number.isSafeInteger(openingBalance)) throw new ApiError("Opening balance must be an integer in minor units", 400);

    const existing = await prisma.bankAccount.findFirst({ where: { campusId, name } });
    if (existing) throw new ApiError("A bank account with this name already exists", 409);

    const bank = await prisma.bankAccount.create({
      data: {
        schoolId: user.schoolId,
        currency,
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
    await assertPermission(user, "accounts", "edit");

    const body = await req.json();
    if (!body.id) throw new ApiError("id is required", 400);

    const bank = await prisma.bankAccount.findFirst({
      where: { id: body.id, campus: { schoolId: user.schoolId } },
    });
    if (!bank) throw new ApiError("Bank account not found", 404);
    await resolveCampusId(user, bank.campusId);

    if (body.currency !== undefined && body.currency !== bank.currency) throw new ApiError("Existing monetary currency cannot be changed", 400);

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
              const v = Number(body.openingBalance);
              if (!Number.isSafeInteger(v)) throw new ApiError("Opening balance must be an integer in minor units", 400);
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
    await assertPermission(user, "accounts", "delete");

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