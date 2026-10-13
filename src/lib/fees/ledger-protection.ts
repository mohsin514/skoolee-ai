import type { TxClient } from "@/lib/db/prisma";
import { SchoolAiError } from "@/lib/school-ai/access";
import type { AuthUser } from "@/lib/auth";
import { ApiError } from "@/lib/api/scope";
import { moduleFlags } from "@/lib/permissions";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";
import { lockInvoiceGeneration } from "./invoice-generation";

/** Reconciliation evidence must remain linked to a real posting. All checks and
 * deletion share the same campus fence as reviewed expenses/reconciliation. */
export async function deleteUnreconciledManualLedgerEntry(user: AuthUser, id: string) {
  return schoolAiTransaction(user, async db => {
    const entryScope = { id, schoolId: user.schoolId, ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId || "" }) };
    const initial = await db.ledgerEntry.findFirst({ where: entryScope });
    if (!initial) throw new ApiError("Ledger entry not found", 404);
    await lockInvoiceGeneration(db, user.schoolId, initial.campusId);
    await assertCurrentAccountsPermission(db, user, "canDelete");
    const entry = await db.ledgerEntry.findFirst({ where: entryScope });
    if (!entry) throw new ApiError("Ledger entry not found", 404);
    if (entry.paymentId || entry.payrollLineId) throw new ApiError("Reverse the originating payment or payroll posting instead", 409);
    if (entry.bankAccountId) {
      const reconciliations = await db.bankReconciliation.findMany({ where: { schoolId: user.schoolId, campusId: entry.campusId, bankAccount: entry.bankAccountId, status: "reconciled", statementPeriodFrom: { lte: entry.date }, statementPeriodTo: { gte: new Date(entry.date.toISOString().slice(0, 10) + "T00:00:00.000Z") } }, take: 501, select: { reconciliationDetailsJson: true } });
      if (reconciliations.length > 500 || reconciliations.some(row => {
        const details = row.reconciliationDetailsJson as { rows?: Array<{ ledgerId?: string }> } | null;
        return details && Array.isArray(details.rows) && details.rows.some(line => line.ledgerId === entry.id);
      })) throw new ApiError("This entry is part of a reconciled bank statement and must remain available for audit", 409);
    }
    await db.ledgerEntry.delete({ where: { id: entry.id } });
    await db.auditLog.create({ data: { schoolId: user.schoolId, userId: user.userId, tableName: "ledger_entries", recordId: entry.id, oldValue: { amount: entry.amount, currency: entry.currency, kind: entry.kind, sourceName: entry.sourceName }, newValue: { deleted: true } } });
  });
}

export async function assertBankPeriodOpen(db: TxClient, schoolId: string, campusId: string, bankAccountId: string, date: Date) {
  const day = new Date(date.toISOString().slice(0, 10) + "T00:00:00.000Z");
  const closed = await db.bankReconciliation.findFirst({ where: { schoolId, campusId, bankAccount: bankAccountId, status: "reconciled", statementPeriodFrom: { lte: day }, statementPeriodTo: { gte: day } }, select: { id: true } });
  if (closed) throw new SchoolAiError("This bank statement period is reconciled. Use an open accounting period.", 409, "FINANCE_PERIOD_CLOSED");
}

export async function assertCurrentAccountsPermission(db: TxClient, user: AuthUser, action: "canAdd" | "canDelete") {
  const actor = await db.user.findFirst({ where: { id: user.userId, schoolId: user.schoolId, isActive: true }, select: { role: true, campusId: true, accessVersion: true } });
  if (!actor || actor.role !== user.role || actor.campusId !== user.campusId || user.accessVersion !== undefined && actor.accessVersion !== user.accessVersion) throw new ApiError("Account access changed", 403);
  const grants = await db.rolePermission.findMany({ where: { schoolId: user.schoolId, role: user.role } });
  if (!moduleFlags(grants, user.role, "accounts")[action]) throw new ApiError("Insufficient permissions", 403);
}
