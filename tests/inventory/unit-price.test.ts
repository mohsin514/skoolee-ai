import assert from "node:assert/strict";
import { test } from "node:test";
import { parseUnitPrice } from "@/lib/inventory/unit-price";

test("inventory unit prices stay inside the persisted Int32 range", () => {
  assert.equal(parseUnitPrice(undefined), null);
  assert.equal(parseUnitPrice(null), null);
  assert.equal(parseUnitPrice(0), 0);
  assert.equal(parseUnitPrice(2_147_483_647), 2_147_483_647);
  for (const bad of ["abc", "5", 1.5, -1, 2_147_483_648, Number.NaN]) {
    assert.throws(() => parseUnitPrice(bad), { message: /supported range/ }, String(bad));
  }
});
