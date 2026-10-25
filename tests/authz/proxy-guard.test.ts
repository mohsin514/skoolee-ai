/**
 * role-ux §7.7 G43–G46 — the proxy's role decision and the suspended allow-list.
 *
 * `roleGuardRedirect` (src/lib/roles.ts) is the pure decision; the second half drives the real `proxy()` with signed
 * synthetic tokens (no database: every case below uses an onboarded non-student account, so no DB-backed branch runs).
 */
import assert from "node:assert/strict";
import { before, test } from "node:test";
import { SignJWT } from "jose";
import { roleGuardRedirect, type UserRole } from "../../src/lib/roles";

// ─── Pure decision ────────────────────────────────────────────────────────

test("API paths are never redirected by the role guard (K-B1): every route keeps its own gate", () => {
  for (const role of ["PARENT", "STUDENT", "APP_OWNER", "TEACHER"] as const) {
    for (const path of ["/api/notifications", "/api/auth/tour", "/api/navigation/access", "/api/students", "/api/fees/invoices"]) {
      assert.equal(roleGuardRedirect(role, path), null, `${role} ${path}`);
    }
  }
});

test("families default-deny on pages: their own portal and a short shared list; everything else goes home", () => {
  assert.equal(roleGuardRedirect("PARENT", "/parent"), null);
  assert.equal(roleGuardRedirect("PARENT", "/parent/fees"), null);
  assert.equal(roleGuardRedirect("PARENT", "/care"), "/parent");
  assert.equal(roleGuardRedirect("PARENT", "/pupils/x1"), "/parent");
  assert.equal(roleGuardRedirect("PARENT", "/admin"), "/parent");
  assert.equal(roleGuardRedirect("PARENT", "/dashboard/students"), "/parent");
  assert.equal(roleGuardRedirect("PARENT", "/billing"), "/parent");
  for (const path of ["/messages", "/corrections", "/parent-invitations", "/account/security", "/school-capture", "/subscription-suspended", "/403", "/first-login"]) {
    assert.equal(roleGuardRedirect("PARENT", path), null, `PARENT ${path}`);
    assert.equal(roleGuardRedirect("STUDENT", path === "/parent-invitations" ? "/messages" : path), null, `STUDENT ${path}`);
  }
  assert.equal(roleGuardRedirect("STUDENT", "/student"), null);
  assert.equal(roleGuardRedirect("STUDENT", "/ai/exams/x"), null);
  for (const role of ["STUDENT", "PARENT", "APP_OWNER"] as const) {
    for (const path of ["/ai", "/ai/knowledge", "/ai/knowledge/doc-123"]) assert.equal(roleGuardRedirect(role, path), null);
  }
  assert.equal(roleGuardRedirect("STUDENT", "/ai/studio"), "/student");
  assert.equal(roleGuardRedirect("PARENT", "/ai/exams/x"), "/parent");
  assert.equal(roleGuardRedirect("STUDENT", "/parent"), "/student");
  assert.equal(roleGuardRedirect("STUDENT", "/care"), "/student");
});

test("family module routes land on their §6.3 family destination, not on home", () => {
  assert.equal(roleGuardRedirect("PARENT", "/pickup"), "/parent/pickup");
  assert.equal(roleGuardRedirect("PARENT", "/transport"), "/parent/pickup");
  assert.equal(roleGuardRedirect("PARENT", "/transport/trips/x"), "/parent/pickup");
  assert.equal(roleGuardRedirect("PARENT", "/activities"), "/parent/activities");
  assert.equal(roleGuardRedirect("PARENT", "/accommodations"), "/parent/access");
  assert.equal(roleGuardRedirect("STUDENT", "/accommodations"), "/student/access");
  assert.equal(roleGuardRedirect("STUDENT", "/activities"), "/student", "learners have no activities page");
  assert.equal(roleGuardRedirect("STUDENT", "/pickup"), "/student");
  assert.equal(roleGuardRedirect("PARENT", "/settings/locale"), "/parent?settings=language");
  assert.equal(roleGuardRedirect("STUDENT", "/settings/locale"), "/student?settings=language");
  assert.equal(roleGuardRedirect("PARENT", "/settings"), "/parent");
  // Staff are untouched by the family map (their framed pages handle these routes).
  assert.equal(roleGuardRedirect("RECEPTIONIST", "/pickup"), null);
  assert.equal(roleGuardRedirect("TEACHER", "/accommodations"), null);
});

