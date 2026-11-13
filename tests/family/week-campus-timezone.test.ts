import { test } from "node:test";
import { strict as assert } from "node:assert";
import { campusInstant, campusMondayOf } from "../../src/lib/family/week";

// SKAI-1405: week and schedule follow the campus timezone, not the staff device.
for (const zone of ["Asia/Karachi", "America/Los_Angeles", "UTC"]) {
  test(`SKAI-1405: 09:00 on the Karachi clock is 04:00Z whatever the device zone (${zone})`, () => {
    process.env.TZ = zone;
    assert.equal(campusInstant("2026-11-16T09:00", "Asia/Karachi"), "2026-11-16T04:00:00.000Z");
  });
  test(`SKAI-1405: Monday 01:00 Karachi (Sunday 20:00Z) is the new week on a ${zone} device`, () => {
    process.env.TZ = zone;
    assert.equal(campusMondayOf(new Date("2026-11-15T20:00:00Z"), "Asia/Karachi"), "2026-11-16");
  });
}

test("SKAI-1405: Sunday 23:30 Karachi still belongs to the week that started on Monday", () => {
  assert.equal(campusMondayOf(new Date("2026-11-15T18:30:00Z"), "Asia/Karachi"), "2026-11-09");
});

test("SKAI-1405: daylight-saving campus resolves to the instant its clock shows", () => {
  assert.equal(campusInstant("2026-07-01T09:00", "America/New_York"), "2026-07-01T13:00:00.000Z");
  assert.equal(campusInstant("2026-12-01T09:00", "America/New_York"), "2026-12-01T14:00:00.000Z");
});

test("SKAI-1405: empty or malformed schedule input is rejected", () => {
  assert.equal(campusInstant("", "Asia/Karachi"), null);
  assert.equal(campusInstant("tomorrow", "Asia/Karachi"), null);
});
