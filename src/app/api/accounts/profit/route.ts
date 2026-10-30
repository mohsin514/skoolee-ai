import { getLocalePackage } from "@/lib/locale/store";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ledgerTotals, ledgerWhere } from "@/lib/fees/ledger-service";
import {
  ApiError,
  assertModuleRead,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
  scopedCampusWhere,
} from "@/lib/api/scope";

// Profit report
// GET /api/accounts/profit?campusId=&currency=&from=YYYY-MM-DD&to=YYYY-MM-DD[&accountId=&source=]
// Income, expense and net come from the same filter the ledger list and export use (SKO-468), so the
// report always reconciles to its rows. One currency per report; both endpoints inclusive (UTC dates).

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertModuleRead(user, "accounts");
    const { searchParams } = new URL(req.url);
    const campusId = await resolveCampusId(user, searchParams.get("campusId"));
    const currency = searchParams.get("currency") || (await getLocalePackage(user.schoolId, campusId)).currency;
    const from = searchParams.get("from"), to = searchParams.get("to");
    if (!from || !to) throw new ApiError("from and to are required", 400);
    const where = ledgerWhere(scopedCampusWhere(user, campusId ?? undefined) as never, { currency, from, to, accountId: searchParams.get("accountId"), source: searchParams.get("source") });

    const [totals, byAccount, bySourceRows, otherCurrencies] = await Promise.all([
      ledgerTotals(prisma, where),
      prisma.ledgerEntry.groupBy({ by: ["kind", "accountId"], where, _sum: { amount: true }, _count: { _all: true } }),
      prisma.ledgerEntry.findMany({ where, select: { kind: true, amount: true, paymentId: true, payrollLineId: true, reversalOfId: true } }),
      prisma.ledgerEntry.groupBy({ by: ["currency"], where: { ...ledgerWhere(scopedCampusWhere(user, campusId ?? undefined) as never, { currency, from, to }), currency: { not: currency } }, _count: { _all: true } }),
    ]);

    const accounts = await prisma.chartOfAccount.findMany({
      where: { id: { in: byAccount.map(row => row.accountId) } },
      select: { id: true, name: true, type: true, isActive: true },
    });
    const accountMap = new Map(accounts.map(a => [a.id, a]));
    const breakdown = byAccount
      .map(row => ({ accountId: row.accountId, accountName: accountMap.get(row.accountId)?.name ?? "(unknown)", accountActive: accountMap.get(row.accountId)?.isActive ?? false, type: row.kind, amount: row._sum.amount ?? 0, entries: row._count._all }))
      .sort((a, b) => a.type.localeCompare(b.type) || b.amount - a.amount);

    const bySource: Record<string, { income: number; expense: number; count: number }> = {};
    for (const row of bySourceRows) {
      const source = row.reversalOfId ? "CORRECTION" : row.paymentId ? "FEE" : row.payrollLineId ? "PAYROLL" : "MANUAL";
      const bucket = bySource[source] ??= { income: 0, expense: 0, count: 0 };
      if (row.kind === "INCOME") bucket.income += row.amount; else bucket.expense += row.amount;
      bucket.count += 1;
    }

    return Response.json({
      success: true,
      data: {
        currency, from, to,
        income: totals.income, expense: totals.expense, net: totals.net,
        incomeCount: totals.incomeCount, expenseCount: totals.expenseCount, count: totals.count,
        breakdown, bySource,
        basis: "cash",
        otherCurrencies: otherCurrencies.map(row => ({ currency: row.currency, entries: row._count._all })),
      },
    });
  } catch (error) {
    return errorResponse(error, "[accounts/profit] GET failed");
  }
}
