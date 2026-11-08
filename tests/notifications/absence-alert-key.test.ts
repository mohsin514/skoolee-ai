import assert from "node:assert/strict";
import { test } from "node:test";
import { absenceAlertKey } from "../../src/lib/notifications/automation";

const day = new Date("2026-11-02T08:00:00Z");

test("SKAI-823: a first absence gets its own same-day alert key", () => {
  assert.equal(absenceAlertKey("s1", day, 1), "attendance-absence-day:s1:2026-11-02");
  assert.equal(absenceAlertKey("s1", day, 2), "attendance-absence-day:s1:2026-11-02");
});

test("SKAI-823: three or more absences keep the original key, so earlier sends are not repeated", () => {
  assert.equal(absenceAlertKey("s1", day, 3), "attendance-absence-3:s1:2026-11-02");
  assert.equal(absenceAlertKey("s1", day, 7), "attendance-absence-3:s1:2026-11-02");
});

test("SKAI-823: keys differ per student and per day", () => {
  assert.notEqual(absenceAlertKey("s1", day, 1), absenceAlertKey("s2", day, 1));
  assert.notEqual(absenceAlertKey("s1", day, 1), absenceAlertKey("s1", new Date("2026-11-03T08:00:00Z"), 1));
});
