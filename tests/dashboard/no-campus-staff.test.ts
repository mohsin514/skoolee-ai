import { h, groupUser, loadDashboard, user } from "./harness";
import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * SKAI-1895: a receptionist, accountant or librarian not yet assigned to a campus used to get "Campus context is
 * required" thrown from the shared console action: a 500 and a "Try again" that could never succeed. The action now
 * says so plainly and reads nothing campus-scoped; staff with a campus are unchanged.
 */

for (const role of ["RECEPTIONIST", "ACCOUNTANT", "LIBRARIAN"]) {
  test(`SKAI-1895: a ${role} with no campus gets the no-campus state and no campus-scoped reads`, async () => {
    const dashboard = await loadDashboard();
    h.session = user(role, { campusId: null });
    const result = await dashboard.getOperationsStaffDashboardData();
    assert.deepEqual(result, { campusUnassigned: true });
    const scoped = h.calls.filter((call) => /^(student|invoice|bookIssue|visitor|payment|attendance|campus)\./.test(call.read));
    assert.deepEqual(scoped, [], "nothing campus-scoped is read");
  });
}

test("SKAI-1895: a receptionist with a campus still gets the front desk", async () => {
  const dashboard = await loadDashboard();
  h.session = groupUser("RECEPTIONIST");
  const result = await dashboard.getOperationsStaffDashboardData();
  assert.ok(!("campusUnassigned" in result), "a campus-assigned receptionist gets the console data");
});

test("SKAI-1895: other roles are still refused before any campus check", async () => {
  const dashboard = await loadDashboard();
  h.session = user("TEACHER", { campusId: null });
  await assert.rejects(() => dashboard.getOperationsStaffDashboardData(), /Permission Denied/);
});
