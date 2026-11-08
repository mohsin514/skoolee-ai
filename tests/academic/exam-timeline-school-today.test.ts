import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { daysFromToday } from "../../src/lib/academic/exam-pipeline";

// SKAI-1775: relative exam-day labels use the school's calendar day, not device-local midnight.
test("a Karachi school's paper dated today is today, whatever the device timezone", () => {
  const prev = process.env.TZ;
  process.env.TZ = "America/Los_Angeles";
  try {
    assert.equal(daysFromToday("2026-11-01", "Asia/Karachi", new Date("2026-11-01T10:00:00.000Z")), 0);
    assert.equal(daysFromToday("2026-11-02", "Asia/Karachi", new Date("2026-11-01T10:00:00.000Z")), 1);
    assert.equal(daysFromToday("2026-10-31", "Asia/Karachi", new Date("2026-11-01T10:00:00.000Z")), -1);
  } finally { process.env.TZ = prev; }
});

test("the school's midnight is the boundary (Karachi is UTC+5)", () => {
  assert.equal(daysFromToday("2026-11-01", "Asia/Karachi", new Date("2026-10-31T18:59:00.000Z")), 1);
  assert.equal(daysFromToday("2026-11-01", "Asia/Karachi", new Date("2026-10-31T19:00:00.000Z")), 0);
  assert.equal(daysFromToday("2026-11-01T00:00:00.000Z", "America/Los_Angeles", new Date("2026-11-01T06:00:00.000Z")), 1);
});

test("the timeline passes the school timezone from the locale package", () => {
  const ui = readFileSync("src/components/academic/ExamTimelineView.tsx", "utf8");
  assert.match(ui, /const \{ language, timezone \} = useLocale\(\);/);
  assert.match(ui, /relativeLabel\(date, ui, timezone\)/);
  assert.match(ui, /daysFromToday\(date, timeZone\)/);
});
