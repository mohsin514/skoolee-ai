import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateInvoiceAmounts, feeInvoiceProposalSchema, invoiceMonthDates, MAX_INVOICE_MINOR, type InvoiceDiscount } from "../../src/lib/school-ai/fee-invoices";
import { invoiceEnrollmentContext } from "../../src/lib/fees/invoice-context";
import { feeInvoiceCopy } from "../../src/components/school-ai/fee-invoice-copy";

const line = (amount: number, code = "MONTHLY_TUITION") => ({ id: code, name: code, code, amount, dueDate: null });
const discount = (value: number, type: "PERCENT" | "FLAT" = "FLAT", currency = "PKR"): InvoiceDiscount => ({ id: `${type}-${value}`, name: "Configured discount", code: "D", value, type, currency, source: "EXPLICIT" });
const proposal = { operation: "fees.generate_invoices", classId: "class", academicYear: 2026, feeGroupId: "fees", feeLineIds: ["tuition"], studentIds: ["learner"], billingMonth: "2026-10", dueDate: "2026-10-31" };

test("invoice proposals require explicit unique bounded selections and an actual date in the billing month", () => {
  assert(feeInvoiceProposalSchema.safeParse(proposal).success);
  for (const patch of [{ dueDate: "2026-11-01" }, { dueDate: "2026-10-32" }, { billingMonth: "2026-13" }, { studentIds: [] }, { studentIds: ["s", "s"] }, { feeLineIds: ["f", "f"] }, { studentIds: Array.from({ length: 51 }, (_, i) => `s${i}`) }, { feeLineIds: Array.from({ length: 31 }, (_, i) => `f${i}`) }, { arbitraryAmount: 999 }]) assert(!feeInvoiceProposalSchema.safeParse({ ...proposal, ...patch }).success);
});
test("fee math preserves minor units, flat-then-percent ordering, caps and reconciliation", () => {
  assert.deepEqual(calculateInvoiceAmounts([line(10001), line(999, "BOOKS")], [discount(1000), discount(15, "PERCENT")], "PKR"), { monthlyFee: 10001, oneTimeFees: 999, subtotal: 11000, discountAmount: 2500, totalAmount: 8500 });
  assert.deepEqual(calculateInvoiceAmounts([line(101)], [discount(50, "PERCENT")], "JPY"), { monthlyFee: 101, oneTimeFees: 0, subtotal: 101, discountAmount: 51, totalAmount: 50 });
  assert.equal(calculateInvoiceAmounts([line(12345)], [], "KWD").totalAmount, 12345);
  assert.equal(calculateInvoiceAmounts([line(100)], [discount(80), discount(90)], "PKR").discountAmount, 100);
  assert.equal(calculateInvoiceAmounts([line(100)], [discount(60, "PERCENT"), discount(50, "PERCENT")], "PKR").totalAmount, 0);
});
test("bad amounts, invalid percentages, overflow and cross-currency flats fail closed", () => {
  for (const amount of [-1, 0.5, NaN, Infinity, MAX_INVOICE_MINOR + 1]) assert.throws(() => calculateInvoiceAmounts([line(amount)], [], "PKR"), /FEE_INVALID_AMOUNT/);
  assert.throws(() => calculateInvoiceAmounts([line(MAX_INVOICE_MINOR), line(1, "BOOKS")], [], "PKR"), /FEE_INVALID_AMOUNT/);
  for (const value of [-1, 101, 1.5]) assert.throws(() => calculateInvoiceAmounts([line(100)], [discount(value, "PERCENT")], "PKR"), /FEE_INVALID_AMOUNT/);
  assert.throws(() => calculateInvoiceAmounts([line(100)], [discount(10, "FLAT", "USD")], "PKR"), /FEE_CURRENCY_CONFLICT/);
  assert.equal(calculateInvoiceAmounts([line(100)], [discount(10, "PERCENT", "USD")], "PKR").totalAmount, 90);
});
test("month bounds use UTC and include leap-year February and the year transition", () => {
  assert.deepEqual(Object.values(invoiceMonthDates("2028-02")).map(value => value.toISOString()), ["2028-02-01T00:00:00.000Z", "2028-03-01T00:00:00.000Z"]);
  assert.equal(invoiceMonthDates("2026-12").end.toISOString(), "2027-01-01T00:00:00.000Z");
  assert.throws(() => invoiceMonthDates("2026-00"));
});
test("invoice dates honor month, admission and cycle starts without guessing ambiguous or ended placements", () => {
  const start = new Date("2026-10-01Z"), due = new Date("2026-10-31Z"), period = { id: "enrollment", startDate: new Date("2026-10-13Z"), endDate: null };
  assert.deepEqual(invoiceEnrollmentContext([period], start, due), { enrollmentId: "enrollment", invoiceDate: "2026-10-13" });
  assert.equal(invoiceEnrollmentContext([period], start, due, new Date("2026-10-15Z"))?.invoiceDate, "2026-10-15");
  assert.equal(invoiceEnrollmentContext([period], start, new Date("2026-10-12Z")), null);
  assert.equal(invoiceEnrollmentContext([{ ...period, endDate: due }], start, due), null);
  assert.equal(invoiceEnrollmentContext([period, { ...period, id: "duplicate" }], start, due), null);
  assert.equal(invoiceEnrollmentContext([], start, due), null);
});
test("fee review copy covers every language and newly explicit enrollment dates", () => {
  const english = feeInvoiceCopy("en");
  for (const language of ["ar", "ur"] as const) { const translated = feeInvoiceCopy(language); assert.deepEqual(Object.keys(translated).sort(), Object.keys(english).sort()); assert.notEqual(translated.FEE_ENROLLMENT_REVIEW, english.FEE_ENROLLMENT_REVIEW); assert.notEqual(translated.invoiceDate, english.invoiceDate); }
});
