import { test } from "node:test";
import assert from "node:assert/strict";
import { USER_ROLES } from "../../src/lib/roles";
import { canConfigureCampus, institutionSetupDestination, roleAllowsWorkflowTab } from "../../src/lib/school-ai/setup-role";

test("only campus operators can answer and execute campus setup", () => {
  for (const role of USER_ROLES) assert.equal(canConfigureCampus(role), role === "ADMIN" || role === "CAMPUS_ADMIN", role);
  assert.equal(canConfigureCampus("UNKNOWN"), false);
});
test("group and standalone activation have different destinations", () => {
  assert.equal(institutionSetupDestination("GROUP"), "/setup/readiness");
  assert.equal(institutionSetupDestination("STANDALONE"), "/ai?setup=1");
});
test("group governance never advertises campus execution; principals do not get finance/setup", () => {
  for (const tab of ["schoolSetup", "academicSetup", "timetableSetup", "work", "feeInvoices", "examPlanning", "announcements", "schoolOperations", "financeOperations", "runs"]) assert.equal(roleAllowsWorkflowTab("SUPER_ADMIN", tab), false, tab);
  for (const tab of ["overview", "setupTasks", "policies", "knowledge", "history"]) assert.equal(roleAllowsWorkflowTab("SUPER_ADMIN", tab), true, tab);
  assert.equal(roleAllowsWorkflowTab("PRINCIPAL", "schoolSetup"), false);
  assert.equal(roleAllowsWorkflowTab("PRINCIPAL", "feeInvoices"), false);
  assert.equal(roleAllowsWorkflowTab("PRINCIPAL", "timetableSetup"), true);
});

test("server rejects campus-questionnaire writes from group owners and academic leads even with grants", async () => {
  const { assertWorkspaceDomainPermission } = await import("../../src/lib/school-ai/access");
  for (const role of ["SUPER_ADMIN", "PRINCIPAL"] as const) {
    const actor = { role, userId: "actor", schoolId: "school", campusId: "campus", email: "actor@example.invalid" };
    const permissions = new Map(["ai", "exams"].map(module => [module, { canView: true, canAdd: true, canEdit: true, canDelete: true }]));
    for (const action of ["add", "edit"] as const) await assert.rejects(() => assertWorkspaceDomainPermission(actor, "ONBOARDING", {}, action, permissions), { status: 403 });
    await assertWorkspaceDomainPermission(actor, "ONBOARDING", {}, "view", permissions);
  }
});
