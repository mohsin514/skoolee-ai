import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { SignJWT } from "jose";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { examProctorFixture, removeProctorFixture, type ProctorFixture } from "./exam-proctor-fixture";

// This suite exercises the integrated staff route, never the isolated intro probe or saved tokens.
const local = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
const origin = process.env.SCHOOL_AI_TEST_ORIGIN || "http://localhost:3106";
if (process.env.DATABASE_URL !== local || process.env.DIRECT_URL !== local) throw new Error("Use isolated PG55438 only.");
const db = new PrismaClient();
let fixture: ProctorFixture;
type IntroAudit = {
  mounts: number; mounted: number | null; ended: number | null; mode: string | null;
  robot: boolean; rings: number; hidden: string | null; focusables: number;
  samples: Array<{ opacity: number; transform: string; animations: number; painted: boolean }>;
  inputs: Array<{ type: string; overlayAfterPropagation: boolean }>;
};
type AuditedWindow = typeof window & { __integratedIntro: IntroAudit };
async function signIn(context: BrowserContext, user: AuthUser) {
  const token = await new SignJWT({ ...user, mfaVerified: true, onboardingComplete: true, schoolStatus: "ACTIVE" })
    .setProtectedHeader({ alg: "HS256" }).setJti(randomUUID()).setIssuedAt().setExpirationTime("2h")
    .sign(new TextEncoder().encode("school-ai-isolated-browser-test-secret-only"));
  await db.loginSession.create({ data: { userId: user.userId, schoolId: user.schoolId,
    tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 7200000), isActive: true } });
  await context.clearCookies();
  await context.addCookies([{ name: "skoolee_token", value: token, url: origin, httpOnly: true, sameSite: "Lax" }]);
}
async function audit(page: Page) {
  await page.addInitScript(() => {
    const record: IntroAudit = { mounts: 0, mounted: null, ended: null, mode: null, robot: false, rings: 0, hidden: null, focusables: 0, samples: [], inputs: [] };
    (window as AuditedWindow).__integratedIntro = record;
    let active = false;
    const sample = () => {
      const overlay = document.querySelector("[data-studio-intro]");
      const mark = overlay?.querySelector("[data-studio-intro-mark]");
      if (mark) {
        const style = getComputedStyle(mark);
        record.samples.push({ opacity: Number(style.opacity), transform: style.transform, animations: overlay!.getAnimations({ subtree: true }).length, painted: mark.getClientRects().length > 0 });
      }
      if (overlay) requestAnimationFrame(sample);
    };
    new MutationObserver(() => {
      const overlay = document.querySelector("[data-studio-intro]");
      if (overlay && !active) {
        active = true; record.mounts++; record.mounted = performance.now(); record.ended = null;
        record.mode = overlay.getAttribute("data-studio-intro");
        record.robot = !!overlay.querySelector("[data-studio-intro-mark] svg.lucide-bot");
        record.rings = overlay.querySelectorAll("[data-studio-intro-ring]").length;
        record.hidden = overlay.getAttribute("aria-hidden");
        record.focusables = overlay.querySelectorAll("button,a,input,select,textarea,[tabindex]").length;
        sample();
      } else if (!overlay && active) { active = false; record.ended = performance.now(); }
    }).observe(document, { subtree: true, childList: true });
    // Window bubble listeners see the actual event after the intro's document-capture skip.
    for (const type of ["pointerdown", "keydown", "wheel", "scroll"]) window.addEventListener(type, () => {
      record.inputs.push({ type, overlayAfterPropagation: !!document.querySelector("[data-studio-intro]") });
    });
  });
}
const readAudit = (page: Page) => page.evaluate(() => (window as AuditedWindow).__integratedIntro);
async function enter(page: Page, visible = true) {
  await page.goto("/ai/studio", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => (window as AuditedWindow).__integratedIntro?.mounted !== null);
  if (visible) await page.locator("[data-studio-intro]").waitFor({ state: "visible", timeout: 1800 });
}
async function settled(page: Page) {
  await page.waitForFunction(() => (window as AuditedWindow).__integratedIntro?.ended !== null);
  await expect(page.locator("[data-studio-overview]")).toBeVisible();
}
async function attachAudit(page: Page, name: string) {
  const path = test.info().outputPath(`${name}.json`);
  await writeFile(path, JSON.stringify(await readAudit(page), null, 2));
  await test.info().attach(name, { path, contentType: "application/json" });
}

test.beforeAll(async () => { fixture = await examProctorFixture(db, { enabled: false }); });
test.beforeEach(async ({ context, page }) => { await signIn(context, fixture.admin); await page.emulateMedia({ reducedMotion: "no-preference" }); await audit(page); });
test.afterAll(async () => { if (fixture) await removeProctorFixture(db, fixture.schoolId); await db.$disconnect(); await prisma.$disconnect(); });

test("real studio animates its robot and releases the workspace within 1800ms", async ({ page }) => {
  await enter(page);
  await page.screenshot({ path: "test-results/school-ai/studio-robot-introduction.png", animations: "allow" });
  await settled(page);
  const data = await readAudit(page);
  expect(data.mode).toBe("sequence"); expect(data.robot).toBe(true); expect(data.rings).toBe(2);
  expect(data.hidden).toBe("true"); expect(data.focusables).toBe(0);
  expect(data.ended! - data.mounted!).toBeLessThanOrEqual(1800);
  expect(data.ended! - data.mounted!).toBeGreaterThan(850);
  expect(data.samples.some(frame => frame.opacity >= 0.95 && frame.painted)).toBe(true);
  expect(new Set(data.samples.map(frame => frame.transform)).size).toBeGreaterThan(2);
  await expect(page.locator("[data-exam-studio] h1")).toBeFocused();
  await attachAudit(page, "real-studio-motion-timing");
});

