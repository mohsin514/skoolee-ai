import type { TxClient } from "@/lib/db/prisma";
import { paymentAcademicYear } from "@/lib/fees/payment-year";

/**
 * SKAI-1543 repair: before the fix, an overpayment credit was keyed by the payment's calendar year
 * (fromAcademicYear = paymentDate year). This moves each such credit to the academic year of the
 * invoice it was paid against. It only moves credit that is still unconsumed, never edits payments
 * or invoices, and marks every moved payment on the target row so a re-run is a no-op.
 */
export type CarryRow = { id: string; studentId: string; toAcademicYear: number; balance: number; currency: string; note: string | null };
export type CreditSource = { paymentId: string; studentId: string; currency: string; credit: number; recordedYear: number; correctYear: number };
export type RepairStep =
  | { kind: "move"; paymentId: string; studentId: string; credit: number; currency: string; fromToYear: number; toToYear: number }
  | { kind: "skip"; paymentId: string; reason: string };

export const repairMarker = (paymentId: string) => `[SKAI-1543 moved ${paymentId}]`;

export function planCarryRepair(sources: CreditSource[], carries: CarryRow[]): RepairStep[] {
  const rows = new Map(carries.map(c => [`${c.studentId}:${c.toAcademicYear}`, { ...c }]));
  const steps: RepairStep[] = [];
  for (const s of sources) {
    if (s.credit <= 0 || s.recordedYear === s.correctYear) continue;
    const fromKey = `${s.studentId}:${s.recordedYear + 1}`;
    const toKey = `${s.studentId}:${s.correctYear + 1}`;
    const target = rows.get(toKey);
    if (target?.note?.includes(repairMarker(s.paymentId))) continue; // already repaired
    const from = rows.get(fromKey);
    if (!from || from.currency !== s.currency) { steps.push({ kind: "skip", paymentId: s.paymentId, reason: "misdated credit row missing or in another currency" }); continue; }
    if (from.balance > -s.credit) { steps.push({ kind: "skip", paymentId: s.paymentId, reason: "credit already consumed; reconcile manually" }); continue; }
    if (target && target.currency !== s.currency) { steps.push({ kind: "skip", paymentId: s.paymentId, reason: "target year credit is in another currency" }); continue; }
    from.balance += s.credit;
    rows.set(toKey, { ...(target ?? { id: "", studentId: s.studentId, toAcademicYear: s.correctYear + 1, balance: 0, currency: s.currency, note: null }), balance: (target?.balance ?? 0) - s.credit, note: `${target?.note ?? ""}${repairMarker(s.paymentId)}` });
    steps.push({ kind: "move", paymentId: s.paymentId, studentId: s.studentId, credit: s.credit, currency: s.currency, fromToYear: s.recordedYear + 1, toToYear: s.correctYear + 1 });
  }
  return steps;
}

type RepairTx = Pick<TxClient, "payment" | "paymentAllocation" | "feeCarryForward" | "studentEnrollment" | "academicCycle">;

/** Plans (and with apply=true performs) the repair for ONE school, for payments recorded before `before`. */
export async function repairMisdatedCredits(tx: RepairTx, opts: { schoolId: string; before: Date; apply: boolean }) {
  const payments = await tx.payment.findMany({
    where: { schoolId: opts.schoolId, reversalOfId: null, amount: { gt: 0 }, createdAt: { lt: opts.before } },
    include: { invoice: { select: { campusId: true, enrollmentId: true } } },
    orderBy: { createdAt: "asc" },
  });
  const sources: CreditSource[] = [];
  for (const p of payments) {
    const reversals = await tx.payment.findMany({ where: { schoolId: opts.schoolId, reversalOfId: p.id }, select: { id: true } });
    const allocations = await tx.paymentAllocation.findMany({ where: { schoolId: opts.schoolId, paymentId: { in: [p.id, ...reversals.map(r => r.id)] } } });
    const credit = allocations.reduce((n, a) => n + a.credit, 0);
    if (credit <= 0) continue;
    sources.push({ paymentId: p.id, studentId: p.studentId, currency: p.currency, credit, recordedYear: p.paymentDate.getFullYear(), correctYear: await paymentAcademicYear(tx, p.invoice, p.paymentDate) });
  }
  const studentIds = [...new Set(sources.map(s => s.studentId))];
  const carries = studentIds.length ? await tx.feeCarryForward.findMany({ where: { schoolId: opts.schoolId, studentId: { in: studentIds } } }) : [];
  const steps = planCarryRepair(sources, carries);
  if (opts.apply) {
    for (const step of steps) {
      if (step.kind !== "move") continue;
      const from = await tx.feeCarryForward.findFirst({ where: { schoolId: opts.schoolId, studentId: step.studentId, toAcademicYear: step.fromToYear } });
      if (!from) throw new Error(`Carry row vanished for ${step.paymentId}`);
      await tx.feeCarryForward.update({ where: { id: from.id }, data: { balance: from.balance + step.credit } });
      const target = await tx.feeCarryForward.findFirst({ where: { schoolId: opts.schoolId, studentId: step.studentId, toAcademicYear: step.toToYear } });
      if (target) {
        await tx.feeCarryForward.update({ where: { id: target.id }, data: { balance: target.balance - step.credit, note: `${target.note ?? ""}${repairMarker(step.paymentId)}` } });
      } else {
        await tx.feeCarryForward.create({ data: { schoolId: opts.schoolId, campusId: from.campusId, studentId: step.studentId, fromAcademicYear: step.toToYear - 1, toAcademicYear: step.toToYear, balance: -step.credit, currency: step.currency, note: `Auto credit from overpayment${repairMarker(step.paymentId)}` } });
      }
    }
  }
  return steps;
}
