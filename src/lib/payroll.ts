import { prisma } from "@/lib/db/prisma";

// Pro-rating rule: staff who joined after the first of the month get
// basic+allowances scaled by the fraction of the month they were employed
// (join day counts as a full working day). Deductions are NOT pro-rated.
export function proRateFactor(joiningDate: Date | null, month: number, year: number): number {
  if (!joiningDate) return 1;
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  if (joiningDate <= firstOfMonth) return 1;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const joinDay = joiningDate.getUTCDate();
  if (joinDay > daysInMonth) return 1;
  return (daysInMonth - joinDay + 1) / daysInMonth;
}

export function computePayrollLine(
  basicSalary: number,
  allowancesJson: unknown,
  deductionsJson: unknown,
  proRate: number,
  leaveDeduction = 0
): PayrollComputed {
  const allowances = sumMap(allowancesJson).map((a) => a.amount).reduce((s, n) => s + n, 0);
  const deductions = sumMap(deductionsJson).map((d) => d.amount).reduce((s, n) => s + n, 0);

  const basic = Math.round(basicSalary * proRate);
  const allowanceTotal = Math.round(allowances * proRate);
  const proRated = proRate < 1;

  const net = basic + allowanceTotal - deductions + 0 - leaveDeduction;

  return {
    basic,
    allowances: allowanceTotal,
    deductions,
    bonus: 0,
    net,
    breakdownJson: {
      allowances: sumMap(allowancesJson).map((a) => ({ name: a.name, amount: Math.round(a.amount * proRate) })),
      deductions: sumMap(deductionsJson),
      leaveDeduction: leaveDeduction > 0 ? leaveDeduction : undefined,
      proRated: proRated || undefined,
      unpaidLeaveDays: leaveDeduction > 0 ? Math.round((leaveDeduction / ((basicSalary + allowances) / 30)) * 10) / 10 : undefined,
    },
  };
}


export interface PayrollComputed {
  basic: number;
  allowances: number;
  deductions: number;
  bonus: number;
  net: number;
  breakdownJson: {
    allowances: Array<{ name: string; amount: number }>;
    deductions: Array<{ name: string; amount: number }>;
    leaveDeduction?: number;
    proRated?: boolean;
    unpaidLeaveDays?: number;
  };
}

function sumMap(value: unknown): Array<{ name: string; amount: number }> {
  if (typeof value !== "object" || value === null) return [];
  const entries = Object.entries(value as Record<string, unknown>);
  const out: Array<{ name: string; amount: number }> = [];
  for (const [name, raw] of entries) {
    const amount = Math.round(Number(raw));
    if (Number.isFinite(amount) && amount !== 0) out.push({ name, amount });
  }
  return out;
}

// Deduction for APPROVED leave in the payroll month that exceeds the
// staff's allocated balance for that leave type in the academic year.
// Unpaid days are priced at (basic + allowances) / 30 per day.
export async function unpaidLeaveDeductionForMonth(
  campusId: string,
  userId: string,
  role: string,
  month: number,
  year: number,
  monthlyGross: number
): Promise<{ deduction: number; days: number }> {
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 1));

  const academicYear = month >= 3 ? year : year - 1; // Academic years run Mar–Feb

  const [monthRequests, allocationRows] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: {
        campusId,
        userId,
        status: "APPROVED",
        fromDate: { lt: to },
        toDate: { gte: from },
      },
      select: { leaveTypeId: true, days: true },
    }),
    prisma.leaveAllocation.findMany({
      where: {
        campusId,
        academicYear,
        OR: [{ userId }, { userId: null, role }],
      },
      select: { leaveTypeId: true, role: true, userId: true, days: true },
    }),
  ]);

  const allocations = new Map<string, number>();
  for (const a of allocationRows) {
    if (a.userId) {
      allocations.set(a.leaveTypeId, a.days); // per-user row takes precedence
    } else if (!allocations.has(a.leaveTypeId)) {
      allocations.set(a.leaveTypeId, a.days); // role-wide row
    }
  }

  const approvedByType = new Map<string, number>();
  for (const r of monthRequests) {
    approvedByType.set(r.leaveTypeId, (approvedByType.get(r.leaveTypeId) ?? 0) + r.days);
  }

  let unpaidTenths = 0;
  for (const [leaveTypeId, approved] of approvedByType) {
    const allocated = allocations.get(leaveTypeId) ?? 0;
    if (allocated === 0) {
      unpaidTenths += approved;
    } else if (approved > allocated) {
      unpaidTenths += approved - allocated;
    }
  }

  const days = unpaidTenths / 10;
  const deduction = Math.round((monthlyGross / 30) * days);
  return { deduction, days };
}
