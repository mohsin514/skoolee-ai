import { test, expect } from "@playwright/test";

// Read-only real app checks. Empty login is client validation only, and the
// invitation has no token. Block all auth/invitation mutations defensively.
for (const width of [390, 768, 1440]) {
  test(`real auth pages retain accessible controls and fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : width === 768 ? 1024 : 1000 });
    const mutations: string[] = [];
    await page.route("**/api/auth/**", route => {
      if (route.request().method() !== "GET") { mutations.push(route.request().url()); return route.abort(); }
      return route.continue();
    });
    await page.route("**/api/invite/**", route => { mutations.push(route.request().url()); return route.abort(); });
    await page.route("**/accept-invite", route => route.request().method() === "POST" ? route.abort() : route.continue());
    await page.goto("/login");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    const email = page.getByLabel("Work Email", { exact: true });
    await expect(email).toBeFocused();
    await expect(email).toHaveAccessibleDescription("Valid email required");
    await expect(page.getByLabel("Password", { exact: true })).toHaveAccessibleDescription("Password required");
    await page.getByRole("button", { name: "Show password", exact: true }).click();
    await expect(page.getByRole("button", { name: "Hide password", exact: true })).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`login-invalid-${width}.png`), fullPage: true });
    await page.goto("/accept-invite");
    const notices = { en: "This invitation link is incomplete", ar: "رابط الدعوة غير مكتمل", ur: "دعوت کا لنک مکمل نہیں" };
    for (const language of ["en", "ar", "ur"] as const) {
      await page.getByRole("combobox").selectOption(language);
      await expect(page.getByRole("main").getByRole("alert")).toContainText(notices[language]);
      await expect(page.getByRole("combobox")).toHaveClass(/sk-select/);
      expect((await page.getByRole("combobox").boundingBox())!.height).toBeGreaterThanOrEqual(48);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.getByRole("combobox").focus();
      await page.screenshot({ path: test.info().outputPath(`invite-no-token-${language}-${width}.png`), fullPage: true });
    }
    expect(mutations).toEqual([]);
  });
}

test("real direct login query announces the existing status after toaster mounts", async ({ page }) => {
  await page.route("**/api/auth/**", route => route.request().method() === "GET" ? route.continue() : route.abort());
  await page.goto("/login?verified=true");
  await expect(page.locator("[data-sonner-toast]")).toHaveText("Account verified. Please log in.");
  await expect(page).toHaveURL(/\/login$/);
});

test("real verification-error redirect shows persistent focused feedback and keeps unrelated query", async ({ page }) => {
  await page.route("**/api/auth/**", route => route.abort());
  await page.goto("/login?error=Invalid%20verification%20link&redirect=%2Fparent");
  await expect(page.locator("#login-error")).toHaveText("Invalid verification link");
  await expect(page.locator("#login-error")).toBeFocused();
  await expect(page).toHaveURL(/\/login\?redirect=%2Fparent$/);
  await page.screenshot({ path: test.info().outputPath("verification-error-focused.png"), fullPage: true });
});
