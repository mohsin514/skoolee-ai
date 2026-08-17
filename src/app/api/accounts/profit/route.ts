import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  ApiError,
  assertModuleRead,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
  scopedCampusWhere,
} from "@/lib/api/scope";

// Profit report
// GET /api/accounts/profit?campusId=&from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns income total, expense total, net, and a per-account breakdown for
// both kinds. Inclusive of both endpoints; campus-scoped.

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertModuleRead(user, "accounts");
    const { searchParams } = new URL(req.url);
    const campusId = await resolveCampusId(user, searchParams.get("campusId"));

    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    if (!fromParam || !toParam) throw new ApiError("from and to are required", 400);

    const from = new Date(`${fromParam}T00:00:00Z`);
    const to = new Date(`${toParam}T23:59:59.999Z`);
    if (isNaN(from.getTime()) || isNaN(to.getTime())) throw new ApiError("invalid date range", 400);
    if (from.getTime() > to.getTime()) throw new ApiError("from must be before to", 400);

    const baseWhere: any = scopedCampusWhere(user, campusId ?? undefined) as any;
    const rangeWhere = { ...baseWhere, date: { gte: from, lte: to } };

    const [incomeAgg, expenseAgg, entries] = await Promise.all([
      prisma.ledgerEntry.aggregate({
        where: { ...rangeWhere, kind: "INCOME" },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.ledgerEntry.aggregate({
        where: { ...rangeWhere, kind: "EXPENSE" },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.ledgerEntry.groupBy({
        by: ["kind", "accountId"],
        where: rangeWhere,
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ]);

    const accounts = await prisma.chartOfAccount.findMany({
      where: { campusId: campusId ?? undefined, type: { in: ["INCOME", "EXPENSE"] } },
      select: { id: true, name: true, type: true },
    });
    const accountMap = new Map(accounts.map((a) => [a.id, a]));

    const breakdown = entries
      .map((e) => {
        const acc = accountMap.get(e.accountId);
        return {
          accountId: e.accountId,
          accountName: acc?.name ?? "(deleted)",
          type: e.kind,
          amount: e._sum.amount ?? 0,
          entries: e._count._all,
        };
      })
      .sort((a, b) => b.amount - a.amount);

    const income = incomeAgg._sum.amount ?? 0;
    const expense = expenseAgg._sum.amount ?? 0;

    return Response.json({
      success: true,
      data: {
        from: fromParam,
        to: toParam,
        income,
        expense,
        net: income - expense,
        incomeCount: incomeAgg._count._all,
        expenseCount: expenseAgg._count._all,
        breakdown,
      },
    });
  } catch (error) {
    return errorResponse(error, "[accounts/profit] GET failed");
  }
}