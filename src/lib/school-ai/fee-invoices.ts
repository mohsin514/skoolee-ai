import { z } from "zod";
import { dateOnly, minorUnits, type LocalePackage } from "@/lib/locale/package";
import { resolveStudentFees, type FeeDiscountInput } from "@/lib/fees/compute";

const id = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/);
const unique = (items: string[]) => new Set(items).size === items.length;
const date = z.string().refine(value => { try { return dateOnly(value) === value; } catch { return false; } }, "Choose a valid calendar date.");
export const feeInvoiceProposalSchema = z.strictObject({
  operation: z.literal("fees.generate_invoices"), classId: id,
  academicYear: z.number().int().min(2000).max(2100), feeGroupId: id,
  feeLineIds: z.array(id).min(1).max(30).refine(unique), studentIds: z.array(id).min(1).max(50).refine(unique),
  billingMonth: z.string().regex(/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/), dueDate: date,
  applyCarryForward: z.boolean().optional(),
}).superRefine((value, ctx) => {
  if (value.dueDate.slice(0, 7) !== value.billingMonth) ctx.addIssue({ code: "custom", path: ["dueDate"], message: "Choose a due date within the selected billing month." });
});
export type FeeInvoiceProposal = z.infer<typeof feeInvoiceProposalSchema>;
export const MAX_INVOICE_MINOR = 2147483647;
export type InvoiceFeeLine = { id: string; name: string; code: string; amount: number; dueDate: string | null };
export type InvoiceDiscount = FeeDiscountInput & { currency: string };
export type FeeInvoiceAmounts = { monthlyFee: number; oneTimeFees: number; subtotal: number; discountAmount: number; totalAmount: number };
/** Reuse the fee domain's flat-then-percent math with bounded integer inputs. */
export function calculateInvoiceAmounts(lines: InvoiceFeeLine[], discounts: InvoiceDiscount[], currency: string): FeeInvoiceAmounts {
  minorUnits(currency);
  const integer = (value: number) => Number.isSafeInteger(value) && value >= 0 && value <= MAX_INVOICE_MINOR;
  if (!lines.length || lines.length > 30 || lines.some(line => !integer(line.amount))) throw new Error("FEE_INVALID_AMOUNT");
  if (discounts.some(discount => !integer(discount.value) || !["PERCENT", "FLAT"].includes(discount.type) || discount.type === "PERCENT" && discount.value > 100)) throw new Error("FEE_INVALID_AMOUNT");
  if (discounts.some(discount => discount.type === "FLAT" && discount.currency !== currency)) throw new Error("FEE_CURRENCY_CONFLICT");
  const subtotal = Number(lines.reduce((sum, line) => sum + BigInt(line.amount), BigInt(0)));
  if (!integer(subtotal)) throw new Error("FEE_INVALID_AMOUNT");
  const resolved = resolveStudentFees(lines.map(line => ({ id: line.id, typeName: line.name, typeCode: line.code, amount: line.amount, dueDate: line.dueDate ? new Date(`${line.dueDate}T00:00:00.000Z`) : null })), discounts, 0);
  // The old resolver floors payable after stacking flat discounts. Store the
  // actual discount against this invoice so subtotal-discount always reconciles.
  const discountAmount = subtotal - resolved.payable;
  const monthlyFee = lines.filter(line => line.code === "MONTHLY_TUITION").reduce((sum, line) => sum + line.amount, 0);
  return { monthlyFee, oneTimeFees: subtotal - monthlyFee, subtotal, discountAmount, totalAmount: resolved.payable };
}
export function invoiceMonthDates(month: string) {
  if (!/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(month)) throw new Error("FEE_INVALID_MONTH");
  const [year, number] = month.split("-").map(Number);
  return { start: new Date(Date.UTC(year, number - 1, 1)), end: new Date(Date.UTC(year, number, 1)) };
}
export type FeeInvoiceExclusion = "FEE_STUDENT_UNAVAILABLE" | "FEE_ENROLLMENT_REVIEW" | "FEE_ALREADY_INVOICED" | "FEE_CARRY_FORWARD_REVIEW" | "FEE_CURRENCY_CONFLICT" | "FEE_INVALID_AMOUNT" | "FEE_ZERO_BALANCE";
export interface FeeInvoiceStudent extends FeeInvoiceAmounts {
  studentId: string; name: string; rollNo: string; disposition: "CREATE" | "EXCLUDED";
  invoiceDate?: string; enrollmentId?: string;
  reason?: FeeInvoiceExclusion; existingInvoiceIds: string[]; discounts: InvoiceDiscount[];
  carryId?: string; carryBefore?: number; carryForwardAmount?: number; carryRemaining?: number;
}

/** Carry is a separate signed balance, never a new payment or a fee discount. */
export function applyInvoiceCarry(amounts: FeeInvoiceAmounts, balance: number) {
  if (!Number.isSafeInteger(balance) || balance < -MAX_INVOICE_MINOR || balance > MAX_INVOICE_MINOR) throw new Error("FEE_INVALID_AMOUNT");
  const carryForwardAmount = balance < 0 ? Math.max(-amounts.totalAmount, balance) : balance;
  const totalAmount = amounts.totalAmount + carryForwardAmount;
  if (totalAmount < 0 || totalAmount > MAX_INVOICE_MINOR) throw new Error("FEE_INVALID_AMOUNT");
  return { ...amounts, totalAmount, carryBefore: balance, carryForwardAmount, carryRemaining: balance - carryForwardAmount };
}
export interface FeeInvoicePreview {
  operation: "fees.generate_invoices"; recordId: string; version: number; campusId: string;
  classId: string; className: string; academicYear: number; feeGroupId: string; feeGroupName: string;
  billingMonth: string; invoiceDate: string; dueDate: string; currency: string; localeSnapshot: LocalePackage;
  lines: InvoiceFeeLine[]; students: FeeInvoiceStudent[]; createdCount: number; skippedCount: number; totalAmount: number;
  blockers: Array<"FEE_EMPTY_BATCH">; previewHash: string;
}
export interface FeeInvoiceResult {
  invoiceIds: string[]; createdCount: number; skippedCount: number; currency: string; totalAmount: number;
  billingMonth: string; dueDate: string; lines: InvoiceFeeLine[];
  students: Array<FeeInvoiceStudent & { invoiceId?: string; invoiceNumber?: string }>;
}
export interface FeeInvoiceExecutionReceipt extends FeeInvoiceResult {
  id: string; operation: "fees.generate_invoices"; recordId: string; version: number; status: "COMPLETED"; completedAt: string;
}
export interface FeeInvoiceOptions {
  campusId: string; classes: Array<{ id: string; name: string; academicYear: number }>;
  students: Array<{ id: string; name: string; rollNo: string }>;
  groups: Array<{ id: string; name: string; currency: string; academicYear: number; lines: InvoiceFeeLine[] }>;
}
