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

type LeaveRequestRow = { leaveTypeId: string; days: number };
type LeaveAllocationRow = { leaveTypeId: string; role: string | null; userId: string | null; days: number };

function leavePeriod(month: number, year: number) {
  return {
    from: new Date(Date.UTC(year, month - 1, 1)),
    to: new Date(Date.UTC(year, month, 1)),
    academicYear: month >= 3 ? year : year - 1, // Academic years run Mar–Feb
  };
}

// Pure per-staff calculation over that member's request and allocation rows.
function unpaidLeaveFromRows(
  monthRequests: LeaveRequestRow[],
  allocationRows: LeaveAllocationRow[],
  monthlyGross: number
): { deduction: number; days: number } {
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

// Deduction for APPROVED leave in the payroll month that exceeds each staff
// member's allocated balance for that leave type in the academic year.
// Unpaid days are priced at (basic + allowances) / 30 per day.
// SKAI-1861: loads a whole payroll run in two school- and campus-scoped
// queries (it used to be one round trip per staff member); rows are grouped in
// memory and fed to the same per-user calculation, so a per-user allocation
// still takes precedence over the role-wide one.
export async function unpaidLeaveDeductionsForMonth(
  scope: { schoolId: string; campusId: string },
  staff: Array<{ id: string; role: string; monthlyGross: number }>,
  month: number,
  year: number
): Promise<Map<string, { deduction: number; days: number }>> {
  const result = new Map<string, { deduction: number; days: number }>();
  if (staff.length === 0) return result;

  const { from, to, academicYear } = leavePeriod(month, year);
  const { schoolId, campusId } = scope;
  const ids = [...new Set(staff.map((s) => s.id))];
  const roles = [...new Set(staff.map((s) => s.role))];

  const [requestRows, allocationRows] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: {
        schoolId,
        campusId,
        userId: { in: ids },
        status: "APPROVED",
        fromDate: { lt: to },
        toDate: { gte: from },
      },
      select: { userId: true, leaveTypeId: true, days: true },
    }),
    prisma.leaveAllocation.findMany({
      where: {
        schoolId,
        campusId,
        academicYear,
        OR: [{ userId: { in: ids } }, { userId: null, role: { in: roles } }],
      },
      select: { leaveTypeId: true, role: true, userId: true, days: true },
    }),
  ]);

  const requestsByUser = new Map<string, LeaveRequestRow[]>();
  for (const r of requestRows) {
    const list = requestsByUser.get(r.userId) ?? [];
    list.push(r);
    requestsByUser.set(r.userId, list);
  }
  const userAllocations = new Map<string, LeaveAllocationRow[]>();
  const roleAllocations = new Map<string, LeaveAllocationRow[]>();
  for (const a of allocationRows) {
    const [map, key] = a.userId ? [userAllocations, a.userId] : [roleAllocations, a.role ?? ""];
    const list = map.get(key) ?? [];
    list.push(a);
    map.set(key, list);
  }

  for (const s of staff) {
    const allocations = [...(userAllocations.get(s.id) ?? []), ...(roleAllocations.get(s.role) ?? [])];
    result.set(s.id, unpaidLeaveFromRows(requestsByUser.get(s.id) ?? [], allocations, s.monthlyGross));
  }
  return result;
}
