import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { localParts } from "@/lib/meetings/time";

test("SKAI-1479: at 00:30 PKT the Karachi school date is a day ahead of UTC; New York's is behind", () => {
  const instant = new Date("2026-10-31T19:30:00.000Z");
  assert.equal(localParts(instant, "Asia/Karachi").date, "2026-11-01");
  assert.equal(localParts(new Date("2026-11-01T02:00:00.000Z"), "America/New_York").date, "2026-10-31");
});

test("SKAI-1479: the delivery API compares against the plan campus's school date", () => {
  const source = readFileSync("src/lib/school-ai/lesson-plan-service.ts", "utf8");
  const fn = source.slice(source.indexOf("export async function recordLessonDelivery"), source.indexOf("const PublishInput"));
  assert.match(fn, /getLocalePackage\(user\.schoolId, campusId, new Date\(\), null, tx\)/);
  assert.match(fn, /input\.on > localParts\(new Date\(\), timezone\)\.date/);
  assert.doesNotMatch(fn, /toISOString\(\)\.slice\(0, 10\)/);
});

test("SKAI-1479: the date field defaults to and caps at the campus date", () => {
  const source = readFileSync("src/components/school-ai/lesson-plan-actions.tsx", "utf8");
  assert.match(source, /useState\(\(\) => today\(timezone\)\)/);
  assert.match(source, /max=\{today\(timezone\)\}/);
  assert.doesNotMatch(source, /new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
});
