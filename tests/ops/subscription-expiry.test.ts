import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// SKAI-750: the expiry sweep never suspends a school that renewed after the scan, and audits its real old status.
test("suspension is conditional on the scanned end date and status", () => {
  const route = readFileSync("src/app/api/cron/subscription-expiry/route.ts", "utf8");
  assert.match(route, /updateMany\(\{\s*where: \{ id: school\.id, planEndsAt: end, status: school\.status, stripeSubscriptionId: null \}/);
  assert.match(route, /if \(result\.count === 0\) return false;/);
  assert.match(route, /if \(!changed\) continue;/);
  assert.ok(route.indexOf("if (!changed) continue;") < route.indexOf('notify("SUBSCRIPTION_SUSPENDED"'), "no suspension notice for a renewed school");
  assert.match(route, /oldValue: \{ status: school\.status,/);
  assert.doesNotMatch(route, /prisma\.school\.update\(\{ where: \{ id: school\.id \}/);
});