test("a guardian pays fees online through the sandbox card form; learners and the platform operator do not", () => {
  assert.equal(roleGuardRedirect("PARENT", "/safepay"), null, "matrix #79: the dev/QA sandbox return of /api/fees/pay-online");
  assert.equal(roleGuardRedirect("STUDENT", "/safepay"), "/student", "G44a: learners never pay");
  assert.equal(roleGuardRedirect("APP_OWNER", "/safepay"), "/owner");
  assert.equal(roleGuardRedirect("SUPER_ADMIN", "/safepay"), null, "the payer's subscription sandbox");
  assert.equal(roleGuardRedirect("ADMIN", "/safepay"), null);
});

test("a guardian following a learner link lands on the same thing in the family portal (§6.3)", () => {
  assert.equal(roleGuardRedirect("PARENT", "/student/reports"), "/parent/results");
  assert.equal(roleGuardRedirect("PARENT", "/student/fees"), "/parent/fees");
  assert.equal(roleGuardRedirect("PARENT", "/student/attendance"), "/parent/attendance");
  assert.equal(roleGuardRedirect("PARENT", "/student/timetable"), "/parent/timetable");
  assert.equal(roleGuardRedirect("PARENT", "/student/assignments"), "/parent/assignments");
  assert.equal(roleGuardRedirect("PARENT", "/student"), "/parent");
  assert.equal(roleGuardRedirect("PARENT", "/student/portfolio"), "/parent");
});

test("the platform operator works in /owner; school module pages send it there", () => {
  assert.equal(roleGuardRedirect("APP_OWNER", "/owner"), null);
  assert.equal(roleGuardRedirect("APP_OWNER", "/account/security"), null);
  for (const path of ["/care", "/super", "/dashboard", "/messages", "/admin", "/billing"]) assert.equal(roleGuardRedirect("APP_OWNER", path), "/owner", path);
});

test("staff reach legacy /dashboard/** (the page redirects them) and see /403 on another role's console (G45)", () => {
  for (const role of ["SUPER_ADMIN", "ADMIN", "CAMPUS_ADMIN", "PRINCIPAL", "TEACHER", "ACCOUNTANT", "RECEPTIONIST", "LIBRARIAN"] as UserRole[]) {
    assert.equal(roleGuardRedirect(role, "/dashboard/students"), null, `${role} /dashboard/students`);
    assert.equal(roleGuardRedirect(role, "/dashboard/guardians"), null, `${role} /dashboard/guardians`);
  }
  assert.equal(roleGuardRedirect("SUPER_ADMIN", "/dashboard/billing"), null);
  assert.equal(roleGuardRedirect("PRINCIPAL", "/admin"), "/403");
  assert.equal(roleGuardRedirect("TEACHER", "/super"), "/403");
  assert.equal(roleGuardRedirect("CAMPUS_ADMIN", "/owner"), "/403");
  assert.equal(roleGuardRedirect("TEACHER", "/student"), "/403", "the learner portal admits learners only");
  assert.equal(roleGuardRedirect("ADMIN", "/admin"), null);
  assert.equal(roleGuardRedirect("ADMIN", "/billing"), null);
});

// ─── The real proxy ───────────────────────────────────────────────────────

const AUTH_SECRET = "proxy-guard-test-secret-0123456789abcdef0123456789";
let proxy: typeof import("../../src/proxy").proxy;
let NextRequestCtor: typeof import("next/server").NextRequest;
let SESSION_COOKIE = "";

