import { h, SCHOOL, groupUser, loadDashboard, logged, user } from "./harness";
import { test } from "node:test";
import assert from "node:assert/strict";

/** SKAI-1031: the admin console (/admin, Settings, Payroll) degrades per widget; a standalone owner never dead-ends. */

test("SKAI-1031: standalone owner admin without a linked campus loads its only campus", async () => {
  const dashboard = await loadDashboard();
  h.session = user("ADMIN", { campusId: null, isInstitutionOwner: true });
  const data = await dashboard.getCampusDashboardData();
  assert.deepEqual(data.degraded, []);
  assert.equal(logged("[admin-dashboard] load failed"), false, "no load failure logged");
});

test("SKAI-1031: standalone admin console degrades a failing widget instead of failing", async () => {
  const dashboard = await loadDashboard();
  h.session = user("ADMIN", { isInstitutionOwner: true });
  h.failing = new Set(["invoice.groupBy", "student.findMany"]);
  const data = await dashboard.getCampusDashboardData();
  assert.deepEqual([...data.degraded].sort(), ["invoiceGroupsByCurrency", "students"]);
  assert.equal(data.invoiceSummary.total, 0);
  assert.ok(h.maxInFlight <= 2, "one widget at a time (the AI-setup widget runs its own pair of counts)");
  assert.ok(logged('widget "students" failed', "P2024"));
});

test("SKAI-1031: group campus admin console degrades per widget too", async () => {
  const dashboard = await loadDashboard();
  h.session = groupUser("CAMPUS_ADMIN");
  h.failing = new Set(["aIInsight.findMany"]);
  const data = await dashboard.getCampusDashboardData();
  assert.deepEqual(data.degraded, ["aiInsights"]);
});

test("SKAI-1031: the campus fallback is only for the standalone authority with exactly one campus", async () => {
  const dashboard = await loadDashboard();
  h.session = groupUser("CAMPUS_ADMIN", { campusId: null });
  await assert.rejects(() => dashboard.getCampusDashboardData(), /Campus context is required/);
  h.campuses.set(SCHOOL, [{ id: "campus-1" }, { id: "campus-2" }]);
  h.session = user("ADMIN", { campusId: null, isInstitutionOwner: true });
  await assert.rejects(() => dashboard.getCampusDashboardData(), /Campus context is required/);
  assert.ok(logged("[admin-dashboard] load failed"), "the real cause is logged");
});

for (const role of ["PRINCIPAL", "TEACHER", "SUPER_ADMIN", "STUDENT"]) {
  test(`SKAI-1031: ${role} is denied the admin console`, async () => {
    const dashboard = await loadDashboard();
    h.session = role === "SUPER_ADMIN" ? groupUser(role) : user(role);
    await assert.rejects(() => dashboard.getCampusDashboardData(), /Permission Denied/);
  });
}
