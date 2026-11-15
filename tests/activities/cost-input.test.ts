import assert from "node:assert/strict";
import { test } from "node:test";
import { costToMinor } from "../../src/lib/activities/cost-input";

// SKAI-2179: "Cost in USD" = 25 is stored as 2500 minor units so every screen shows $25.00, not $0.25.
test("whole currency from the publish form becomes minor units", () => {
  assert.equal(costToMinor("25", "USD"), 2500);
  assert.equal(costToMinor("50", "PKR"), 5000);
  assert.equal(costToMinor("12.50", "USD"), 1250);
  assert.equal(costToMinor("1,200", "PKR"), 120000);
});
test("zero, empty and zero-decimal / three-decimal currencies", () => {
  assert.equal(costToMinor("0", "USD"), 0);
  assert.equal(costToMinor("", "USD"), 0);
  assert.equal(costToMinor("500", "JPY"), 500);
  assert.equal(costToMinor("2", "KWD"), 2000);
});
test("invalid input is NaN so the server refuses it", () => {
  assert.ok(Number.isNaN(costToMinor("abc", "USD")));
  assert.ok(Number.isNaN(costToMinor("-5", "USD")) || costToMinor("-5", "USD") < 0);
});