before(async () => {
  Object.assign(process.env, { NODE_ENV: "test", AUTH_SECRET, DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused" });
  ({ proxy } = await import("../../src/proxy"));
  ({ NextRequest: NextRequestCtor } = await import("next/server"));
  ({ SESSION_COOKIE_NAME: SESSION_COOKIE } = await import("../../src/lib/auth/session-cookie"));
});

async function token(role: UserRole, schoolStatus = "ACTIVE") {
  return new SignJWT({ userId: `user-${role.toLowerCase()}`, schoolId: "school-synthetic", role, onboardingComplete: true, schoolStatus, campusId: "campus-a", accessVersion: 0 })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(AUTH_SECRET));
}

async function call(path: string, options: { role?: UserRole; status?: string; method?: string } = {}) {
  const headers = new Headers();
  if (options.role) headers.set("cookie", `${SESSION_COOKIE}=${await token(options.role, options.status)}`);
  const response = await proxy(new NextRequestCtor(new URL(path, "http://localhost:3000"), { method: options.method ?? "GET", headers }));
  const location = response.headers.get("location");
  return { status: response.status, location: location ? new URL(location).pathname + new URL(location).search : null, passed: response.headers.get("x-middleware-next") === "1", response };
}

test("suspended school: the standalone owner reaches /admin?view=billing and /billing; other pages go to the recovery screen", async () => {
  const billingView = await call("/admin?view=billing", { role: "ADMIN", status: "SUSPENDED" });
  assert.equal(billingView.passed, true, "/admin?view=billing renders");
  assert.equal(billingView.response.headers.get("x-middleware-request-x-billing-workspace"), "1");
  assert.equal((await call("/billing", { role: "ADMIN", status: "SUSPENDED" })).passed, true);
  assert.equal((await call("/super?view=billing", { role: "SUPER_ADMIN", status: "SUSPENDED" })).passed, true);
  assert.equal((await call("/admin", { role: "ADMIN", status: "SUSPENDED" })).location, "/subscription-suspended");
  assert.equal((await call("/admin?view=students", { role: "ADMIN", status: "SUSPENDED" })).location, "/subscription-suspended");
});

test("suspended school: shell reads stay open (GET only), MFA enrolment stays open, writes get a neutral 402 with a code", async () => {
  for (const path of ["/api/navigation/access", "/api/navigation/counts", "/api/profile", "/api/notifications", "/api/auth/tour", "/api/account/mfa/setup", "/account/security"]) {
    assert.equal((await call(path, { role: "ADMIN", status: "SUSPENDED" })).passed, true, path);
  }
  const write = await call("/api/profile", { role: "ADMIN", status: "SUSPENDED", method: "PATCH" });
  assert.equal(write.status, 402);
  const body = await write.response.json() as { error: string; code: string };
  assert.equal(body.code, "SUBSCRIPTION_SUSPENDED");
  assert.doesNotMatch(body.error, /Upgrade to|Open billing/);
});

test("suspended family: /parent goes to the recovery screen, which then renders (no loop); family APIs are not redirected", async () => {
  assert.equal((await call("/parent", { role: "PARENT", status: "SUSPENDED" })).location, "/subscription-suspended");
  const recovery = await call("/subscription-suspended", { role: "PARENT", status: "SUSPENDED" });
  assert.equal(recovery.passed, true, "the recovery screen itself is never redirected");
  assert.equal((await call("/api/notifications", { role: "PARENT", status: "SUSPENDED" })).passed, true);
  assert.equal((await call("/api/auth/tour", { role: "PARENT", status: "SUSPENDED" })).passed, true);
});

test("active school: family and platform-operator page rules, staff legacy paths", async () => {
  assert.equal((await call("/student/reports", { role: "PARENT" })).location, "/parent/results");
  assert.equal((await call("/care", { role: "PARENT" })).location, "/parent");
  assert.equal((await call("/api/students", { role: "PARENT" })).passed, true, "family /api/* reaches the route's own gate");
  assert.equal((await call("/care", { role: "APP_OWNER" })).location, "/owner");
  assert.equal((await call("/dashboard/students", { role: "TEACHER" })).passed, true, "the legacy page redirects staff itself");
  assert.equal((await call("/dashboard/billing", { role: "SUPER_ADMIN" })).passed, true);
  assert.equal((await call("/admin", { role: "PRINCIPAL" })).location, "/403");
});

test("signed-out deep links keep their query through sign-in (G46)", async () => {
  const result = await call("/admin?view=fees&invoice=inv-1");
  assert.equal(result.status, 307);
  const redirect = new URL(result.response.headers.get("location")!).searchParams.get("redirect");
  assert.equal(redirect, "/admin?view=fees&invoice=inv-1");
});

test("/parent is no longer a public path (D14)", async () => {
  const result = await call("/parent?token=abc");
  assert.equal(result.location?.startsWith("/login"), true);
});
