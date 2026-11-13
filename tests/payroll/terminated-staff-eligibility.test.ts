import assert from "node:assert/strict";
import { mock, test } from "node:test";

mock.module("@/lib/db/prisma", { namedExports: { prisma: {}, }});
mock.module("@/lib/api/scope", {
  namedExports: {
    ApiError: class ApiError extends Error {},
    assertPermission: async () => {},
  },
});

const loadService = () => import("@/lib/payroll-runs/service");
const start = "2026-06-01";
const end = "2026-06-30";

test("an active member with no dates is paid", async () => {
  const { employedInPeriod } = await loadService();
  assert.equal(employedInPeriod({ isActive: true, joining: null, leaving: null }, start, end), true);
});

test("a deactivated member with a last working day inside the period is paid", async () => {
  const { employedInPeriod } = await loadService();
  assert.equal(employedInPeriod({ isActive: false, joining: "2020-01-01", leaving: "2026-06-15" }, start, end), true);
});

test("a deactivated member with a last working day before the period is not paid", async () => {
  const { employedInPeriod } = await loadService();
  assert.equal(employedInPeriod({ isActive: false, joining: "2020-01-01", leaving: "2026-05-31" }, start, end), false);
});

test("a deactivated member with no last working day is not paid", async () => {
  const { employedInPeriod } = await loadService();
  assert.equal(employedInPeriod({ isActive: false, joining: null, leaving: null }, start, end), false);
});

test("a member who joins after the period is not paid", async () => {
  const { employedInPeriod } = await loadService();
  assert.equal(employedInPeriod({ isActive: true, joining: "2026-07-01", leaving: null }, start, end), false);
});

test("a reactivated member is paid through a last working day that is still ahead of the period", async () => {
  const { employedInPeriod } = await loadService();
  assert.equal(employedInPeriod({ isActive: true, joining: "2020-01-01", leaving: "2026-06-30" }, start, end), true);
});

test("a reactivated member whose recorded last working day ended before the period is not paid for it", async () => {
  const { employedInPeriod } = await loadService();
  assert.equal(employedInPeriod({ isActive: true, joining: "2020-01-01", leaving: "2026-05-31" }, start, end), false, "rehiring clears the last working day; until then it still ends pay");
});
