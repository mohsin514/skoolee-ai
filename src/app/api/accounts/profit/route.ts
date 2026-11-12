import { getLocalePackage } from "@/lib/locale/store";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ledgerTotals, ledgerWhere } from "@/lib/fees/ledger-service";
import type { Prisma } from "@prisma/client";
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

// Source buckets, in display order. Each condition matches the classification the ledger list uses:
// a reversal is a CORRECTION whatever it points at, then payment, then payroll line, else manual.
const SOURCE_FILTERS: [string, Prisma.LedgerEntryWhereInput][] = [
  ["FEE", { reversalOfId: null, paymentId: { not: null } }],
  ["PAYROLL", { reversalOfId: null, paymentId: null, payrollLineId: { not: null } }],
  ["MANUAL", { reversalOfId: null, paymentId: null, payrollLineId: null }],
  ["CORRECTION", { reversalOfId: { not: null } }],
];

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

    // Per-source totals are aggregated in the database (one groupBy per source) instead of loading every entry.
    const [totals, byAccount, bySourceGroups, otherCurrencies] = await Promise.all([
      ledgerTotals(prisma, where),
      prisma.ledgerEntry.groupBy({ by: ["kind", "accountId"], where, _sum: { amount: true }, _count: { _all: true } }),
      Promise.all(SOURCE_FILTERS.map(([, filter]) => prisma.ledgerEntry.groupBy({ by: ["kind"], where: { AND: [where, filter] }, _sum: { amount: true }, _count: { _all: true } }))),
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
    SOURCE_FILTERS.forEach(([source], index) => {
      for (const group of bySourceGroups[index]) {
        if (!group._count._all) continue;
        const bucket = bySource[source] ??= { income: 0, expense: 0, count: 0 };
        if (group.kind === "INCOME") bucket.income += group._sum.amount ?? 0; else bucket.expense += group._sum.amount ?? 0;
        bucket.count += group._count._all;
      }
    });

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
