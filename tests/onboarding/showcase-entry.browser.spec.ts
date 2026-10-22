import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import type { UserRole } from "../../src/lib/roles";
import { candidateExamUrl } from "../../src/lib/school-ai/exam-boundary";
import { launchCopy } from "../../src/components/onboarding/launch-copy";

const database = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== database || process.env.DIRECT_URL !== database) throw Error("Only the isolated local test database is allowed.");
const db = new PrismaClient();
const origin = "http://localhost:3110";
const schoolId = `showcase-entry-${randomUUID()}`;
const campusId = `${schoolId}-campus`;
const accounts = new Map<string, { id: string; token: string; expiredToken: string; tokenHash: string }>();
const c = launchCopy("en");
const endpoint = "/api/auth/showcase-entry";

async function account(key: string, role: UserRole, options: { complete?: boolean; welcomed?: boolean; owner?: boolean; password?: boolean } = {}) {
  const id = `${schoolId}-${key}`;
  const user = await db.user.create({ data: {
    id, schoolId, campusId: options.owner ? null : campusId,
    email: `${key}-${schoolId}@example.test`, fullName: "Synthetic Showcase Person", role,
    onboardingComplete: options.complete ?? true, welcomeCompletedAt: options.welcomed ? new Date() : null,
    mustChangePassword: options.password ?? false, isInstitutionOwner: options.owner ?? false,
    mfaEnabled: true, preferredLanguage: "en",
  } });
  const claims = {
    userId: id, schoolId, campusId: user.campusId, role, email: user.email,
    accessVersion: 0, mfaVerified: true, onboardingComplete: user.onboardingComplete,
    mustChangePassword: user.mustChangePassword, schoolStatus: "ACTIVE",
  };
  const secret = new TextEncoder().encode("synthetic-launch-guide-secret-at-least-32-characters");
  const token = await new SignJWT(claims).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("2h").sign(secret);
  const expiredToken = await new SignJWT(claims).setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(Math.floor(Date.now() / 1000) - 120).setExpirationTime(Math.floor(Date.now() / 1000) - 60).sign(secret);
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await db.loginSession.create({ data: {
    userId: id, schoolId, tokenHash, isActive: true, expiresAt: new Date(Date.now() + 7200000),
  } });
  accounts.set(key, { id, token, expiredToken, tokenHash });
}

async function signIn(context: BrowserContext, key: string, expired = false) {
  await context.clearCookies();
  const account = accounts.get(key)!;
  await context.addCookies([{
    name: "skoolee_token", value: expired ? account.expiredToken : account.token,
    url: origin, httpOnly: true, sameSite: "Lax",
  }]);
}

async function finishShowcase(page: Page) {
  await page.getByRole("button", { name: c.showcaseNext, exact: true }).click();
  await page.getByRole("button", { name: c.showcaseNext, exact: true }).click();
  await page.getByRole("button", { name: c.finishTour, exact: true }).click();
  await expect(page.locator("[data-showcase]")).toHaveAttribute("data-complete", "true");
}

