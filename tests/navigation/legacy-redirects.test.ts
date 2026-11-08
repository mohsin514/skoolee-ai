import { test } from "node:test";
import assert from "node:assert/strict";
import { legacyDashboardTarget, orphanRouteTarget, type LegacyRedirectContext } from "../../src/lib/navigation/legacy-redirects";
import { USER_ROLES, dashboardPathForRole, type UserRole } from "../../src/lib/roles";

const ctx = (role: UserRole, extra: Partial<LegacyRedirectContext> = {}): LegacyRedirectContext => ({ role, academicLead: false, standaloneOwner: false, ...extra });
const go = (role: UserRole, path: string, query: Record<string, string | string[] | undefined> = {}, extra: Partial<LegacyRedirectContext> = {}) =>
  legacyDashboardTarget(ctx(role, extra), path ? path.split("/") : [], query);

// One row per §6.1 path: [SA, CA/ADMIN, PR, TE, AC, RE/LI, PA/ST]; "home" = dashboardPathForRole(role).
const H = "home";
const TABLE: Array<[string, [string, string, string, string, string, string, string]]> = [
  ["", ["/super", "/admin", "/principal", "/teacher", "/accountant", H, H]],
  ["students", ["/super?view=campuses", "/admin?view=students", "/principal?view=students", "/teacher/students", H, H, H]],
  ["classes", ["/super?view=campuses", "/admin?view=classes", "/principal?view=classes", "/teacher/classes", H, H, H]],
  ["staff-hierarchy", ["/super?view=campuses", "/admin?view=staff-hierarchy", "/principal?view=teachers", H, H, H, H]],
  ["reports", ["/super", "/admin?view=report-cards", "/principal?view=report-cards", "/teacher/reports", H, H, H]],
  ["communications", ["/super", "/admin?view=communications", "/principal?view=engagement", H, H, H, H]],
  ["analytics", ["/super", "/admin?view=academic-hub", "/principal", "/teacher/insights", "/accountant?view=fee-reports", H, H]],
  ["billing", ["/billing", "/billing", H, H, H, H, H]],
  ["fees", ["/super?view=campuses", "/admin?view=fees", H, H, "/accountant?view=payments", H, H]],
  ["guardians", ["/super?view=campuses", "/admin?view=guardians", "/principal?view=students", H, H, H, H]],
  ["settings", ["/super?view=settings", "/admin?settings=profile", "/principal?settings=profile", "/teacher?settings=profile", "/accountant?settings=profile", "{home}?settings=profile", H]],
  ["settings/members", ["/super?view=access&tab=members", "/admin?view=leadership", H, H, H, H, H]],
  ["anything/else", [H, H, H, H, H, H, H]],
];
const COLUMNS: UserRole[][] = [["SUPER_ADMIN"], ["CAMPUS_ADMIN", "ADMIN"], ["PRINCIPAL"], ["TEACHER"], ["ACCOUNTANT"], ["RECEPTIONIST", "LIBRARIAN"], ["PARENT", "STUDENT"]];

test("every §6.1 row lands each role on its own console view", () => {
  for (const [path, row] of TABLE) {
    row.forEach((expected, column) => {
      for (const role of COLUMNS[column]) {
        const home = dashboardPathForRole(role);
        const want = expected === H ? home : expected.replace("{home}", home);
        assert.equal(go(role, path), want, `${role} /dashboard/${path}`);
      }
    });
  }
});

test("marks follows the academic lead seat for campus operators", () => {
  for (const role of ["CAMPUS_ADMIN", "ADMIN"] as const) {
    assert.equal(go(role, "marks", {}, { academicLead: true }), "/admin?view=exam-cycles");
    assert.equal(go(role, "marks", {}, { academicLead: false }), "/admin?view=academic-hub");
  }
  assert.equal(go("SUPER_ADMIN", "marks"), "/super");
  assert.equal(go("PRINCIPAL", "marks"), "/principal?view=exam-cycles");
  assert.equal(go("TEACHER", "marks"), "/teacher/marks");
  for (const role of ["ACCOUNTANT", "RECEPTIONIST", "LIBRARIAN", "PARENT", "STUDENT"] as const) assert.equal(go(role, "marks"), dashboardPathForRole(role));
});

test("settings/members follows the standalone owner, never the billing key", () => {
  assert.equal(go("ADMIN", "settings/members", {}, { standaloneOwner: true }), "/admin?view=access&tab=members");
  assert.equal(go("ADMIN", "settings/members", {}, { standaloneOwner: false }), "/admin?view=leadership");
  assert.equal(go("CAMPUS_ADMIN", "settings/members"), "/admin?view=leadership");
});

