import assert from "node:assert/strict";
import { test } from "node:test";
import { parseOpeningBalance } from "@/lib/accounts/bank-account-command";

test("bank opening balances stay inside the persisted Int32 range", () => {
  assert.equal(parseOpeningBalance(0), 0);
  assert.equal(parseOpeningBalance("2147483647"), 2_147_483_647);
  assert.equal(parseOpeningBalance(-2_147_483_647), -2_147_483_647);
  assert.throws(() => parseOpeningBalance(2_147_483_648), { message: /supported range/ });
  assert.throws(() => parseOpeningBalance(-2_147_483_648), { message: /supported range/ });
  assert.throws(() => parseOpeningBalance(1.5), { message: /whole number/ });
  assert.throws(() => parseOpeningBalance("abc"), { message: /whole number/ });
});
