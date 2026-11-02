import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { creditOutlook } from "../../src/lib/whatsapp/managed";

// SKAI-988 (INT-WA-04): managed credit is a hard budget; the owner is warned before it runs out.
test("SKAI-988: days left follow the last 30 days' pace", () => {
  assert.deepEqual(creditOutlook(30_000_000, 30_000_000), { daysLeft: 30, lowCredit: false });
  assert.deepEqual(creditOutlook(5_000_000, 30_000_000), { daysLeft: 5, lowCredit: true });
});

test("SKAI-988: under USD 2 is low even with no recent spend; an empty balance is the used-up state, not 'low'", () => {
  assert.deepEqual(creditOutlook(1_500_000, 0), { daysLeft: null, lowCredit: true });
  assert.deepEqual(creditOutlook(10_000_000, 0), { daysLeft: null, lowCredit: false });
  assert.equal(creditOutlook(0, 30_000_000).lowCredit, false);
});

test("SKAI-988: the panel warns in EN, AR and UR", () => {
  assert.match(readFileSync("src/components/whatsapp/managed-sending-panel.tsx", "utf8"), /!empty && data\.lowCredit \? <Alert tone="warning"/);
  const catalogue = readFileSync("src/lib/locale/whatsapp-ui-messages.ts", "utf8");
  assert.match(catalogue, /\["Credit is running low: about \{0\} days left[^\]]+\{0\}[^\]]+\{0\}[^\]]+\]/);
});
