import assert from "node:assert/strict";
import { test } from "node:test";
import { wallTimeInstants } from "../../src/lib/locale/events";
test("future timetable preview preserves wall date and exposes DST gaps and overlaps", () => {
 assert.deepEqual(wallTimeInstants("2027-04-01", "09:00", "Asia/Karachi"), ["2027-04-01T04:00:00.000Z"]);
 assert.deepEqual(wallTimeInstants("2027-04-01", "09:00", "Asia/Dubai"), ["2027-04-01T05:00:00.000Z"]);
 assert.deepEqual(wallTimeInstants("2026-03-08", "02:30", "America/New_York"), []);
 assert.deepEqual(wallTimeInstants("2026-11-01", "01:30", "America/New_York"), ["2026-11-01T05:30:00.000Z", "2026-11-01T06:30:00.000Z"]);
 assert.deepEqual(wallTimeInstants("2026-03-29", "01:30", "Europe/London"), []);
 assert.equal(wallTimeInstants("2026-10-25", "01:30", "Europe/London").length, 2);
});
