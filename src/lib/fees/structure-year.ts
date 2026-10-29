import type { TxClient } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/scope";

/**
 * SKAI-1123: fee structures are scoped to an academic year (the campus AcademicCycle), and a
 * structure edit re-prices invoices nobody has paid against yet.
 */

type CycleDb = Pick<TxClient, "academicCycle">;

/** The requested year (must belong to this school + campus), else the campus's active year, else null. */
export async function resolveFeeStructureYearId(db: CycleDb, schoolId: string, campusId: string, requested?: unknown): Promise<string | null> {
  if (typeof requested === "string" && requested) {
    const cycle = await db.academicCycle.findFirst({ where: { id: requested, schoolId, campusId }, select: { id: true } });
    if (!cycle) throw new ApiError("Academic year not found for this campus", 400);
    return cycle.id;
  }
  const active = await db.academicCycle.findFirst({
    where: { schoolId, campusId, status: "ACTIVE" },
    orderBy: { academicYear: "desc" },
    select: { id: true },
  });
  return active?.id ?? null;
}

type YearScoped = { classId: string; academicYear?: { academicYear: number } | null };

/**
 * Picks the structure for a class in the class's academic year. Input is ordered newest activeFrom
 * first. A structure of the matching year wins; a legacy (year-less) one is the fallback; a
 * structure priced for another year is never used.
 */
export function pickStructureForClass<T extends YearScoped>(structures: T[], classId: string, classYear: number): T | undefined {
  const forClass = structures.filter((s) => s.classId === classId);
  return forClass.find((s) => s.academicYear?.academicYear === classYear) ?? forClass.find((s) => !s.academicYear);
}

export type LegacyStructure = {
  monthlyFee: number;
  oneTimeFeesJson: unknown;
  discountRulesJson: unknown;
  taxPercentage: number | null;
};

/** The legacy per-structure amounts, identical to the generate-invoices fallback. */
export function legacyInvoiceAmounts(structure: LegacyStructure) {
  const oneTimeFees = (structure.oneTimeFeesJson as Record<string, number> | null) ?? {};
  const oneTimeTotal = Object.values(oneTimeFees).reduce((sum, v) => sum + v, 0);
  const grossDues = (structure.discountRulesJson as Record<string, number> | null) ?? {};
  const discountPct = Object.values(grossDues).reduce((sum, v) => sum + (typeof v === "number" ? v : 0), 0);
  const monthlyFee = structure.monthlyFee;
  const subtotal = monthlyFee + oneTimeTotal;
  const discountAmount = Math.round(subtotal * Math.min(discountPct, 100) / 100);
  const taxPct = structure.taxPercentage ?? 0;
  const taxAmount = taxPct > 0 ? Math.round((subtotal - discountAmount) * taxPct / 100) : 0;
  return { oneTimeFees, oneTimeTotal, monthlyFee, subtotal, discountAmount, taxAmount };
}

type RecomputeStructure = LegacyStructure & {
  id: string;
  approvedFee?: number | null;
  approvedFeeReference?: string | null;
  campusId: string;
  classId: string;
  currency: string;
  activeFrom: Date;
  activeTo: Date | null;
  class: { academicYear: number };
};

/**
 * Re-prices invoices of this structure's class that are still PENDING with nothing paid. Must run inside
 * the caller's transaction. Skips invoices priced by the new fee-group model, invoices with an issued tax
 * document (fiscal documents are immutable) and invoices in another currency. Late fees are kept.
 */
export async function recomputePendingInvoices(
  tx: Pick<TxClient, "invoice" | "taxDocument" | "feeGroupAssignment" | "auditLog">,
  actor: { schoolId: string; userId: string },
  structure: RecomputeStructure,
) {
  const assignment = await tx.feeGroupAssignment.findFirst({
    where: { schoolId: actor.schoolId, campusId: structure.campusId, classId: structure.classId, academicYear: structure.class.academicYear },
    select: { id: true },
  });
  if (assignment) return { updated: 0, skipped: 0 };

  const invoices = await tx.invoice.findMany({
    where: {
      schoolId: actor.schoolId,
      campusId: structure.campusId,
      status: "PENDING",
      totalAmountPaid: 0,
      payments: { none: {} },
      student: { classId: structure.classId },
      invoiceDate: { gte: structure.activeFrom, ...(structure.activeTo ? { lte: structure.activeTo } : {}) },
    },
    select: { id: true, currency: true, lateFeeAmount: true, totalAmount: true },
  });
  if (!invoices.length) return { updated: 0, skipped: 0 };

  const taxed = new Set(
    (await tx.taxDocument.findMany({ where: { schoolId: actor.schoolId, invoiceId: { in: invoices.map((i) => i.id) } }, select: { invoiceId: true } }))
      .map((d) => d.invoiceId),
  );
  const amounts = legacyInvoiceAmounts(structure);
  const changes: Array<{ invoiceId: string; before: number; after: number }> = [];
  let skipped = 0;
  for (const invoice of invoices) {
    if (taxed.has(invoice.id) || invoice.currency !== structure.currency) { skipped++; continue; }
    const totalAmount = amounts.subtotal - amounts.discountAmount + invoice.lateFeeAmount + amounts.taxAmount;
    // Guarded so a payment landing mid-transaction is never overwritten.
    const res = await tx.invoice.updateMany({
      where: { id: invoice.id, schoolId: actor.schoolId, status: "PENDING", totalAmountPaid: 0 },
      data: {
        monthlyFee: amounts.monthlyFee,
        ...(structure.approvedFee !== undefined ? { approvedFee: structure.approvedFee, approvedFeeReference: structure.approvedFeeReference ?? null } : {}),
        oneTimeFees: amounts.oneTimeTotal,
        subtotal: amounts.subtotal,
        discountAmount: amounts.discountAmount,
        taxAmount: amounts.taxAmount,
        totalAmount,
        balanceDue: totalAmount,
      },
    });
    if (res.count === 1) changes.push({ invoiceId: invoice.id, before: invoice.totalAmount, after: totalAmount });
    else skipped++;
  }
  if (changes.length) {
    await tx.auditLog.create({
      data: {
        tableName: "invoice",
        recordId: `fee-structure-${structure.id}`,
        newValue: { action: "recompute_from_fee_structure", feeStructureId: structure.id, count: changes.length, skipped, changes },
        userId: actor.userId,
      },
    });
  }
  return { updated: changes.length, skipped };
}
