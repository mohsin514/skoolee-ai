import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { localParts } from "@/lib/meetings/time";

test("SKAI-1472: just after Karachi midnight the campus date is ahead of Los Angeles", () => {
  const instant = new Date("2026-11-02T19:30:00.000Z");
  assert.equal(localParts(instant, "Asia/Karachi").date, "2026-11-03");
  assert.equal(localParts(instant, "America/Los_Angeles").date, "2026-11-02");
});

test("SKAI-1472: cover follow-up defaults to the campus date, not the device offset", () => {
  const source = readFileSync("src/components/cover/cover-follow-up.tsx", "utf8");
  assert.match(source, /const todayText = \(timezone: string\) => localParts\(new Date\(\), timezone\)\.date;/);
  assert.match(source, /const \{ timezone \} = useLocale\(\);\s*const \[day, setDay\] = useState\(\(\) => todayText\(timezone\)\)/);
  assert.doesNotMatch(source, /getTimezoneOffset/);
});