test("a real pointer input dismisses the intro before the event finishes propagating", async ({ page }) => {
  await enter(page);
  await page.mouse.click(30, 30);
  const data = await readAudit(page);
  expect(data.inputs.find(event => event.type === "pointerdown")).toEqual({ type: "pointerdown", overlayAfterPropagation: false });
  expect(data.ended! - data.mounted!).toBeLessThan(850);
  await expect(page.locator("[data-studio-intro]")).toHaveCount(0);
  await expect(page.locator("[data-studio-overview]")).toBeVisible();
  await attachAudit(page, "real-studio-pointer-skip");
});

test("keyboard, wheel and scroll skip in the same event without swallowing input", async ({ page }) => {
  for (const type of ["keydown", "wheel", "scroll"] as const) {
    if (type !== "keydown") await page.evaluate(() => sessionStorage.clear());
    if (type === "scroll") await page.setViewportSize({ width: 1280, height: 400 });
    await enter(page);
    if (type === "keydown") await page.keyboard.press("Shift");
    else if (type === "wheel") await page.mouse.wheel(0, 1);
    else await page.evaluate(() => {
      let scroller = document.querySelector("[data-exam-studio]")?.parentElement;
      const inspected: string[] = [];
      while (scroller) {
        const style = getComputedStyle(scroller);
        inspected.push(`${scroller.tagName} ${style.overflowY} ${scroller.scrollHeight}/${scroller.clientHeight}`);
        if (["auto", "scroll"].includes(style.overflowY) && scroller.scrollHeight > scroller.clientHeight) break;
        scroller = scroller.parentElement;
      }
      if (!scroller) throw new Error(`Studio scrolling surface was not found: ${inspected.join(", ")}`);
      // Element scroll does not bubble. At-target observes it after the document capture listener.
      scroller.addEventListener("scroll", () => {
        (window as AuditedWindow).__integratedIntro.inputs.push({ type: "scroll", overlayAfterPropagation: !!document.querySelector("[data-studio-intro]") });
      }, { once: true });
      scroller.scrollTop = 100;
    });
    await expect.poll(async () => (await readAudit(page)).inputs.some(event => event.type === type)).toBe(true);
    const data = await readAudit(page);
    expect(data.inputs.find(event => event.type === type)?.overlayAfterPropagation).toBe(false);
    expect(data.ended! - data.mounted!).toBeLessThan(850);
    await expect(page.locator("[data-studio-intro]")).toHaveCount(0);
    await attachAudit(page, `real-studio-${type}-skip`);
  }
});

test("reduced motion renders only an unanimated static robot frame", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await enter(page, false); await settled(page);
  const data = await readAudit(page);
  expect(data.mode).toBe("static"); expect(data.robot).toBe(true); expect(data.rings).toBe(0);
  expect(data.samples.length).toBeGreaterThan(0);
  expect(data.samples.every(frame => frame.transform === "none" && frame.opacity === 1 && frame.animations === 0)).toBe(true);
  expect(data.ended! - data.mounted!).toBeLessThan(200);
  await attachAudit(page, "real-studio-reduced-motion");
});

test("same account suppresses replay on reload while another staff account has its own session", async ({ page, context }) => {
  await enter(page); await settled(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-studio-overview]")).toBeVisible();
  // A real workspace action confirms hydration, independently of browser focus restoration.
  await page.getByRole("button", { name: "Evidence", exact: true }).click();
  await expect(page.getByRole("button", { name: "Add text manually", exact: true })).toBeVisible();
  expect((await readAudit(page)).mounts).toBe(0);
  await signIn(context, fixture.teacher);
  await enter(page); await settled(page);
  expect((await readAudit(page)).mounts).toBe(1);
  expect(await page.evaluate(id => sessionStorage.getItem(`skoolee:exam-studio-intro:${id}`), fixture.admin.userId)).toBe("played");
  expect(await page.evaluate(id => sessionStorage.getItem(`skoolee:exam-studio-intro:${id}`), fixture.teacher.userId)).toBe("played");
  await attachAudit(page, "real-studio-account-isolation");
});

test("a live candidate attempt never mounts an intro and answer saving remains available", async ({ page, context }) => {
  await signIn(context, fixture.learner);
  await page.goto(`/ai/exams/${fixture.assignment.id}`);
  await expect(page.locator("fieldset#exam-answer-q1")).toBeVisible();
  expect((await readAudit(page)).mounts).toBe(0);
  await page.locator("fieldset#exam-answer-q1").getByRole("button", { name: "4", exact: true }).click();
  await expect(page.getByText("Saved to server", { exact: true })).toBeVisible();
  expect((await readAudit(page)).mounts).toBe(0);
  expect((await db.schoolAiExamAttempt.findUniqueOrThrow({ where: { id: fixture.attempt!.id } })).responses).toEqual({ q1: "a1" });
  await attachAudit(page, "live-exam-no-intro");
});
