import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFineRuleForm } from "../../src/lib/fees/fine-rule-form";

test("SKAI-2025: decimal percent is rejected, not rounded", () => {
  assert.deepEqual(parseFineRuleForm("PERCENT", "7.6", "0"), { ok: false, error: "Percent must be a whole number" });
  assert.equal(parseFineRuleForm("PERCENT", "2.5", "0").ok, false);
});
test("SKAI-2025: negative or fractional grace is rejected, not coerced to 0", () => {
  assert.deepEqual(parseFineRuleForm("PERCENT", "8", "-2"), { ok: false, error: "Grace days cannot be negative" });
  assert.equal(parseFineRuleForm("FLAT", "200", "1.5").ok, false);
});
test("SKAI-2025: valid inputs convert correctly", () => {
  assert.deepEqual(parseFineRuleForm("PERCENT", "8", ""), { ok: true, value: 8, graceDays: 0 });
  assert.deepEqual(parseFineRuleForm("FLAT", "200.5", "3"), { ok: true, value: 20050, graceDays: 3 });
  assert.equal(parseFineRuleForm("PERCENT", "101", "0").ok, false);
});
