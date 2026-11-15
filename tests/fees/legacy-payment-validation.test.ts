import assert from "node:assert/strict";
import { test } from "node:test";
import { LEGACY_PAYMENT_METHOD_STORED, paymentSchema } from "../../src/lib/validators/schemas";

// SKAI-2070: POST /api/fees/payment applies the Collect desk date rule and stores the Collect desk method vocabulary.
const parse = (paymentDate: string, paymentMethod = "cash") => paymentSchema.safeParse({ invoiceId: "inv", amount: 100, paymentDate, paymentMethod });

test("impossible or malformed payment dates are refused", () => {
  for (const d of ["2026-02-30", "2026-04-31", "not-a-date", "31/12/2026", "2026-13-01"]) assert.equal(parse(d).success, false, d);
});

test("a real calendar day is accepted", () => {
  assert.equal(parse("2026-02-28").success, true);
  assert.equal(parse("2028-02-29").success, true);
});

test("legacy methods are stored in the Collect desk vocabulary", () => {
  assert.equal(LEGACY_PAYMENT_METHOD_STORED.cash, "CASH");
  assert.equal(LEGACY_PAYMENT_METHOD_STORED.bank_transfer, "BANK");
});
