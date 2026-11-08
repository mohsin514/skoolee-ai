import assert from "node:assert/strict";
import test from "node:test";
import { EXPANSION_OBSERVATIONS, EXPANSION_TRIGGERS } from "../../src/lib/expansion/trigger-config";
import { conditionMet, evaluateExpansionTriggers } from "../../src/lib/expansion/triggers";

const byMarket = (values: Record<string, number | boolean>) => Object.fromEntries(evaluateExpansionTriggers(values).map(t => [t.market, t]));

test("config covers the four SKAI-1006 markets with unique condition ids", () => {
  assert.deepEqual(EXPANSION_TRIGGERS.map(t => t.market), ["Rest of UAE", "Qatar, Oman, Kuwait, Bahrain", "UK supplementary", "Egypt, Bangladesh, Malaysia"]);
  const ids = EXPANSION_TRIGGERS.flatMap(t => t.conditions.map(c => c.id));
  assert.equal(new Set(ids).size, ids.length);
});

test("fails closed: with no recorded values nothing is met", () => {
  const all = evaluateExpansionTriggers({});
  assert.ok(all.every(t => !t.met && t.conditions.every(c => c.value === null && !c.met)));
  assert.ok(evaluateExpansionTriggers().every(t => !t.met), "shipped observations reopen no market");
  assert.match(EXPANSION_OBSERVATIONS.asOf, /^\d{4}-\d{2}-\d{2}$/);
});

test("count thresholds are inclusive and booleans need exactly true", () => {
  const paying = EXPANSION_TRIGGERS[0].conditions[1];
  assert.equal(conditionMet(paying, 4), false);
  assert.equal(conditionMet(paying, 5), true);
  assert.equal(conditionMet(paying, Number.NaN), false);
  assert.equal(conditionMet(EXPANSION_TRIGGERS[0].conditions[0], 1), false);
});

test("all-of markets need every condition; UK is any-of", () => {
  assert.equal(byMarket({ "uae-dubai-go": true, "uae-dubai-paying": 4 })["Rest of UAE"].met, false);
  assert.equal(byMarket({ "uae-dubai-go": true, "uae-dubai-paying": 5 })["Rest of UAE"].met, true);
  assert.equal(byMarket({ "ksa-community-go": true, "gcc-inbound": 3 })["Qatar, Oman, Kuwait, Bahrain"].met, false, "data-law review still open");
  assert.equal(byMarket({ "uk-gcse-pack": true })["UK supplementary"].met, true);
  assert.equal(byMarket({ "uk-demand": 9 })["UK supplementary"].met, false);
});
