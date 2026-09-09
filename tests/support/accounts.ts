/**
 * The 11-role fixture table.
 *
 * Sourced from the existing QA fixture tenant T1 (Alpha School Group, ACTIVE,
 * onboarding complete) documented in docs/qa/TEST-ACCOUNTS.md, rather than the
 * demo seed. Two reasons: the demo seed has no account for the `ADMIN` role at
 * all, and every T1 account is in one ACTIVE, fully-onboarded tenant — so a
 * logout assertion cannot fail for the unrelated reason that the proxy bounced
 * the request to /onboarding or /subscription-suspended first.
 */
import { USER_ROLES, ROLE_DASHBOARD_PATHS, type UserRole } from "@/lib/roles";

export const FIXTURE_PASSWORD = "QaFixture#2026";

export interface RoleFixture {
  role: UserRole;
  email: string;
  password: string;
  /** The role's own console, per ROLE_DASHBOARD_PATHS. */
  dashboardPath: string;
  /**
   * A page the proxy genuinely guards for this role, used for the
   * "redirected to /login once signed out" assertion.
   *
   * Normally the dashboard itself. PARENT is the exception: `/parent` sits in
   * PUBLIC_PATHS, and because that list matches prefixes the entire `/parent`
   * subtree is unauthenticated — so there is no guarded page under it to
   * assert against. `/student` is used instead, which parents are explicitly
   * admitted to by canAccessRoleDashboard().
   */
  guardedPagePath: string;
  /** Protected API for this role — 401 once the session is gone. */
  apiPath: string;
  note?: string;
}

/**
 * Public in the proxy, but calls getAuthUser() and answers 401 when it comes
 * back null. That combination is what makes it the revocation probe: the proxy
 * steps aside, so a 401 here can only have come from the auth layer itself and
 * never from the redirect the proxy would otherwise issue.
 */
export const SESSION_PROBE_PATH = "/api/auth/session";

/** Reachable by every role, and gated purely by getAuthUser(). */
const UNIVERSAL_API = "/api/notifications";

const OVERRIDES: Partial<Record<UserRole, Partial<RoleFixture>>> = {
  APP_OWNER: {
    apiPath: "/api/owner/sessions",
    note: "platform operator; requirePlatformOwner() stands the tenant guard down",
  },
  PARENT: {
    guardedPagePath: "/student",
    note: "/parent and its whole subtree are in PUBLIC_PATHS — see guardedPagePath",
  },
  ADMIN: {
    note: "distinct role from CAMPUS_ADMIN but shares the /admin console",
  },
};

function emailForRole(role: UserRole): string {
  // The fixture seed derives addresses from the role name, lower-cased.
  return `t1-${role.toLowerCase()}@example.invalid`;
}

export const ROLE_FIXTURES: RoleFixture[] = USER_ROLES.map((role) => {
  const dashboardPath = ROLE_DASHBOARD_PATHS[role];
  const base: RoleFixture = {
    role,
    email: emailForRole(role),
    password: FIXTURE_PASSWORD,
    dashboardPath,
    guardedPagePath: dashboardPath,
    apiPath: UNIVERSAL_API,
  };

  return { ...base, ...(OVERRIDES[role] ?? {}) };
});

export function fixtureFor(role: UserRole): RoleFixture {
  const found = ROLE_FIXTURES.find((f) => f.role === role);
  if (!found) throw new Error(`No fixture for role ${role}`);
  return found;
}

/**
 * Cross-role redirects the proxy performs on purpose, so the suites can treat
 * them as passes instead of reporting a redirect that is working as designed.
 * Keyed by role, mapping a requested path to where it legitimately lands.
 */
export const DOCUMENTED_REDIRECTS: Partial<Record<UserRole, Record<string, string>>> = {
  APP_OWNER: { "/dashboard": "/owner", "/super": "/owner" },
  SUPER_ADMIN: { "/dashboard": "/super" },
  PRINCIPAL: { "/dashboard": "/principal" },
};
