import { h, groupUser, loadDashboard, logged, user } from "./harness";
import { test } from "node:test";
import assert from "node:assert/strict";

/** SKAI-1022 / SKAI-1032: the principal console degrades per widget and logs the real cause server-side. */

for (const [label, principal] of [["standalone", user("PRINCIPAL")], ["group", groupUser("PRINCIPAL")]] as const) {
  test(`SKAI-1032: ${label} principal console loads when a widget's read fails, and names it`, async () => {
    const dashboard = await loadDashboard();
    h.session = principal;
    h.failing = new Set(["reportCard.findMany", "class.findMany"]);
    const data = await dashboard.getPrincipalDashboardData();
    assert.deepEqual([...data.degraded].sort(), ["classes", "recentReportCards"]);
    assert.deepEqual(data.classes, []);
    assert.equal(data.campusId, principal.campusId);
    assert.ok(logged('widget "recentReportCards" failed', "P2024"), "cause is logged server-side");
  });
}

test("SKAI-1032: principal reads never exceed the per-instance pool budget", async () => {
  const dashboard = await loadDashboard();
  h.session = user("PRINCIPAL");
  const data = await dashboard.getPrincipalDashboardData();
  assert.deepEqual(data.degraded, []);
  assert.equal(h.maxInFlight, 1, "connection_limit=1 → one dashboard read at a time");
});

test("SKAI-1032: a required read failing still fails, with its cause logged", async () => {
  const dashboard = await loadDashboard();
  h.session = user("PRINCIPAL");
  // The currency read is required; it runs the invoice groupBy.
  h.failing = new Set(["invoice.groupBy"]);
  await assert.rejects(() => dashboard.getPrincipalDashboardData());
  assert.ok(logged('required read "currency" failed', "P2024"));
  assert.ok(logged("[principal-dashboard] load failed", "P2024"));
});

for (const role of ["TEACHER", "ADMIN", "CAMPUS_ADMIN", "PARENT"]) {
  test(`SKAI-1032: ${role} is denied the principal console`, async () => {
    const dashboard = await loadDashboard();
    h.session = user(role);
    await assert.rejects(() => dashboard.getPrincipalDashboardData(), /Unauthorized/);
  });
}

test("SKAI-1032: no session is denied the principal console", async () => {
  const dashboard = await loadDashboard();
  await assert.rejects(() => dashboard.getPrincipalDashboardData(), /Unauthorized/);
});
