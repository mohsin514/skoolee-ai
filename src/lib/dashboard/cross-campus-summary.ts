import type { AuthUser } from "@/lib/auth";
import { AccessDenied, campusScope } from "@/lib/auth/policy";

// SKAI-824 (F4-FR-10): the owner's cross-campus roll-up — month-to-date collections (refunds net off,
// since reversals are negative payments), overdue balances and today's attendance exceptions, per campus.
// Only the school owner (SUPER_ADMIN) may see it; campusScope() keeps it inside their school and, when the
// campus switcher narrowed them, inside that one campus. Every reader below receives that scope.

export type Scope = { schoolId: string; campusId?: string };
export type CrossCampusDb = {
  campuses(scope: Scope): Promise<{ id: string; name: string }[]>;
  payments(scope: Scope, since: Date): Promise<{ campusId: string; amount: number }[]>;
  openInvoices(scope: Scope): Promise<{ campusId: string; balanceDue: number; dueDate: Date }[]>;
  attendance(scope: Scope, day: Date): Promise<{ campusId: string; status: string }[]>;
};

export const ATTENDANCE_EXCEPTIONS = ["ABSENT", "LATE", "PARTIAL"] as const;
type Figures = { collected: number; overdueCount: number; overdueAmount: number; attendanceExceptions: number };
export type CampusRow = { campusId: string; name: string } & Figures;

export async function crossCampusSummary(user: AuthUser, { now = new Date(), db }: { now?: Date; db?: CrossCampusDb } = {}) {
  if (user.role !== "SUPER_ADMIN") throw new AccessDenied("cross-campus-summary", "view", user);
  const scope = campusScope(user), reader = db ?? (await prismaReader());
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const [campuses, payments, invoices, marks] = await Promise.all([
    reader.campuses(scope), reader.payments(scope, monthStart), reader.openInvoices(scope), reader.attendance(scope, today),
  ]);
  const rows = new Map<string, CampusRow>(campuses.map((c) => [c.id, { campusId: c.id, name: c.name, collected: 0, overdueCount: 0, overdueAmount: 0, attendanceExceptions: 0 }]));
  for (const p of payments) { const r = rows.get(p.campusId); if (r) r.collected += p.amount; }
  for (const i of invoices) {
    const r = rows.get(i.campusId);
    if (r && i.balanceDue > 0 && i.dueDate < today) { r.overdueCount += 1; r.overdueAmount += i.balanceDue; }
  }
  for (const a of marks) {
    const r = rows.get(a.campusId);
    if (r && (ATTENDANCE_EXCEPTIONS as readonly string[]).includes(a.status)) r.attendanceExceptions += 1;
  }
  const list = [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
  const totals = list.reduce<Figures>((t, r) => ({ collected: t.collected + r.collected, overdueCount: t.overdueCount + r.overdueCount,
    overdueAmount: t.overdueAmount + r.overdueAmount, attendanceExceptions: t.attendanceExceptions + r.attendanceExceptions }),
  { collected: 0, overdueCount: 0, overdueAmount: 0, attendanceExceptions: 0 });
  return { asOf: now.toISOString(), campuses: list, totals };
}

async function prismaReader(): Promise<CrossCampusDb> {
  const { prisma } = await import("@/lib/db/prisma");
  const campusWhere = (s: Scope) => ({ schoolId: s.schoolId, ...(s.campusId ? { campusId: s.campusId } : {}) });
  return {
    campuses: (s) => prisma.campus.findMany({ where: { schoolId: s.schoolId, archivedAt: null, ...(s.campusId ? { id: s.campusId } : {}) }, select: { id: true, name: true } }),
    payments: (s, since) => prisma.payment.findMany({ where: { ...campusWhere(s), paymentDate: { gte: since } }, select: { campusId: true, amount: true } }),
    openInvoices: (s) => prisma.invoice.findMany({ where: { ...campusWhere(s), balanceDue: { gt: 0 }, status: { notIn: ["PAID", "CANCELLED"] } }, select: { campusId: true, balanceDue: true, dueDate: true } }),
    attendance: (s, day) => prisma.attendance.findMany({ where: { ...campusWhere(s), date: day, status: { in: [...ATTENDANCE_EXCEPTIONS] } }, select: { campusId: true, status: true } }),
  };
}
