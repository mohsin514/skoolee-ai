import { createHash } from "node:crypto";
import type { AuthUser } from "@/lib/auth";
import { ApiError } from "@/lib/api/scope";
import { writeAuditEvent } from "@/lib/audit-events";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";
import { lockInvoiceGeneration } from "@/lib/fees/invoice-generation";
import { assertBankPeriodOpen, assertCurrentAccountsPermission } from "@/lib/fees/ledger-protection";

/**
 * SKAI-1506: reverse a posted payroll expense. The original ledger entry is never edited or deleted; an equal and
 * opposite entry dated today is linked to it (reversalOfId), and the payroll line becomes REVERSED. Only a finance
 * role with accounts write access may do this, inside its own school and campus. A closed (reconciled) period is
 * refused. A second reversal of the line, or a replay with the same idempotency key, returns the first reversal.
 */
export async function reversePayrollLine(user: AuthUser, lineId: string, reasonInput: unknown, keyInput?: unknown) {
  const reason = String(reasonInput ?? "").trim();
  if (reason.length < 5 || reason.length > 500) throw new ApiError("Explain why this payroll expense is being reversed (5–500 characters).", 400);
  const key = keyInput ? String(keyInput) : null;
  if (key && !/^[A-Za-z0-9-]{8,80}$/.test(key)) throw new ApiError("Invalid idempotency key", 400);
  return schoolAiTransaction(user, async db => {
    const scope = { id: lineId, schoolId: user.schoolId, ...(user.role === "SUPER_ADMIN" ? {} : { payrollRun: { campusId: user.campusId || "" } }) };
    const initial = await db.payrollLine.findFirst({ where: scope, select: { payrollRun: { select: { campusId: true } } } });
    if (!initial) throw new ApiError("Payroll line not found", 404);
    const campusId = initial.payrollRun.campusId;
    await lockInvoiceGeneration(db, user.schoolId, campusId);
    await assertCurrentAccountsPermission(db, user, "canAdd");
    // A line may own several postings once reposted; the one to reverse is its latest original (non-correction) posting.
    const line = await db.payrollLine.findFirst({ where: scope, include: { ledgerEntries: { where: { reversalOfId: null }, include: { reversedBy: true }, orderBy: { createdAt: "desc" }, take: 1 } } });
    const original = line?.ledgerEntries[0];
    if (!line || !original) throw new ApiError("Only a paid payroll line with a posted expense can be reversed.", 409);
    const requestHash = createHash("sha256").update(JSON.stringify({ lineId, original: original.id })).digest("hex");
    if (key) {
      const previous = await db.ledgerEntry.findUnique({ where: { campusId_idempotencyKey: { campusId, idempotencyKey: key } } });
      if (previous) {
        if (previous.requestHash !== requestHash) throw new ApiError("This retry does not match the original reversal. Start a new request instead.", 409);
        return { entry: previous, line, replayed: true };
      }
    }
    if (original.reversedBy) return { entry: original.reversedBy, line, replayed: true };
    if (line.status !== "PAID") throw new ApiError("Only a paid payroll line with a posted expense can be reversed.", 409);
    const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
    if (original.bankAccountId) await assertBankPeriodOpen(db, user.schoolId, campusId, original.bankAccountId, today);
    const entry = await db.ledgerEntry.create({ data: { schoolId: original.schoolId, campusId, kind: original.kind, currency: original.currency, amount: -original.amount, accountId: original.accountId, bankAccountId: original.bankAccountId, paymentMethod: original.paymentMethod, date: today, sourceName: `Reversal of ${original.sourceName}`.slice(0, 200), note: reason, reversalOfId: original.id, createdById: user.userId, idempotencyKey: key, requestHash: key ? requestHash : null } });
    const reversed = await db.payrollLine.update({ where: { id: line.id }, data: { status: "REVERSED" } });
    await writeAuditEvent(db, user, { table: "payroll_lines", recordId: line.id, action: "UPDATE", campusId, before: { status: line.status, net: line.net, ledgerEntryId: original.id }, after: { status: reversed.status, reversalEntryId: entry.id, reason } });
    await db.auditLog.create({ data: { schoolId: user.schoolId, userId: user.userId, tableName: "ledger_entries", recordId: original.id, oldValue: { amount: original.amount, currency: original.currency, date: original.date.toISOString().slice(0, 10) }, newValue: { reversedBy: entry.id, reason, source: "PAYROLL_REVERSAL" } } });
    return { entry, line: reversed, replayed: false };
  });
}
