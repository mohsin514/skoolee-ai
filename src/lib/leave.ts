import { prisma } from "@/lib/db/prisma";

// Leave days are stored as Int tenths (5 = half day, 10 = one day).
// These helpers keep the conversions in one place.

export function daysToTenths(days: number): number {
  return Math.max(1, Math.round(Number(days) * 10));
}

export function tenthsToDays(tenths: number): number {
  return tenths / 10;
}

export function rangeTenths(from: Date, to: Date): number {
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  const days = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  return Math.max(1, days * 10);
}

export interface LeaveBalance {
  leaveTypeId: string;
  name: string;
  allocated: number; // tenths
  approved: number; // tenths (approved + pending holds? no — approved only)
  pending: number; // tenths (pending requests, not counted against balance until approved)
  remaining: number; // tenths
}

// Allocation resolution: a per-user override wins over a role-wide row.
export async function getLeaveAllocations(campusId: string, userId: string, role: string, academicYear: number) {
  return prisma.leaveAllocation.findMany({
    where: {
      campusId,
      academicYear,
      OR: [{ userId }, { userId: null, role }],
    },
    include: { leaveType: true },
  });
}

export async function getLeaveBalances(campusId: string, userId: string, role: string, academicYear: number): Promise<LeaveBalance[]> {
  const [allocations, approvedRows, pendingRows] = await Promise.all([
    getLeaveAllocations(campusId, userId, role, academicYear),
    prisma.leaveRequest.findMany({
      where: {
        campusId,
        userId,
        status: "APPROVED",
        fromDate: { gte: new Date(`${academicYear}-01-01T00:00:00Z`), lt: new Date(`${academicYear + 1}-01-01T00:00:00Z`) },
      },
      include: { leaveType: true },
    }),
    prisma.leaveRequest.findMany({
      where: {
        campusId,
        userId,
        status: "PENDING",
        fromDate: { gte: new Date(`${academicYear}-01-01T00:00:00Z`), lt: new Date(`${academicYear + 1}-01-01T00:00:00Z`) },
      },
      include: { leaveType: true },
    }),
  ]);

  // User-specific allocation wins; role rows are fallbacks per leave type.
  const byType = new Map<string, number>();
  const userTypeIds = new Set(allocations.filter((a) => a.userId).map((a) => a.leaveTypeId));
  for (const a of allocations) {
    if (a.userId || !userTypeIds.has(a.leaveTypeId)) {
      byType.set(a.leaveTypeId, Math.max(byType.get(a.leaveTypeId) || 0, a.days));
    }
  }

  const approvedByType = new Map<string, number>();
  for (const r of approvedRows) {
    approvedByType.set(r.leaveTypeId, (approvedByType.get(r.leaveTypeId) || 0) + r.days);
  }
  const pendingByType = new Map<string, number>();
  for (const r of pendingRows) {
    pendingByType.set(r.leaveTypeId, (pendingByType.get(r.leaveTypeId) || 0) + r.days);
  }

  const typeNames = new Map<string, string>();
  for (const a of allocations) typeNames.set(a.leaveTypeId, a.leaveType.name);
  for (const r of [...approvedRows, ...pendingRows]) typeNames.set(r.leaveTypeId, r.leaveType.name);

  const allTypeIds = new Set([...byType.keys(), ...approvedByType.keys(), ...pendingByType.keys()]);
  return [...allTypeIds].map((leaveTypeId) => {
    const allocated = byType.get(leaveTypeId) || 0;
    const approved = approvedByType.get(leaveTypeId) || 0;
    const pending = pendingByType.get(leaveTypeId) || 0;
    return {
      leaveTypeId,
      name: typeNames.get(leaveTypeId) || "Leave",
      allocated,
      approved,
      pending,
      remaining: Math.max(0, allocated - approved),
    };
  });
}