test("only the listed query parameters survive, encoded with URLSearchParams", () => {
  assert.equal(go("SUPER_ADMIN", "billing", { success: "1", session_id: "cs_test&x=1", other: "drop" }), "/billing?success=1&session_id=cs_test%26x%3D1");
  assert.equal(go("ADMIN", "billing", { canceled: "1", safepay_status: ["paid", "ignored"] }), "/billing?canceled=1&safepay_status=paid");
  assert.equal(go("ADMIN", "fees", { invoice: "inv 1", payment: "p1", student: "s1", view: "forged" }), "/admin?view=fees&invoice=inv+1&payment=p1&student=s1");
  assert.equal(go("ACCOUNTANT", "fees", { invoice: "i1" }), "/accountant?view=payments&invoice=i1");
  assert.equal(go("CAMPUS_ADMIN", "guardians", { student: "s9", invoice: "drop" }), "/admin?view=guardians&student=s9");
  assert.equal(go("PRINCIPAL", "billing", { success: "1" }), "/principal", "non-payer roles never reach /billing");
});

test("the platform operator and unknown paths go home; trailing empty segments are ignored", () => {
  for (const path of ["", "students", "billing", "settings", "x/y/z"]) assert.equal(go("APP_OWNER", path), "/owner");
  assert.equal(legacyDashboardTarget(ctx("TEACHER"), ["students", ""], {}), "/teacher/students");
  for (const role of USER_ROLES) assert.ok(go(role, "students").startsWith("/"));
});

const user = (role: UserRole, institutionKind?: "GROUP" | "STANDALONE", isInstitutionOwner?: boolean) => ({ role, institutionKind, isInstitutionOwner });

test("§6.3 orphan routes resolve per role and institution kind", () => {
  const SA = user("SUPER_ADMIN", "GROUP");
  const SO = user("ADMIN", "STANDALONE");
  const CA = user("CAMPUS_ADMIN", "GROUP");
  const deputy = user("CAMPUS_ADMIN", "STANDALONE");
  const groupAdminRow = user("ADMIN", "GROUP");
  const PR = user("PRINCIPAL", "GROUP");
  const AC = user("ACCOUNTANT", "GROUP");
  const RE = user("RECEPTIONIST", "STANDALONE");
  const PA = user("PARENT", "GROUP");

  assert.equal(orphanRouteTarget("settings-data", SA), "/super?view=settings&tab=data");
  assert.equal(orphanRouteTarget("settings-data", SO), "/admin?view=school-settings&tab=data");
  assert.equal(orphanRouteTarget("settings-data", CA), "/admin");
  assert.equal(orphanRouteTarget("settings-data", PR), "/principal");

  assert.equal(orphanRouteTarget("settings-locale", SA), "/super?view=settings&tab=locale");
  assert.equal(orphanRouteTarget("settings-locale", SO), "/admin?view=school-settings&tab=locale");
  assert.equal(orphanRouteTarget("settings-locale", CA), "/admin?view=settings&tab=profile");
  assert.equal(orphanRouteTarget("settings-locale", PR), "/principal?settings=language");
  assert.equal(orphanRouteTarget("settings-locale", PA), "/parent?settings=language");

  assert.equal(orphanRouteTarget("pickup", RE), "/receptionist?view=pickup");
  assert.equal(orphanRouteTarget("pickup", CA), "/admin?view=pickup");
  assert.equal(orphanRouteTarget("pickup", SO), "/admin?view=pickup");
  assert.equal(orphanRouteTarget("pickup", PA), "/parent/pickup");
  assert.equal(orphanRouteTarget("pickup", PR), "/principal");

  assert.equal(orphanRouteTarget("group-policy", SA), "/super?view=standards&tab=policies");
  assert.equal(orphanRouteTarget("group-policy", CA), "/admin?view=settings&tab=group-standards");
  assert.equal(orphanRouteTarget("group-policy", groupAdminRow), "/admin?view=settings&tab=group-standards");
  assert.equal(orphanRouteTarget("group-policy", deputy), "/admin", "a standalone school has no group policy");
  assert.equal(orphanRouteTarget("group-policy", SO), "/admin");

  for (const route of ["identity", "integrations"] as const) {
    assert.equal(orphanRouteTarget(route, SA), `/super?view=settings&tab=${route}`);
    assert.equal(orphanRouteTarget(route, SO), `/admin?view=school-settings&tab=${route}`);
    assert.equal(orphanRouteTarget(route, CA), "/admin");
    assert.equal(orphanRouteTarget(route, PR), "/principal");
  }

  assert.equal(orphanRouteTarget("tax-packages", AC), "/accountant?view=tax");
  assert.equal(orphanRouteTarget("tax-packages", SA), "/super?view=approvals&tab=tax");
  assert.equal(orphanRouteTarget("tax-packages", SO), "/admin?view=approvals&tab=tax");
  assert.equal(orphanRouteTarget("tax-packages", CA), "/admin");
});

test("a user object without an institution kind fails closed (C32)", () => {
  assert.equal(orphanRouteTarget("settings-data", user("SUPER_ADMIN")), "/super");
  assert.equal(orphanRouteTarget("settings-data", user("ADMIN")), "/admin");
  assert.equal(orphanRouteTarget("settings-data", user("ADMIN", undefined, true)), "/admin?view=school-settings&tab=data", "the owner flag alone resolves a standalone owner");
  assert.equal(orphanRouteTarget("group-policy", user("CAMPUS_ADMIN")), "/admin");
});
