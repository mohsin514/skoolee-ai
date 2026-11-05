import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { todayIso } from "../../src/components/academic/AcademicCalendar";

// SKAI-1701: the calendar opens on the campus year/month, not the device's.
test("device on Dec 31 while a Karachi campus is already on Jan 1 opens the new year", () => {
  const prev = process.env.TZ;
  process.env.TZ = "America/Los_Angeles";
  try {
    const instant = new Date("2026-12-31T20:30:00.000Z"); // LA: Dec 31 12:30, Karachi: Jan 1 01:30
    assert.equal(new Date(instant).getFullYear(), 2026);
    assert.equal(todayIso("Asia/Karachi", instant), "2027-01-01");
  } finally { process.env.TZ = prev; }
});

test("inverse boundary: device already on Jan 1 while a Los Angeles campus is still on Dec 31", () => {
  const prev = process.env.TZ;
  process.env.TZ = "Asia/Karachi";
  try {
    const instant = new Date("2027-01-01T03:00:00.000Z"); // Karachi: Jan 1 08:00, LA: Dec 31 19:00
    assert.equal(todayIso("America/Los_Angeles", instant), "2026-12-31");
  } finally { process.env.TZ = prev; }
});

test("the calendar seeds its year, month, Today button and highlights from the campus date", () => {
  const ui = readFileSync("src/components/academic/AcademicCalendar.tsx", "utf8");
  assert.match(ui, /const campusToday = todayIso\(locale\.timezone\);/);
  assert.match(ui, /useState\(todayYear\)/);
  assert.match(ui, /useState\(todayMonth\)/);
  assert.match(ui, /setViewYear\(todayYear\); setViewMonth\(todayMonth\);/);
  assert.doesNotMatch(ui, /todayIso\(\)/);
  assert.doesNotMatch(ui, /const now = new Date\(\);\n\s*const \[viewYear/);
});
