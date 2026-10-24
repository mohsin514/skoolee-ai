import { z } from "zod";
import { CURRENCIES } from "@/lib/locale/package";

const id = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/);
const amount = z.number().int().min(1).max(1_000_000_000);
const signed = z.number().int().min(-1_000_000_000).max(1_000_000_000);
const date = z.string().regex(/^20\d{2}-\d{2}-\d{2}$/).refine(value => { const parsed = new Date(`${value}T00:00:00.000Z`); return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value; }, "Choose a real date.");
const currency = z.enum(CURRENCIES);
const base = { operation: z.literal("finance.apply_operation"), currency, reason: z.string().trim().min(3).max(2000) };
const period = { from: date, to: date };
export const financeOperationProposalSchema = z.discriminatedUnion("action", [
  z.strictObject({ ...base, action: z.literal("PAYMENT"), invoiceId: id, amount, date, method: z.enum(["CASH", "BANK_TRANSFER", "CHEQUE", "CARD", "OTHER"]), bankAccountId: id.nullable().optional(), reference: z.string().trim().min(1).max(160) }),
  z.strictObject({ ...base, action: z.literal("REFUND"), paymentId: id, invoiceAmount: signed.refine(value => value >= 0), creditAmount: signed.refine(value => value >= 0), date, reference: z.string().trim().min(1).max(160) }),
  z.strictObject({ ...base, action: z.literal("CREDIT"), invoiceId: id, amount }),
  z.strictObject({ ...base, action: z.literal("OPENING_BALANCE"), studentId: id, academicYear: z.number().int().min(2001).max(2099), amount: signed.refine(value => value !== 0), sourceReference: z.string().trim().min(3).max(300) }),
  z.strictObject({ ...base, action: z.literal("EXPENSE"), accountId: id, bankAccountId: id.nullable(), amount, date, sourceName: z.string().trim().min(3).max(180), reference: z.string().trim().min(1).max(160) }),
  z.strictObject({ ...base, action: z.literal("RECONCILE"), bankAccountId: id, ...period, openingBalance: signed, closingBalance: signed, rows: z.array(z.strictObject({ reference: z.string().trim().min(1).max(160), date, amount: signed.refine(value => value !== 0), ledgerId: id })).min(1).max(100) }),
  z.strictObject({ ...base, action: z.literal("SCENARIO"), ...period, months: z.number().int().min(1).max(36), feeGrowthBps: z.number().int().min(-10000).max(10000), collectionBps: z.number().int().min(0).max(10000), expenseGrowthBps: z.number().int().min(-10000).max(10000) }),
]).superRefine((value, ctx) => {
  if (value.action === "REFUND" && value.invoiceAmount + value.creditAmount <= 0) ctx.addIssue({ code: "custom", message: "Choose an allocated or unapplied amount to refund." });
  if ("from" in value && (value.to < value.from || new Date(value.to).getTime() - new Date(value.from).getTime() > 366 * 86400000)) ctx.addIssue({ code: "custom", path: ["to"], message: "Choose a period no longer than one year." });
  if (value.action === "RECONCILE") {
    if (new Set(value.rows.map(row => row.reference)).size !== value.rows.length || new Set(value.rows.map(row => row.ledgerId)).size !== value.rows.length) ctx.addIssue({ code: "custom", path: ["rows"], message: "Match each bank reference and ledger entry once." });
    if (value.rows.some(row => row.date < value.from || row.date > value.to)) ctx.addIssue({ code: "custom", path: ["rows"], message: "Every row must be inside the statement period." });
    if (value.openingBalance + value.rows.reduce((sum, row) => sum + row.amount, 0) !== value.closingBalance) ctx.addIssue({ code: "custom", path: ["closingBalance"], message: "Opening balance plus signed statement rows must equal closing balance." });
  }
});
export type FinanceOperationProposal = z.infer<typeof financeOperationProposalSchema>;
export type FinanceAction = FinanceOperationProposal["action"];
export interface FinanceEffect { label: "balance" | "paid" | "total" | "credit" | "cash" | "discount" | "opening" | "closing" | "matched" | "billed" | "income" | "expense" | "projectedIncome" | "projectedExpense" | "projectedNet" | "overdue"; before?: number; after: number; count?: boolean }
export interface FinanceOperationsPreview { operation: "finance.apply_operation"; recordId: string; version: number; campusId: string; action: FinanceAction; currency: string; target: string; reason: string; effects: FinanceEffect[]; evidence: Array<{ id: string; label: string }>; previewHash: string; proposal: FinanceOperationProposal; separateApprover: boolean }
export interface FinanceOperationsResult { action: FinanceAction; currency: string; target: string; effects: FinanceEffect[]; evidence: Array<{ id: string; label: string }>; createdIds: string[] }
export interface FinanceOperationsExecutionReceipt extends FinanceOperationsResult { id: string; operation: "finance.apply_operation"; recordId: string; version: number; status: "COMPLETED"; completedAt: string }
export interface FinanceOperationsOptions { campusId: string; invoices: Array<{ id: string; label: string; currency: string; balance: number }>; payments: Array<{ id: string; label: string; currency: string }>; students: Array<{ id: string; label: string }>; accounts: Array<{ id: string; label: string }>; banks: Array<{ id: string; label: string; currency: string }>; ledger: Array<{ id: string; label: string; date: string; amount: number; bankAccountId: string; currency: string }>; academicYears: number[]; truncated: boolean }

/** Decimal rates are represented as basis points; BigInt prevents intermediate money overflow. */
export function projectRevenue(billed: number, expenses: number, days: number, proposal: Pick<Extract<FinanceOperationProposal, { action: "SCENARIO" }>, "months" | "feeGrowthBps" | "collectionBps" | "expenseGrowthBps">) {
  for (const value of [billed, expenses, days]) if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid scenario evidence");
  if (days < 1) throw new Error("Invalid scenario period");
  const round = (value: bigint, divisor: bigint) => { const result = Number((value + divisor / BigInt(2)) / divisor); if (!Number.isSafeInteger(result)) throw new Error("Scenario exceeds supported amount"); return result; };
  const projectedIncome = round(BigInt(billed) * BigInt(proposal.months) * BigInt(365) * BigInt(10000 + proposal.feeGrowthBps) * BigInt(proposal.collectionBps), BigInt(days) * BigInt(12) * BigInt(10000) * BigInt(10000));
  const projectedExpense = round(BigInt(expenses) * BigInt(proposal.months) * BigInt(365) * BigInt(10000 + proposal.expenseGrowthBps), BigInt(days) * BigInt(12) * BigInt(10000));
  return { projectedIncome, projectedExpense, projectedNet: projectedIncome - projectedExpense };
}
