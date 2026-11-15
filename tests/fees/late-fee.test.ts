import assert from "node:assert/strict";
import { test } from "node:test";
import { daysOverdue, lateFeeAsOf, lateFeeFor, planOverdueBase } from "@/lib/fees/late-fee";

// SKAI-2022: the campus fine rule (with grace days) decides the late fee; the class percentage is only the fallback.
const legacy = { percentage: 2, compound: false };
const percent5Grace10 = { type: "PERCENT", value: 5, graceDays: 10 };

test("inside the rule's grace days no late fee is charged", () => {
  assert.equal(lateFeeFor(1, 300000, percent5Grace10, legacy), 0);
  assert.equal(lateFeeFor(10, 300000, percent5Grace10, legacy), 0);
});

test("past grace the rule percentage applies, not the class percentage", () => {
  assert.equal(lateFeeFor(11, 300000, percent5Grace10, legacy), 15000);
});

test("FLAT and PER_DAY rules", () => {
  assert.equal(lateFeeFor(5, 300000, { type: "FLAT", value: 500, graceDays: 2 }, legacy), 500);
  assert.equal(lateFeeFor(5, 300000, { type: "PER_DAY", value: 100, graceDays: 2 }, legacy), 300);
});

test("without a rule the class percentage applies from day 1", () => {
  assert.equal(lateFeeFor(1, 300000, null, legacy), 6000);
  assert.equal(lateFeeFor(0, 300000, null, legacy), 0);
  assert.equal(lateFeeFor(31, 100000, null, { percentage: 2, compound: true }), 2000 + 2040);
});

test("daysOverdue counts whole days", () => {
  assert.equal(daysOverdue(new Date("2026-12-01T00:00:00Z"), new Date("2026-11-30T00:00:00Z")), 1);
});

test("SKAI-2057: an invoice generated ahead of time does not charge a late fee on a bill that is not yet due", () => {
  const now = new Date("2026-11-15T00:00:00Z");
  const dueDate = new Date("2026-12-31T00:00:00Z");
  const asOf = lateFeeAsOf(new Date("2027-01-01T00:00:00Z"), now);
  assert.equal(asOf.getTime(), now.getTime());
  assert.equal(lateFeeFor(daysOverdue(asOf, dueDate), 600000, null, legacy), 0);
  assert.equal(lateFeeFor(daysOverdue(asOf, dueDate), 600000, percent5Grace10, legacy), 0);
});

test("SKAI-2057: back-dated generation still measures lateness at the invoice date", () => {
  const invoiceDate = new Date("2026-10-01T00:00:00Z");
  assert.equal(lateFeeAsOf(invoiceDate, new Date("2026-11-15T00:00:00Z")).getTime(), invoiceDate.getTime());
});

test("SKAI-2207: an instalment plan with nothing past due has no late-fee base", () => {
  const plan = [{ dueDate: "2027-02-15", remaining: 51000 }, { dueDate: "2027-03-15", remaining: 51000 }];
  assert.equal(planOverdueBase(plan, "2027-02-01"), null);
  const base = planOverdueBase(plan, "2027-02-20");
  assert.equal(base?.balanceDue, 51000);
  assert.equal(base?.dueDate.toISOString().slice(0, 10), "2027-02-15");
});
