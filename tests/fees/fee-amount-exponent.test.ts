import assert from "node:assert/strict";
import { test } from "node:test";
import { rupeesToPaisa, tryRupeesToPaisa } from "../../src/components/fees/fee-utils";

// SKAI-2029: type="number" inputs accept "1e5"; the fee form must not throw while rendering.
test("rupeesToPaisa still rejects exponent notation", () => {
  assert.throws(() => rupeesToPaisa("1e5", "PKR"), /amount/);
});

test("tryRupeesToPaisa returns null instead of throwing for exponent and junk input", () => {
  for (const v of ["1e5", "2e3", "abc", "1,000", ""]) assert.equal(tryRupeesToPaisa(v, "PKR"), null, v);
});

test("tryRupeesToPaisa parses plain decimals", () => {
  assert.equal(tryRupeesToPaisa("5000", "PKR"), 500000);
  assert.equal(tryRupeesToPaisa("5000.5", "PKR"), 500050);
});
