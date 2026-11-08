#!/usr/bin/env node
/**
 * Full-page screenshots of every AI Workflows surface, per demo role and viewport, for visual review
 * (before/after a UI pass). Runs against the seeded Al-Noor Grammar demo school
 * (scripts/demo/seed-ai-workflows-demo.ts) on a local QA app:
 *
 *   DEMO_PASSWORD=… node scripts/qa/ai-workflows-capture.mjs http://localhost:3131 <outDir> [--ask]
 *
 * --ask also types one request per role into Ask and captures the Run Sheet (needs a live AI key on the app).
 * Pages scroll inside an inner container, so each shot first lets every scroller grow to its content.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const [base = "http://localhost:3131", out = "test-results/ai-workflows-capture"] = process.argv.slice(2).filter(arg => !arg.startsWith("--"));
const ask = process.argv.includes("--ask");
const password = process.env.DEMO_PASSWORD;
if (!password) { console.error("DEMO_PASSWORD is required"); process.exit(2); }
mkdirSync(out, { recursive: true });

const VIEWPORTS = { desktop: { width: 1440, height: 900 }, tablet: { width: 768, height: 1024 }, phone: { width: 390, height: 844 } };
const ROLES = [
  { key: "admin", home: "/admin", routes: ["/ai", "/ai/setup", "/ai/can-do", "/ai/waiting"], request: "create class grade 12 with sections A and B", viewports: ["desktop", "tablet", "phone"] },
  { key: "approver", home: "/admin", routes: ["/ai/waiting"], viewports: ["desktop"] },
  { key: "teacher", home: "/teacher", routes: ["/ai", "/ai/setup", "/ai/can-do"], request: "آج 7B کی حاضری لگا دیں، علی رضا غیر حاضر ہے", viewports: ["desktop", "phone"] },
  { key: "accountant", home: "/accountant", routes: ["/ai", "/ai/setup", "/ai/waiting"], request: "Show fee defaulters for this month", viewports: ["desktop", "phone"] },
  { key: "parent", home: "/parent", routes: ["/ai", "/ai/setup"], request: "كم الرسوم المستحقة على ابني؟", viewports: ["desktop", "phone"] },
  { key: "librarian", home: "/librarian", routes: ["/ai", "/ai/setup"], request: "Add 3 copies of Gulliver's Travels", viewports: ["phone"] },
];

/**
 * Consoles scroll inside a fixed-height shell, so a fullPage shot stops at the fold. Grow the viewport by the
 * tallest inner scroller's hidden height instead (capped), so the shell lays out at the content's height.
 */
async function unroll(page, viewport) {
  const hidden = await page.evaluate(() => {
    let extra = 0;
    for (const element of document.querySelectorAll("*")) {
      const style = getComputedStyle(element);
      if (/(auto|scroll)/.test(style.overflowY) && element.tagName !== "TEXTAREA") extra = Math.max(extra, element.scrollHeight - element.clientHeight);
    }
    return extra;
  });
  if (hidden > 4) {
    await page.setViewportSize({ width: viewport.width, height: Math.min(viewport.height + hidden + 40, 9000) });
    await page.waitForTimeout(500);
  }
}

/** The first-login launch guide opens over console pages (sometimes a moment after load); close it until it stays closed. */
async function dismissGuide(page) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const open = await page.locator("[data-guide-stage], [role=dialog]").first().waitFor({ state: "visible", timeout: attempt === 0 ? 2_500 : 1_200 }).then(() => true, () => false);
    if (!open) break;
    await page.keyboard.press("Escape").catch(() => undefined);
    await page.locator("[data-guide-stage]").waitFor({ state: "detached", timeout: 4_000 }).catch(() => undefined);
    await page.locator(".animate-backdrop-exit").waitFor({ state: "detached", timeout: 4_000 }).catch(() => undefined);
  }
}

async function settle(page) {
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
  await dismissGuide(page);
  await page.waitForTimeout(500);
}

async function shot(page, name, viewport) {
  await settle(page);
  await unroll(page, viewport);
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
  await page.setViewportSize(viewport);
  console.log("·", name);
}

const browser = await chromium.launch();
for (const role of ROLES) {
  for (const viewportName of role.viewports) {
    const context = await browser.newContext({ viewport: VIEWPORTS[viewportName], reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto(`${base}/login`);
    await page.locator("#email").fill(`demo-alnoor-${role.key}@example.invalid`);
    await page.locator("#password").fill(password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(url => !url.pathname.startsWith("/login"), { timeout: 60_000 });
    if (page.url().includes("/protect-account")) {
      await page.getByRole("button", { name: /later|لاحقاً|بعد میں/i }).click();
      await page.waitForURL(url => !url.pathname.startsWith("/protect-account"), { timeout: 30_000 });
    }
    const prefix = `${role.key}-${viewportName}`;
    await page.goto(`${base}${role.home}`, { timeout: 120_000 });
    await shot(page, `${prefix}-home`, VIEWPORTS[viewportName]);
    for (const route of role.routes) {
      await page.goto(`${base}${route}`, { timeout: 120_000 });
      await shot(page, `${prefix}-${route.replace(/^\//, "").replace(/\//g, "_") || "root"}`, VIEWPORTS[viewportName]);
    }
    if (ask && role.request && viewportName === role.viewports[0]) {
      await page.goto(`${base}/ai`, { timeout: 120_000 });
      await settle(page);
      const box = page.locator("[data-ai-request]");
      if (await box.count()) {
        await box.fill(role.request);
        await dismissGuide(page);
        await page.locator("[data-ai-start]").click({ timeout: 15_000 }).catch(async () => { await dismissGuide(page); await box.press("Enter"); });
        await page.waitForSelector("[data-ai-run-sheet]", { timeout: 30_000 }).catch(() => undefined);
        await page.waitForFunction(() => !["PLANNING", "RUNNING"].includes(document.querySelector("[data-ai-run-sheet]")?.getAttribute("data-ai-status") ?? ""), undefined, { timeout: 45_000 }).catch(() => undefined);
        await shot(page, `${prefix}-ask-run`, VIEWPORTS[viewportName]);
      }
    }
    await context.close();
  }
}
await browser.close();