test.beforeAll(async () => {
  await db.school.create({ data: {
    id: schoolId, name: "Synthetic Showcase Academy", slug: schoolId, regId: schoolId,
    city: "Lahore", contactEmail: `owner-${schoolId}@example.test`,
    registrationKind: "GROUP", status: "ACTIVE", plan: "PRO",
  } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Synthetic Showcase Campus", city: "Lahore", regId: campusId } });
  await account("owner", "SUPER_ADMIN", { complete: false, owner: true });
  await account("campus", "CAMPUS_ADMIN");
  await account("teacher", "TEACHER", { complete: false });
  await account("student", "STUDENT", { complete: false });
  await account("completed", "PRINCIPAL", { welcomed: true });
  await account("parent-password", "PARENT", { password: true });
  await account("revoked", "CAMPUS_ADMIN");
  await account("revoked-student", "STUDENT");
  await account("expired", "CAMPUS_ADMIN");
});

test.afterAll(async () => {
  await db.school.deleteMany({ where: { id: schoolId } });
  await db.$disconnect();
});

test("direct signed-in showcase sends every role to its own onboarding and never registration", async ({ page, context }) => {
  const cases = [
    { key: "owner", href: "/onboarding" },
    { key: "campus", href: "/admin" },
    { key: "teacher", href: "/teacher-onboarding" },
    { key: "student", href: "/student" },
  ];
  for (const { key, href } of cases) {
    await test.step(key, async () => {
      await signIn(context, key);
      const entry = await context.request.get(endpoint);
      expect(entry.ok()).toBeTruthy();
      expect(entry.headers()["cache-control"]).toContain("no-store");
      expect(await entry.json()).toEqual({ mode: "onboarding", href });
      await page.goto("/showcase");
      const showcase = page.locator("[data-showcase]");
      await expect(showcase).toBeVisible();
      await expect(showcase).not.toContainText("Synthetic");
      await expect(page.getByRole("button", { name: c.getStarted, exact: true })).toHaveCount(0);
      if (key === "campus") {
        await finishShowcase(page);
        await expect(page.locator('[aria-hidden="true"][class*="z-[9999]"]')).toHaveCount(0);
        await page.screenshot({ path: "test-results/launch-guide/evidence/18-showcase-signed-in-next-step.png", animations: "disabled" });
        await page.locator("[data-guide-actions]").getByRole("button", { name: c.continueOnboarding, exact: true }).click();
      } else {
        await page.getByRole("button", { name: c.continueOnboarding, exact: true }).click();
      }
      await expect(page).toHaveURL(new RegExp(`${href}(?:\\?view=overview)?$`));
      await expect(page.locator("[data-launch-guide]")).toBeVisible();
      await expect(page).not.toHaveURL(/\/register(?:\?|$)/);
      if (key === "campus") {
        await expect(page.locator('[aria-hidden="true"][class*="z-[9999]"]')).toHaveCount(0);
        await page.screenshot({ path: "test-results/launch-guide/evidence/19-showcase-personal-onboarding.png", animations: "disabled" });
      }
    });
  }
});

test("a completed welcome returns to the existing workspace without repeating onboarding", async ({ page, context }) => {
  await signIn(context, "completed");
  expect(await (await context.request.get(endpoint)).json()).toEqual({ mode: "workspace", href: "/principal" });
  await page.goto("/showcase");
  await finishShowcase(page);
  await page.locator("[data-guide-actions]").getByRole("button", { name: c.continueWorkspace, exact: true }).click();
  await expect(page).toHaveURL(/\/principal(?:\?view=overview)?$/);
  // Replay lives in Help now (M106); there is no floating replay button.
  await expect(page.getByRole("button", { name: "Help", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: c.replay, exact: true })).toHaveCount(0);
  await expect(page.locator("[data-launch-guide]")).toHaveCount(0);
});

test("a parent must change their password before the otherwise public family workspace", async ({ page, context }) => {
  await signIn(context, "parent-password");
  expect(await (await context.request.get(endpoint)).json()).toEqual({ mode: "onboarding", href: "/first-login" });
  await page.goto("/showcase");
  await page.getByRole("button", { name: c.continueOnboarding, exact: true }).click();
  await expect(page).toHaveURL(/\/first-login$/);
  await expect(page.locator("[data-launch-guide]")).toHaveCount(0);
});

test("current suspension routes to recovery while mandatory password replacement remains first", async ({ context }) => {
  await db.school.update({ where: { id: schoolId }, data: { status: "SUSPENDED" } });
  try {
    await signIn(context, "campus");
    expect(await (await context.request.get(endpoint)).json()).toEqual({ mode: "workspace", href: "/subscription-suspended" });
    await signIn(context, "parent-password");
    expect(await (await context.request.get(endpoint)).json()).toEqual({ mode: "onboarding", href: "/first-login" });
  } finally {
    await db.school.update({ where: { id: schoolId }, data: { status: "ACTIVE" } });
  }
});

test("a session revoked while the presentation is open returns to sign-in, never sign-up", async ({ page, context }) => {
  for (const key of ["revoked", "revoked-student"]) {
    await test.step(key, async () => {
      await signIn(context, key);
      await page.goto("/showcase");
      const continueButton = page.getByRole("button", { name: c.continueOnboarding, exact: true });
      await expect(continueButton).toBeVisible();
      // Let the initial session probe finish before revocation so it cannot
      // clear the cookie first and mask the student proxy's direct 401 branch.
      await page.waitForLoadState("networkidle");
      await db.loginSession.updateMany({ where: { tokenHash: accounts.get(key)!.tokenHash }, data: { isActive: false } });
      const response = page.waitForResponse(response => response.url() === `${origin}${endpoint}`);
      await continueButton.click();
      // Student sessions are checked by the proxy before this public API runs.
      expect((await response).status()).toBe(key === "revoked-student" ? 401 : 200);
      await expect(page).toHaveURL(/\/login(?:\?|$)/);
      await expect(page).not.toHaveURL(/\/register(?:\?|$)/);
    });
  }
});

test("an exam started in another tab returns the student to its candidate room", async ({ page, context }) => {
  await signIn(context, "student");
  await page.goto("/showcase");
  const examUrl = candidateExamUrl(`${schoolId}-assignment`);
  await page.route(`**${endpoint}`, route => route.fulfill({
    status: 409,
    json: { code: "EXAM_SESSION_ACTIVE", examUrl },
  }));
  await page.getByRole("button", { name: c.continueOnboarding, exact: true }).click();
  await expect(page).toHaveURL(`${origin}${examUrl}`);
  await expect(page.locator("[data-showcase]")).toHaveCount(0);
});

test("an expired session opens a sign-in CTA instead of treating an existing member as a new visitor", async ({ page, context }) => {
  await signIn(context, "expired", true);
  const entry = await context.request.get(endpoint);
  expect(entry.ok()).toBeTruthy();
  expect((await entry.json()).mode).toBe("signIn");
  await page.goto("/showcase");
  await expect(page.getByRole("button", { name: c.getStarted, exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: c.signInAgain, exact: true }).click();
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
});

test("sign-out in another tab does not turn the member CTA into registration", async ({ page, context }) => {
  await signIn(context, "campus");
  await page.goto("/showcase");
  await expect(page.getByRole("button", { name: c.continueOnboarding, exact: true })).toBeVisible();
  await context.clearCookies();
  await page.getByRole("button", { name: c.continueOnboarding, exact: true }).click();
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
});

test("sign-in in another tab changes the guest CTA destination to the existing account", async ({ page, context }) => {
  await context.clearCookies();
  await page.goto("/showcase");
  const getStarted = page.getByRole("button", { name: c.getStarted, exact: true });
  await expect(getStarted).toBeVisible();
  await signIn(context, "student");
  await getStarted.click();
  await expect(page).toHaveURL(/\/student$/);
  await expect(page.locator("[data-launch-guide]")).toBeVisible();
});

test("a temporary routing failure stays on the presentation and a retry enters the account", async ({ page, context }) => {
  await signIn(context, "campus");
  await page.goto("/showcase");
  await page.route(`**${endpoint}`, route => route.fulfill({ status: 503, json: { error: "Synthetic retry" } }));
  await page.getByRole("button", { name: c.continueOnboarding, exact: true }).click();
  await expect(page.locator("[data-showcase]").getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/showcase$/);
  await expect(page.getByRole("button", { name: c.getStarted, exact: true })).toHaveCount(0);
  await page.unroute(`**${endpoint}`);
  await page.getByRole("button", { name: c.continueOnboarding, exact: true }).click();
  await expect(page).toHaveURL(/\/admin(?:\?view=overview)?$/);
  await expect(page.locator("[data-launch-guide]")).toBeVisible();
});

test("a confirmed visitor can still start registration after the presentation ends", async ({ page, context }) => {
  await context.clearCookies();
  expect(await (await context.request.get(endpoint)).json()).toEqual({ mode: "register", href: "/register" });
  await page.goto("/showcase");
  await finishShowcase(page);
  await page.locator("[data-guide-actions]").getByRole("button", { name: c.getStarted, exact: true }).click();
  await expect(page).toHaveURL(/\/register$/);
});
