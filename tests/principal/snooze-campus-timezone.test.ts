import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { localParts, zonedInstant } from "@/lib/meetings/time";

test("SKAI-1467: 08:00 in an Asia/Karachi campus is 03:00Z whatever the device zone", () => {
  assert.equal(zonedInstant("2026-11-03", "08:00", "Asia/Karachi").toISOString(), "2026-11-03T03:00:00.000Z");
  assert.equal(zonedInstant("2026-11-03", "08:00", "America/Los_Angeles").toISOString(), "2026-11-03T16:00:00.000Z");
});

test("SKAI-1467: across a DST change the campus wall clock still maps to 08:00 local", () => {
  const instant = zonedInstant("2026-11-02", "08:00", "America/New_York");
  assert.equal(localParts(instant, "America/New_York").time, "08:00");
});

test("SKAI-1467: the snooze dialog uses the campus timezone and shows it", () => {
  const source = readFileSync("src/components/principal/action-queue.tsx", "utf8");
  const dialog = source.slice(source.indexOf("function SnoozeDialog"));
  assert.match(dialog, /const \{ timezone \} = useLocale\(\);/);
  assert.match(dialog, /zonedInstant\(day, time, timezone\)\.toISOString\(\)/);
  assert.match(dialog, /\$\{ui\("Return on"\)\} \(\$\{timezone\}\)/);
  assert.doesNotMatch(dialog, /getTimezoneOffset|new Date\(until\)/);
});
