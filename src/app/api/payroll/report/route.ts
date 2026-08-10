import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, canManageOperations, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";

// GET /api/payroll/report?campusId=&from=YYYY-MM&to=YYYY-MM
// Runs + lines across a month range with totals per run and grand totals.

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    const { searchParams } = new URL(req.url);
    const campusId = await resolveCampusId(user, searchParams.get("campusId"));

    const fromRaw = searchParams.get("from");
    const toRaw = searchParams.get("to");
    const from = parseMonth(fromRaw ?? "", new Date().getFullYear());
    const to = parseMonth(toRaw ?? "", new Date().getFullYear());
    if (from.key > to.key) throw new ApiError("from must be <= to", 400);

    const runs = await prisma.payrollRun.findMany({
      where: {
        campusId,
        OR: [
          { year: from.year, month: { gte: from.month } },
          { year: to.year, month: { lte: to.month } },
          { year: { gt: from.year, lt: to.year } },
        ],
      },
      include: {
        lines: {
          include: { user: { select: { id: true, fullName: true, role: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: [{ year: "asc" }, { month: "asc" }],
    });

    const withTotals = runs.map((run) => {
      const t = run.lines.reduce(
        (acc, l) => {
          acc.basic += l.basic;
          acc.allowances += l.allowances;
          acc.deductions += l.deductions;
          acc.bonus += l.bonus;
          acc.net += l.net;
          if (l.status === "PAID") acc.paid += l.net;
          return acc;
        },
        { basic: 0, allowances: 0, deductions: 0, bonus: 0, net: 0, paid: 0 }
      );
      return { ...run, totals: t };
    });

    const grand = withTotals.reduce(
      (acc, r) => {
        acc.basic += r.totals.basic;
        acc.allowances += r.totals.allowances;
        acc.deductions += r.totals.deductions;
        acc.bonus += r.totals.bonus;
        acc.net += r.totals.net;
        acc.paid += r.totals.paid;
        return acc;
      },
      { basic: 0, allowances: 0, deductions: 0, bonus: 0, net: 0, paid: 0 }
    );

    return Response.json({ success: true, data: { runs: withTotals, grand } });
  } catch (error) {
    return errorResponse(error, "[payroll/report] GET failed");
  }
}

function parseMonth(raw: string, defaultYear: number): { month: number; year: number; key: number } {
  const match = /^(\d{4})-(\d{1,2})$/.exec(String(raw).trim());
  if (!match) throw new ApiError("from/to must be YYYY-MM", 400);
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  if (month < 1 || month > 12) throw new ApiError("month must be 1-12", 400);
  if (year < 2000 || year > 2100) throw new ApiError("year must be 2000-2100", 400);
  return { month, year, key: year * 12 + month };
}
