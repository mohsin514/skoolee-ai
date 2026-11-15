import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// SKAI-2180: access-plan writes run one at a time and the buttons are disabled while one is in flight.
test("access plan approve, revoke and add-note guard against double submits", () => {
  const source = readFileSync("src/components/accommodations/AccessPlans.tsx", "utf8");
  assert.match(source, /if \(inFlight\.current\) return false; inFlight\.current = true;/);
  assert.match(source, /<Button type="submit" disabled=\{busy \|\| !types\.length\}/);
  assert.match(source, /disabled=\{busy \|\| revokeReason\.trim\(\)\.length < 3\}/);
  assert.match(source, /disabled=\{saving \|\| note\.trim\(\)\.length < 3\}/);
});
