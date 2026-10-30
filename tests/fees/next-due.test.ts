import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nextDueInvoice } from "@/lib/fees/next-due";

// SKAI-1292: the student fee summary's nextDue must include PARTIAL installment balances.
const inv = (id: string, status: string, dueDate: string, balanceDue: number) => ({ id, status, dueDate: new Date(dueDate), balanceDue });

describe("nextDueInvoice", () => {
  it("returns the earliest PARTIAL invoice when every outstanding invoice is PARTIAL (the reported case)", () => {
    // Loaded newest first, as the route's invoiceDate desc query does.
    const invoices = [inv("nov", "PARTIAL", "2026-11-30", 2000), inv("oct", "PARTIAL", "2026-10-31", 3900)];
    assert.equal(nextDueInvoice(invoices)?.id, "oct");
  });
  it("picks the earliest due across PENDING, PARTIAL and OVERDUE", () => {
    const invoices = [inv("p", "PENDING", "2026-12-31", 5000), inv("o", "OVERDUE", "2026-09-30", 100), inv("pa", "PARTIAL", "2026-10-31", 50)];
    assert.equal(nextDueInvoice(invoices)?.id, "o");
  });
  it("skips paid, cancelled and zero-balance invoices", () => {
    const invoices = [inv("paid", "PAID", "2026-01-31", 0), inv("void", "CANCELLED", "2026-02-28", 900), inv("zero", "PARTIAL", "2026-03-31", 0)];
    assert.equal(nextDueInvoice(invoices), null);
  });
  it("returns null when nothing is outstanding", () => {
    assert.equal(nextDueInvoice([]), null);
  });
});
