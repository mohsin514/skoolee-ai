import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  // Verification is a GET that can activate an account: block it explicitly,
  // alongside every POST, even though this informational page needs neither.
  await page.route("**/*", route => route.request().method() === "POST"
    || new URL(route.request().url()).pathname === "/api/auth/verify"
    ? route.abort() : route.continue());
});

test("the existing five-second countdown announces progress and opens login", async ({ page }) => {
  await page.goto("/verify-success");
  await expect(page.getByRole("heading", { name: "Email verified", level: 1 })).toBeVisible();
  const status = page.getByRole("status").filter({ hasText: "Auto-redirecting" });
  await expect(status).toHaveText("Auto-redirecting in 5s");
  await expect(status).toHaveAttribute("aria-atomic", "true");
  await expect(status).toHaveText("Auto-redirecting in 4s");
  await expect(page).toHaveURL(/\/login$/, { timeout: 8000 });
});

test("keyboard login link works early and unmounted countdown does not hijack later navigation", async ({ page }) => {
  await page.goto("/verify-success");
  const login = page.getByRole("link", { name: "Continue to Login" });
  await expect(login).toHaveAttribute("href", "/login");
  await login.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole("link", { name: "Create New Account", exact: true }).click();
  await expect(page).toHaveURL(/\/register$/);
  await page.waitForTimeout(5500);
  await expect(page).toHaveURL(/\/register$/);
});

for (const viewport of [
  { width: 320, height: 480 }, { width: 390, height: 844 },
  { width: 768, height: 600 }, { width: 1440, height: 900 },
]) {
  test(`success content remains reachable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/verify-success");
    await expect(page.getByRole("heading", { name: "Email verified", level: 1 })).toBeVisible();
    const logo = page.getByRole("img", { name: "Skoolee AI", exact: true });
    expect((await logo.boundingBox())?.y).toBeGreaterThanOrEqual(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const login = page.getByRole("link", { name: "Continue to Login" });
    await login.scrollIntoViewIfNeeded();
    await expect(login).toBeInViewport();
    expect((await login.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: test.info().outputPath(`verify-success-${viewport.width}.png`), fullPage: true });
  });
}

test("reduced-motion success feedback keeps its message without spatial or spinner animation", async ({ page }) => {
  const hydrationErrors: string[] = [];
  page.on("console", message => {
    if (/hydrated|hydration/i.test(message.text())) hydrationErrors.push(message.text());
  });
  await page.goto("/verify-success");
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  const heading = page.getByRole("heading", { name: "Email verified", level: 1 });
  await expect(heading).toBeVisible();
  await expect(heading.locator("..")).toHaveCSS("transform", "none");
  await expect(page.getByRole("status").filter({ hasText: "Auto-redirecting" }).locator("svg")).toHaveCSS("animation-name", "none");
  await expect(page.getByRole("status").filter({ hasText: "Auto-redirecting" })).toHaveText("Auto-redirecting in 4s");
  expect(hydrationErrors).toEqual([]);
});

for (const [from, to] of [
  ["/register-split?fixture=1", "/register"],
  ["/sign-in?fixture=1", "/login"],
  ["/sign-in/synthetic/callback?fixture=1", "/login"],
  ["/sign-up?fixture=1", "/register"],
  ["/sign-up/synthetic/callback?fixture=1", "/register"],
]) {
  test(`existing redirect alias ${from} reaches ${to}`, async ({ page }) => {
    await page.goto(from);
    await expect.poll(() => new URL(page.url()).pathname + new URL(page.url()).search).toBe(to);
  });
}
