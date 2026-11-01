import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { calendarDateIn } from "@/lib/datetime";

// SKAI-1426: the pickup Day defaults to today on the child's campus calendar, not the guardian device's.
// Device zone is set per test through process.env.TZ, so the result must not depend on it.
describe("pickup default Day uses the campus calendar", () => {
  const instant = new Date("2026-11-01T01:30:00Z");
  const originalTz = process.env.TZ;
  const withDevice = (tz: string, fn: () => void) => { process.env.TZ = tz; try { fn(); } finally { process.env.TZ = originalTz; } };

  test("LA device at 2026-11-01T01:30Z still defaults to the Karachi date", () => {
    withDevice("America/Los_Angeles", () => {
      assert.equal(calendarDateIn("Asia/Karachi", instant), "2026-11-01");
    });
  });

  test("the same instant gives the same campus day on every device zone", () => {
    for (const device of ["America/Los_Angeles", "Pacific/Kiritimati", "Asia/Karachi", "UTC"]) {
      withDevice(device, () => assert.equal(calendarDateIn("Asia/Karachi", instant), "2026-11-01"));
    }
  });

  test("campus midnight boundary: Karachi turns to 2026-11-01 at 19:00Z on 31 October", () => {
    assert.equal(calendarDateIn("Asia/Karachi", new Date("2026-10-31T18:59:59Z")), "2026-10-31");
    assert.equal(calendarDateIn("Asia/Karachi", new Date("2026-10-31T19:00:00Z")), "2026-11-01");
  });

  test("a west-of-UTC campus stays on the earlier day at the same instant", () => {
    assert.equal(calendarDateIn("America/Los_Angeles", instant), "2026-10-31");
  });

  test("a far-east campus is already on the next day at the same instant", () => {
    assert.equal(calendarDateIn("Pacific/Kiritimati", instant), "2026-11-01");
  });
});
