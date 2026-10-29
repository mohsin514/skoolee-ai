import { operationDeleteResponse } from "@/lib/destructive/operations";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { writeAuditEvent } from "@/lib/audit-events";
import { createBankAccount } from "@/lib/accounts/bank-account-command";
import {
  ApiError,
  assertModuleRead,
  assertPermission,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
  scopedCampusWhere,
} from "@/lib/api/scope";
import { parseBody } from "@/lib/api/validate";
import { idBody, jsonObjectBody } from "@/lib/validators/route-bodies";

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

    const body = await parseBody(req, jsonObjectBody);
    const bank = await createBankAccount(user, body);

    return Response.json({ success: true, data: bank }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "accounts/bank-accounts POST failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertPermission(user, "accounts", "edit");

    const body = await parseBody(req, idBody);

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

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.bankAccount.update({
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
      await writeAuditEvent(tx, user, {
        table: "bank_accounts", recordId: next.id, action: "UPDATE", campusId: next.campusId,
        before: { openingBalance: bank.openingBalance, isActive: bank.isActive },
        after: { openingBalance: next.openingBalance, isActive: next.isActive },
      });
      return next;
    });

    return Response.json({ success: true, data: updated });
  } catch (error) {
    return errorResponse(error, "accounts/bank-accounts PATCH failed");
  }
}

export async function DELETE(req: NextRequest) {
  return operationDeleteResponse(req, "accounts/bank-accounts");
}
