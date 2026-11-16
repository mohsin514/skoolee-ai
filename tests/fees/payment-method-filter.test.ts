import assert from "node:assert/strict";
import { test } from "node:test";
import { paymentMethodValues } from "../../src/lib/fees/payment-method-filter";

// SKAI-2044: lowercase filter values must match CASH / BANK / BANK_TRANSFER rows.
test("cash matches stored CASH and legacy cash", () => {
  assert.deepEqual(paymentMethodValues("cash").sort(), ["CASH", "cash"]);
  assert.deepEqual(paymentMethodValues("CASH").sort(), ["CASH", "cash"]);
});

test("bank_transfer and BANK cover both bank spellings", () => {
  const expected = ["BANK", "BANK_TRANSFER", "bank", "bank_transfer"];
  assert.deepEqual(paymentMethodValues("bank_transfer").sort(), expected);
  assert.deepEqual(paymentMethodValues("BANK").sort(), expected);
});

test("mobile_wallet, cheque, card normalise; empty gives no values", () => {
  assert.ok(paymentMethodValues("mobile_wallet").includes("MOBILE_WALLET"));
  assert.ok(paymentMethodValues("cheque").includes("CHEQUE"));
  assert.ok(paymentMethodValues("card").includes("CARD"));
  assert.deepEqual(paymentMethodValues("  "), []);
});
