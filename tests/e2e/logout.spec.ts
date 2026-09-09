/**
 * Signing out, in a real browser, for all 11 roles.
 *
 * This suite exists to cover what the API suite structurally cannot. Three of
 * the four things that must happen on sign-out are only observable in a browser:
 *
 *  - the redirect issued by a layout arrives inside a streamed RSC payload, so
 *    over plain HTTP it looks like a 200 and only a client performs it;
 *  - the App Router keeps a client-side cache of rendered segments, so whether
 *    Back can still paint a console after sign-out depends on the kind of
 *    navigation the handler used, which no HTTP assertion can see;
 *  - the sign-out control itself is behind a dropdown, and "the endpoint works"
 *    is not the same claim as "the button a user can find calls it".
 *
 * So each role is driven through the actual form and the actual control.
 */
import { test, expect, type Page, type BrowserContext } from "@playwright/test";

import { ROLE_FIXTURES, type RoleFixture } from "../support/accounts";
import {
  cleanupMintedSessions,
  createThrowawayUser,
  deleteThrowawayUsers,
  disconnectDb,
  recordMintedToken,
  sessionRowsForToken,
} from "../support/db";
import { SESSION_COOKIE_NAME } from "../../src/lib/auth/session-cookie";

async function sessionCookie(context: BrowserContext): Promise<string | undefined> {
  const cookies = await context.cookies();
  return cookies.find((c) => c.name === SESSION_COOKIE_NAME)?.value;
}

/** Open LoginSession rows for a token, for the server-action assertions. */
async function openSessionCount(token: string): Promise<number> {
  const rows = await sessionRowsForToken(token);
  return rows.filter((r) => r.isActive).length;
}

async function signIn(page: Page, fixture: RoleFixture): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(fixture.email);
  await page.locator("#password").fill(fixture.password);
  await page.locator('button[type="submit"]').click();

  // The app decides where each role lands, so this waits for "no longer on the
  // sign-in page" rather than asserting a specific destination — that mapping is
  // the role matrix's business, not this suite's.
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
  await expect.poll(() => sessionCookie(page.context())).toBeTruthy();

  // Signing in through the form bypasses the harness's own login() helper, so
  // the token is registered here instead — otherwise the tests that never sign
  // out would leave open rows behind.
  const token = await sessionCookie(page.context());
  if (token) recordMintedToken(token);
}

/**
 * Clicks whichever sign-out control this console actually renders.
 *
 * The consoles were built at different times and there are three distinct
 * controls: the RoleHeader avatar menu (every RoleShell console), the sidebar
 * button on the legacy /dashboard, and onboarding's own button. Trying them in
 * order — and failing loudly if none is present — is what keeps this honest: a
 * console that grows a fourth one, or loses its control entirely, fails here
 * instead of being quietly skipped.
 */
async function clickSignOut(page: Page): Promise<string> {
  const accountMenu = page.locator('button[title="Account menu"]');
  const directButton = page.getByRole("button", { name: /sign out/i });

  // Waiting, not counting. Only /teacher and /student mount their shell from
  // the layout; the other nine consoles render RoleShell inside a client
  // component that fetches first, so the header does not exist at the moment
  // the page settles. An immediate count() reported "no control" for all nine.
  await expect(
    accountMenu.or(directButton).first(),
    `No sign-out control appeared on ${page.url()}. Every authenticated ` +
      `console must expose one — if this console's control moved, this suite ` +
      `needs to fail rather than pass by default.`
  ).toBeVisible({ timeout: 45_000 });

  if (await accountMenu.count()) {
    await accountMenu.first().click();
    const item = page.getByRole("menuitem", { name: /sign out/i });
    await expect(item).toBeVisible({ timeout: 10_000 });
    await item.click();
    return "RoleHeader account menu";
  }

  await directButton.first().click();
  return "direct sign-out button";
}

test.describe("sign-out in a real browser", () => {
  test.afterAll(async () => {
    await cleanupMintedSessions();
    await deleteThrowawayUsers();
    await disconnectDb();
  });

  for (const fixture of ROLE_FIXTURES) {
    test(`${fixture.role} signs out completely`, async ({ page, context }) => {
      await signIn(page, fixture);
      const consoleUrl = page.url();

      const control = await clickSignOut(page);
      test.info().annotations.push({ type: "control", description: control });

      // 1. The browser no longer holds the session.
      await expect
        .poll(() => sessionCookie(context), { timeout: 15_000 })
        .toBeFalsy();

      // 2. The user is on the sign-in page.
      await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });

      // 3. Back does not restore the console.
      //
      // This is the assertion that only a browser can make. A soft navigation
      // (router.push) leaves the App Router's cache intact, so Back re-renders
      // the previous console from memory — a signed-out user looking at a
      // populated dashboard. A full-document navigation discards that cache.
      await page.goBack({ waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle").catch(() => {});
      await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });

      // 4. And the console cannot be reached by asking for it directly.
      await page.goto(consoleUrl, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });
    });
  }

  /**
   * The onboarding screen, which is the reason this suite needed to exist.
   *
   * It is the only sign-out in the app that goes through the server action
   * rather than the API route, and it was the only wired control using a soft
   * navigation. Both defects lived here and nowhere else:
   *
   *  - the action was a bare cookie delete, so the LoginSession row stayed open
   *    and the token stayed valid — signing out here revoked nothing;
   *  - router.push("/login") left the App Router cache intact, so Back could
   *    repaint a half-completed onboarding form, with school details already
   *    typed into it, after sign-out.
   *
   * Needs its own account because reaching this screen requires
   * onboardingComplete = false, and completing the flow would mutate it.
   */
  test("onboarding signs out through the server action, and revokes", async ({
    page,
    context,
  }) => {
    const password = "OnboardPass1";
    const user = await createThrowawayUser({
      label: "e2e-onboarding",
      role: "ADMIN",
      password,
      onboardingComplete: false,
    });

    await page.goto("/login");
    await page.locator("#email").fill(user.email);
    await page.locator("#password").fill(password);
    await page.locator('button[type="submit"]').click();

    // The proxy sends an unfinished account here regardless of role.
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 30_000 });

    const token = await sessionCookie(context);
    expect(token, "signing in should have set a session cookie").toBeTruthy();

    await expect
      .poll(() => openSessionCount(token!), { timeout: 10_000 })
      .toBeGreaterThan(0);

    const signOut = page.getByRole("button", { name: /sign out/i });
    await expect(signOut.first()).toBeVisible({ timeout: 30_000 });
    // Two match by design — a sidebar control and an `lg:hidden` mobile one.
    // At this viewport the first is the visible one.
    await signOut.first().click();

    await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });
    await expect.poll(() => sessionCookie(context), { timeout: 15_000 }).toBeFalsy();

    // The server action must close the row, not just drop the cookie.
    await expect
      .poll(() => openSessionCount(token!), { timeout: 10_000 })
      .toBe(0);

    // And Back must not repaint the onboarding form.
    await page.goBack({ waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });
  });

  test("the sign-out control is reachable by keyboard", async ({ page }) => {
    // Sign-out sits behind a dropdown, so "there is a button" is not the same as
    // "someone not using a mouse can sign out".
    const fixture = ROLE_FIXTURES.find((f) => f.role === "TEACHER")!;
    await signIn(page, fixture);

    const accountMenu = page.locator('button[title="Account menu"]');
    await expect(accountMenu.first()).toBeVisible();

    await accountMenu.first().focus();
    await page.keyboard.press("Enter");

    const item = page.getByRole("menuitem", { name: /sign out/i });
    await expect(item).toBeVisible({ timeout: 10_000 });
  });
});
