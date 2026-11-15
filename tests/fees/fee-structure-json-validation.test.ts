import test from "node:test";
import assert from "node:assert/strict";
import { feeStructureSchema } from "../../src/lib/validators/schemas";

const base = { classId: "c1", monthlyFee: 1000, activeFrom: "2026-11-13" };
const ok = (extra: object) => feeStructureSchema.safeParse({ ...base, ...extra }).success;

test("SKAI-2028: one-time fees must be whole, non-negative, within int range", () => {
  assert.equal(ok({ oneTimeFeesJson: JSON.stringify({ a: 5000 }) }), true);
  assert.equal(ok({ oneTimeFeesJson: JSON.stringify({ a: -500 }) }), false);
  assert.equal(ok({ oneTimeFeesJson: JSON.stringify({ a: 99999999999 }) }), false);
  assert.equal(ok({ oneTimeFeesJson: JSON.stringify({ a: 1.5 }) }), false);
  assert.equal(ok({ oneTimeFeesJson: JSON.stringify({ a: "5" }) }), false);
  assert.equal(ok({ oneTimeFeesJson: "not json" }), false);
});

test("SKAI-2028: discount percentages must be 0-100", () => {
  assert.equal(ok({ discountRulesJson: JSON.stringify({ Sibling: 50 }) }), true);
  assert.equal(ok({ discountRulesJson: JSON.stringify({ Sibling: -50 }) }), false);
  assert.equal(ok({ discountRulesJson: JSON.stringify({ Sibling: 101 }) }), false);
});
