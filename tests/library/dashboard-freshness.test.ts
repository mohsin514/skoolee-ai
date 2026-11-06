import { test } from "node:test";
import assert from "node:assert/strict";
import { libraryDashboardFreshness, libraryFreshnessEnabled } from "@/lib/library/dashboard-freshness";

// SKAI-562: the library dashboard says when its figures were read and whether a refresh failed.
const loadedAt = new Date("2026-11-06T09:00:00Z");

test("fresh figures name the time they were read", () => {
  const f = libraryDashboardFreshness(loadedAt, false, new Date("2026-11-06T09:02:00Z"));
  assert.deepEqual(f, { tone: "fresh", minutes: 2, loadedAt });
});

test("a failed refresh keeps the old figures and marks them stale", () => {
  assert.equal(libraryDashboardFreshness(loadedAt, true, new Date("2026-11-06T09:01:00Z")).tone, "stale");
});

test("figures older than fifteen minutes are marked stale even without a failure", () => {
  assert.equal(libraryDashboardFreshness(loadedAt, false, new Date("2026-11-06T09:16:00Z")).tone, "stale");
});

test("a clock behind the load time never reports negative minutes", () => {
  assert.equal(libraryDashboardFreshness(loadedAt, false, new Date("2026-11-06T08:59:00Z")).minutes, 0);
});

test("the freshness line is off unless the flag is set", () => {
  assert.equal(libraryFreshnessEnabled(undefined), false);
  assert.equal(libraryFreshnessEnabled("false"), false);
  assert.equal(libraryFreshnessEnabled("true"), true);
});
