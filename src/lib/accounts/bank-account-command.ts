import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { writeAuditEvent } from "@/lib/audit-events";
import { getLocalePackage } from "@/lib/locale/store";
import { CURRENCIES } from "@/lib/locale/package";
import { ApiError, resolveCampusId } from "@/lib/api/scope";

/**
 * Create a bank account (POST /api/accounts/bank-accounts), extracted so the route and the AI Workflows
 * `accounts.create_bank_account` capability run the same command.
 * Body: { campusId?, name, bankName?, accountNumber?, currency?, openingBalance?, isActive? }.
 * The AI capability never passes `accountNumber` or `openingBalance`: those are typed on the Accounts screen.
 * The caller has already checked accounts.add. Throws ApiError with the route's messages.
 */
export async function createBankAccount(user: AuthUser, body: Record<string, unknown>) {
  const campusId = await resolveCampusId(user, body.campusId as string | null | undefined);
  const name = String(body.name ?? "").trim();
  if (!name) throw new ApiError("name is required", 400);

  const currency = (body.currency as string | undefined) || (await getLocalePackage(user.schoolId, campusId)).currency;
  if (!CURRENCIES.includes(currency as typeof CURRENCIES[number])) throw new ApiError("Invalid currency", 400);
  const openingBalance = Number(body.openingBalance ?? 0);
  if (!Number.isSafeInteger(openingBalance)) throw new ApiError("Opening balance must be an integer in minor units", 400);

  const existing = await prisma.bankAccount.findFirst({ where: { campusId, name } });
  if (existing) throw new ApiError("A bank account with this name already exists", 409);

  return prisma.$transaction(async (tx) => {
    const created = await tx.bankAccount.create({
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
    await writeAuditEvent(tx, user, {
      table: "bank_accounts", recordId: created.id, action: "CREATE", campusId: created.campusId,
      after: { currency: created.currency, openingBalance: created.openingBalance, isActive: created.isActive },
    });
    return created;
  });
}
