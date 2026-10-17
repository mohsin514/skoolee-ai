import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { TxClient } from "@/lib/db/prisma";
import type { AuthUser } from "@/lib/auth";
import { ApiError } from "@/lib/api/scope";
import { CURRENCIES, minorUnits } from "@/lib/locale/package";
import { getLocalePackage } from "@/lib/locale/store";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";
import { lockInvoiceGeneration } from "./invoice-generation";
import { assertBankPeriodOpen, assertCurrentAccountsPermission } from "./ledger-protection";

// SKO-468: one place decides which ledger rows a filter selects, so the list, the totals and the
// export are always computed from the same rows. Totals are per currency and never mix kinds.

export const LEDGER_SOURCES = ["MANUAL", "FEE", "PAYROLL", "CORRECTION"] as const;
export type LedgerSource = typeof LEDGER_SOURCES[number];
export const LEDGER_STATUSES = ["all", "open", "reversed"] as const;

export function ledgerSource(row: { paymentId?: string | null; payrollLineId?: string | null; reversalOfId?: string | null }): LedgerSource {
  if (row.reversalOfId) return "CORRECTION";
  if (row.paymentId) return "FEE";
  if (row.payrollLineId) return "PAYROLL";
  return "MANUAL";
}

const day = (value: string | null, end: boolean) => {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ApiError("Dates must be YYYY-MM-DD", 400);
  const parsed = new Date(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}Z`);
  if (Number.isNaN(parsed.getTime())) throw new ApiError("Invalid date", 400);
  return parsed;
};

export type LedgerFilters = { currency: string; kind?: string | null; accountId?: string | null; from?: string | null; to?: string | null; source?: string | null; status?: string | null };

export function ledgerWhere(scope: Prisma.LedgerEntryWhereInput, filters: LedgerFilters): Prisma.LedgerEntryWhereInput {
  if (!CURRENCIES.includes(filters.currency as typeof CURRENCIES[number])) throw new ApiError("Invalid currency", 400);
  const where: Prisma.LedgerEntryWhereInput = { ...scope, currency: filters.currency };
  const kind = filters.kind?.toUpperCase();
  if (kind) { if (kind !== "INCOME" && kind !== "EXPENSE") throw new ApiError("kind must be INCOME or EXPENSE", 400); where.kind = kind; }
  if (filters.accountId) where.accountId = filters.accountId;
  const from = day(filters.from ?? null, false), to = day(filters.to ?? null, true);
  if (from && to && from > to) throw new ApiError("from must be before to", 400);
  if (from || to) where.date = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  const source = filters.source?.toUpperCase();
  if (source) {
    if (!LEDGER_SOURCES.includes(source as LedgerSource)) throw new ApiError("Unknown source", 400);
    if (source === "FEE") Object.assign(where, { paymentId: { not: null }, reversalOfId: null });
    if (source === "PAYROLL") Object.assign(where, { payrollLineId: { not: null }, reversalOfId: null });
    if (source === "CORRECTION") where.reversalOfId = { not: null };
    if (source === "MANUAL") Object.assign(where, { paymentId: null, payrollLineId: null, reversalOfId: null });
  }
  const status = filters.status || "all";
  if (!LEDGER_STATUSES.includes(status as typeof LEDGER_STATUSES[number])) throw new ApiError("Unknown status", 400);
  if (status === "reversed") where.OR = [{ reversedBy: { isNot: null } }, { reversalOfId: { not: null } }];
  if (status === "open") Object.assign(where, { reversedBy: { is: null }, reversalOfId: null });
  return where;
}

export type LedgerTotals = { income: number; expense: number; net: number; incomeCount: number; expenseCount: number; count: number };

export async function ledgerTotals(db: Pick<TxClient, "ledgerEntry">, where: Prisma.LedgerEntryWhereInput): Promise<LedgerTotals> {
  const groups = await db.ledgerEntry.groupBy({ by: ["kind"], where, _sum: { amount: true }, _count: { _all: true } });
  const pick = (kind: string) => groups.find(group => group.kind === kind);
  const income = pick("INCOME")?._sum.amount ?? 0, expense = pick("EXPENSE")?._sum.amount ?? 0;
  const incomeCount = pick("INCOME")?._count._all ?? 0, expenseCount = pick("EXPENSE")?._count._all ?? 0;
  return { income, expense, net: income - expense, incomeCount, expenseCount, count: incomeCount + expenseCount };
}

/** Totals computed from already-loaded rows; the export uses this so the file proves its own sums. */
export function totalsOf(rows: { kind: string; amount: number }[]): LedgerTotals {
  const income = rows.filter(row => row.kind === "INCOME"), expense = rows.filter(row => row.kind === "EXPENSE");
  const sum = (list: { amount: number }[]) => list.reduce((total, row) => total + row.amount, 0);
  return { income: sum(income), expense: sum(expense), net: sum(income) - sum(expense), incomeCount: income.length, expenseCount: expense.length, count: rows.length };
}

export function majorAmount(minor: number, currency: string) {
  const digits = minorUnits(currency);
  const sign = minor < 0 ? "-" : "", absolute = Math.abs(minor), scale = 10 ** digits;
  return digits ? `${sign}${Math.trunc(absolute / scale)}.${String(absolute % scale).padStart(digits, "0")}` : `${sign}${absolute}`;
}

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export type ManualEntryInput = { campusId?: string | null; kind?: unknown; sourceName?: unknown; accountId?: unknown; currency?: unknown; amount?: unknown; date?: unknown; paymentMethod?: unknown; bankAccountId?: unknown; note?: unknown; idempotencyKey?: unknown };

export async function postManualEntry(user: AuthUser, campusId: string, body: ManualEntryInput) {
  return schoolAiTransaction(user, async db => {
    await lockInvoiceGeneration(db, user.schoolId, campusId);
    await assertCurrentAccountsPermission(db, user, "canAdd");
    const kind = String(body.kind ?? "").toUpperCase();
    const currency = String(body.currency || (await getLocalePackage(user.schoolId, campusId, undefined, undefined, db)).currency);
    if (!CURRENCIES.includes(currency as typeof CURRENCIES[number])) throw new ApiError("Invalid currency", 400);
    if (kind !== "INCOME" && kind !== "EXPENSE") throw new ApiError("kind must be INCOME or EXPENSE", 400);
    const amount = Number(body.amount);
    if (!Number.isInteger(amount) || amount <= 0 || amount > 2147483647) throw new ApiError("Enter an amount greater than zero.", 400);
    const sourceName = String(body.sourceName ?? "").trim();
    if (sourceName.length < 3 || sourceName.length > 200) throw new ApiError("Describe what this money is for (3–200 characters).", 400);
    const dateText = String(body.date ?? "");
    const date = day(dateText, false);
    if (!date) throw new ApiError("Choose the date of the transaction.", 400);
    if (date.getTime() > Date.now() + 86_400_000) throw new ApiError("The transaction date cannot be in the future.", 400);
    if (!body.accountId) throw new ApiError("Choose an account.", 400);
    const key = body.idempotencyKey ? String(body.idempotencyKey) : null;
    if (key && !/^[A-Za-z0-9-]{8,80}$/.test(key)) throw new ApiError("Invalid idempotency key", 400);
    const payload = { kind, currency, amount, sourceName, accountId: String(body.accountId), date: dateText, bankAccountId: body.bankAccountId ? String(body.bankAccountId) : null, paymentMethod: body.paymentMethod ? String(body.paymentMethod).trim() : null, note: body.note ? String(body.note).trim() : null };
    const requestHash = hash(payload);
    if (key) {
      const previous = await db.ledgerEntry.findUnique({ where: { campusId_idempotencyKey: { campusId, idempotencyKey: key } } });
      if (previous) {
        if (previous.requestHash !== requestHash) throw new ApiError("This retry does not match the original entry. Start a new entry instead.", 409);
        return { entry: previous, replayed: true };
      }
    }
    const account = await db.chartOfAccount.findFirst({ where: { id: payload.accountId, campusId } });
    if (!account) throw new ApiError("Account not found", 404);
    if (account.type !== kind) throw new ApiError(kind === "INCOME" ? "Choose an income account." : "Choose an expense account.", 400);
    if (!account.isActive) throw new ApiError("This account is inactive. Reactivate it or choose another account.", 409);
    let bankAccountId: string | null = null;
    if (payload.bankAccountId) {
      const bank = await db.bankAccount.findFirst({ where: { id: payload.bankAccountId, campusId } });
      if (!bank) throw new ApiError("Bank account not found", 404);
      if (!bank.isActive) throw new ApiError("This bank account is inactive.", 409);
      if (bank.currency !== currency) throw new ApiError("Bank account currency must match the ledger entry", 400);
      await assertBankPeriodOpen(db, user.schoolId, campusId, bank.id, date);
      bankAccountId = bank.id;
    }
    const entry = await db.ledgerEntry.create({ data: { schoolId: user.schoolId, campusId, kind, currency, amount, sourceName, accountId: account.id, bankAccountId, date, paymentMethod: payload.paymentMethod, note: payload.note, createdById: user.userId, idempotencyKey: key, requestHash: key ? requestHash : null } });
    await db.auditLog.create({ data: { schoolId: user.schoolId, userId: user.userId, tableName: "ledger_entries", recordId: entry.id, newValue: { kind, amount, currency, accountId: account.id, source: "MANUAL" } } });
    return { entry, replayed: false };
  });
}

/** A correction posts an equal and opposite entry on today's date and keeps the original untouched. */
export async function reverseLedgerEntry(user: AuthUser, id: string, reasonInput: unknown) {
  const reason = String(reasonInput ?? "").trim();
  if (reason.length < 5 || reason.length > 500) throw new ApiError("Explain why this entry is being corrected (5–500 characters).", 400);
  return schoolAiTransaction(user, async db => {
    const scope = { id, schoolId: user.schoolId, ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId || "" }) };
    const initial = await db.ledgerEntry.findFirst({ where: scope, select: { campusId: true } });
    if (!initial) throw new ApiError("Ledger entry not found", 404);
    await lockInvoiceGeneration(db, user.schoolId, initial.campusId);
    await assertCurrentAccountsPermission(db, user, "canAdd");
    const original = await db.ledgerEntry.findFirst({ where: scope, include: { reversedBy: true } });
    if (!original) throw new ApiError("Ledger entry not found", 404);
    if (original.reversedBy) return { entry: original.reversedBy, replayed: true };
    if (original.reversalOfId) throw new ApiError("A correction cannot itself be reversed. Record a new entry instead.", 409);
    if (original.paymentId) throw new ApiError("This entry comes from a fee payment. Correct the payment from Fees so the receipt and invoice stay in step.", 409);
    if (original.payrollLineId) throw new ApiError("This entry comes from payroll. Correct it from the payroll run.", 409);
    const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
    if (original.bankAccountId) await assertBankPeriodOpen(db, user.schoolId, original.campusId, original.bankAccountId, today);
    const entry = await db.ledgerEntry.create({ data: { schoolId: original.schoolId, campusId: original.campusId, kind: original.kind, currency: original.currency, amount: -original.amount, accountId: original.accountId, bankAccountId: original.bankAccountId, paymentMethod: original.paymentMethod, date: today, sourceName: `Correction of ${original.sourceName}`.slice(0, 200), note: reason, reversalOfId: original.id, createdById: user.userId } });
    await db.auditLog.create({ data: { schoolId: user.schoolId, userId: user.userId, tableName: "ledger_entries", recordId: original.id, oldValue: { amount: original.amount, currency: original.currency, date: original.date.toISOString().slice(0, 10) }, newValue: { reversedBy: entry.id, reason, correctionDate: today.toISOString().slice(0, 10) } } });
    return { entry, replayed: false };
  });
}
