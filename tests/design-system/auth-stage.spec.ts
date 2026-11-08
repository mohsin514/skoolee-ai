/**
 * Front Desk integration gate (auth redesign §3.6). Goes green once the splash,
 * login, register, forgot-password and verify-success pages are built on the
 * shared AuthShell / AuthMascot foundation.
 *
 *   TEST_BASE_URL=http://localhost:3005 npx playwright test --config tests/design-system/playwright.config.ts auth-stage
 *
 * Read-only: every POST and the token-verification GET are blocked, exactly
 * as verification.spec.ts does. Reduced motion comes from the config.
 */
import { test, expect, type Page } from "@playwright/test";

const ROUTES = ["/", "/login", "/register", "/forgot-password", "/verify-success"] as const;
type Lang = "en" | "ar" | "ur";

test.describe.configure({ timeout: 180_000 });

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/*", route => route.request().method() === "POST"
    || new URL(route.request().url()).pathname === "/api/auth/verify"
    ? route.abort() : route.continue());
});

async function open(page: Page, route: string, lang: Lang) {
  const origin = new URL(test.info().project.use.baseURL ?? process.env.TEST_BASE_URL ?? "http://localhost:3005").origin;
  await page.context().addCookies([{ name: "skoolee-lang", value: lang, url: origin }]);
  await page.goto(route, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.locator("main").first().waitFor({ state: "attached", timeout: 60_000 });
}

const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

for (const lang of ["en", "ar"] as const) {
  for (const route of ROUTES) {
    test(`${route} (${lang}): one shell, one face, no loops, safe links`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await open(page, route, lang);

      // 1. main carries lang and dir (cookie-driven on the server).
      const main = page.locator("main").first();
      await expect(main).toHaveAttribute("lang", lang);
      await expect(main).toHaveAttribute("dir", lang === "en" ? "ltr" : "rtl");

      // 2. AuthShell: the desk section's ONLY direct child is the column.
      if (route !== "/") {
        await expect(page.locator("main > section").last().locator(":scope > div")).toHaveCount(1);
      }

      // 4. Exactly one Skoolee face, and it is the live mascot.
      await expect(page.getByRole("img", { name: "Skoolee AI", exact: true })).toHaveCount(1);
      await expect(page.locator("[data-sk-mascot]")).toHaveCount(1);

      // 5. The mascot never speaks: no status, alert or live region inside it.
      await expect(page.locator("[data-sk-mascot] :is([role=status], [role=alert], [aria-live])")).toHaveCount(0);

      // 3. Zero running infinite animations under reduced motion (the login AC21 expression).
      await page.waitForTimeout(400);
      const looping = await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === "running" && animation.effect?.getComputedTiming().iterations === Infinity).length);
      expect(looping).toBe(0);

      // 7. New-tab links never leak the opener.
      const rels = await page.locator("a[target=_blank]").evaluateAll(links => links.map(link => link.getAttribute("rel") ?? ""));
      for (const rel of rels) expect(rel.split(/\s+/)).toContain("noopener");
    });

    test(`${route} (${lang}): no horizontal scroll at 320, 360, 768 and 1440`, async ({ page }) => {
      for (const width of [320, 360, 768, 1440]) {
        await page.setViewportSize({ width, height: width < 768 ? 740 : 900 });
        await open(page, route, lang);
        expect(await noHorizontalScroll(page), `${route} @${width}`).toBe(true);
      }
    });
  }
}

for (const lang of ["ar", "ur"] as const) {
  for (const route of ROUTES) {
    test(`${route} (${lang}): no horizontal scroll at 360 with a 200% root font`, async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 740 });
      await open(page, route, lang);
      await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
      await expect.poll(() => noHorizontalScroll(page)).toBe(true);
    });
  }
}
