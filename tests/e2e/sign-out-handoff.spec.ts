/**
 * SKAI-1021: sign out, then sign straight back in as someone at ANOTHER school.
 * The tab must end up as the second account only, and the first account's token
 * must be dead server-side — including when a stale cookie is still in the browser.
 */
import { test, expect } from "@playwright/test";

import { disconnectDb, sessionRowsForToken } from "../support/db";
import { makeHandoffSchool, makeHandoffUser, removeHandoffData, sessionToken, submitLogin, type HandoffAccount } from "../support/handoff";
import { SESSION_COOKIE_NAME } from "../../src/lib/auth/session-cookie";

const PREFIX = "skai1021-";
let alpha: HandoffAccount;
let beta: HandoffAccount;

test.describe("sign-out then sign-in as another tenant", () => {
  test.beforeAll(async () => {
    alpha = await makeHandoffUser(PREFIX, await makeHandoffSchool(PREFIX, "alpha"), "alpha-accountant", "ACCOUNTANT");
    beta = await makeHandoffUser(PREFIX, await makeHandoffSchool(PREFIX, "beta"), "beta-accountant", "ACCOUNTANT");
  });

  test.afterAll(async () => {
    await removeHandoffData(PREFIX);
    await disconnectDb();
  });

  test("immediate sign-in after sign-out never resumes the previous school's session", async ({ page }) => {
    await page.goto("/login");
    await submitLogin(page, alpha);
    await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
    const firstToken = await sessionToken(page);
    expect(firstToken).toBeTruthy();

    // Sign out through the real control, and sign in again the moment the form is usable.
    const menu = page.getByRole("button", { name: "Account menu", exact: true });
    await expect(menu).toBeVisible({ timeout: 45_000 });
    await page.keyboard.press("Escape");
    await menu.click();
    await page.getByRole("menuitem", { name: /sign out/i }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });
    await submitLogin(page, beta);
    await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });

    const session = await page.evaluate(() => fetch("/api/auth/session", { cache: "no-store" }).then((r) => r.json()));
    expect(session.user?.email).toBe(beta.email);
    expect(session.user?.schoolId).toBe(beta.schoolId);
    expect(await sessionToken(page)).not.toBe(firstToken);
    // The first identity's token is dead server-side, not merely forgotten by the browser…
    expect((await sessionRowsForToken(firstToken!)).every((r) => !r.isActive)).toBe(true);
    // …so re-presenting it cannot resume it.
    const replay = await page.request.get("/api/auth/session", { headers: { cookie: `${SESSION_COOKIE_NAME}=${firstToken}` } });
    expect(replay.status()).toBe(401);
  });

  test("a stale session cookie still in the browser is revoked when someone else signs in", async ({ page, context }) => {
    await page.goto("/login");
    await submitLogin(page, alpha);
    await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
    const firstToken = (await sessionToken(page))!;

    // A sign-out that never reached the server: the cookie is still present when /login is used.
    await page.goto("/login");
    await submitLogin(page, beta);
    await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
    expect((await sessionRowsForToken(firstToken)).every((r) => !r.isActive)).toBe(true);
    await context.clearCookies();
  });
});
