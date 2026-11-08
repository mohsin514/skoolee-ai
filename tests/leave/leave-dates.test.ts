import { test } from "node:test";
import assert from "node:assert/strict";
import { rangeTenths, utcDay } from "@/lib/leave";

// SKAI-1409: leave dates are calendar days at UTC midnight, so they must not move in non-UTC zones.
test("a leave range counts whole calendar days regardless of the server timezone", () => {
  assert.equal(rangeTenths(new Date("2026-03-02T00:00:00Z"), new Date("2026-03-04T00:00:00Z")), 30);
  assert.equal(rangeTenths(new Date("2026-03-02T00:00:00Z"), new Date("2026-03-02T00:00:00Z")), 10);
});

test("utcDay keeps the calendar day in western and eastern zones", () => {
  assert.equal(utcDay(new Date("2026-12-31T00:00:00Z")).toISOString(), "2026-12-31T00:00:00.000Z");
  assert.equal(utcDay(new Date("2027-01-01T00:00:00Z")).toISOString(), "2027-01-01T00:00:00.000Z");
});
