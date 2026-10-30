import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser } from "playwright";
import bcrypt from "bcryptjs";

// SKO-457: every auth screen in EN/AR/UR at the ticket's sizes (and a 200%-zoom equivalent),
// with reduced motion; plus a keyboard-only sign-in with visible focus.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== (process.env.QA_DB_PORT || "55438") || url.pathname !== "/postgres") throw Error(`Only isolated local DB ${process.env.QA_DB_PORT || "55438"} is allowed`);
const base = process.env.AUTH_TEST_APP || "http://localhost:3107";
const evidence = process.env.AUTH_EVIDENCE_DIR || "/tmp/sko457-evidence";
const db = new PrismaClient(), password = "SyntheticMatrix457!";
const schoolId = `auth457m-${randomUUID()}`, inviteToken = randomUUID();
let browser: Browser, teacherEmail = "";

const SIZES = [
  { name: "320", width: 320, height: 720 },
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1440", width: 1440, height: 1000 },
  // 1280×1000 at 200% browser zoom lays out as a 640×500 CSS viewport.
  { name: "zoom200", width: 640, height: 500 },
];
const PAGES = ["/login", "/register", "/forgot-password", "/verify-success", `/accept-invite?token=${inviteToken}`];

before(async () => {
  const campusId = randomUUID();
  await db.school.create({ data: { id: schoolId, name: "Synthetic Juniper School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Dubai", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Juniper Main", regId: campusId, city: "Dubai" } });
  await db.staffInvitation.create({ data: { schoolId, email: `${randomUUID()}@example.invalid`, role: "TEACHER", campusId, token: inviteToken, expiresAt: new Date(Date.now() + 86_400_000), status: "pending" } });
  teacherEmail = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { email: teacherEmail, password: await bcrypt.hash(password, 12), fullName: "Synthetic keyboard teacher", role: "TEACHER", schoolId, campusId, isActive: true, emailVerifiedAt: new Date(), onboardingComplete: true } });
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await db.user.deleteMany({ where: { schoolId } }); await db.school.delete({ where: { id: schoolId } }).catch(() => undefined); await db.$disconnect(); });

for (const language of ["en", "ar", "ur"] as const) {
  test(`auth screens in ${language.toUpperCase()} fit every size without horizontal scroll and read in the right direction`, async () => {
    const failures: string[] = [];
    for (const size of SIZES) {
      const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, reducedMotion: "reduce" });
      await ctx.addCookies([{ name: "skoolee-lang", value: language, url: base }]);
      const page = await ctx.newPage(), errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      for (const path of PAGES) {
        await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
        const state = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth - window.innerWidth,
          dir: document.querySelector("main")?.closest("[dir]")?.getAttribute("dir") ?? document.documentElement.getAttribute("dir"),
          heading: Boolean(document.querySelector("h1, h2")),
        }));
        const label = `${path.split("?")[0]} @${size.name}`;
        if (state.overflow > 1) failures.push(`${label}: ${state.overflow}px horizontal overflow`);
        if (state.dir !== (language === "en" ? "ltr" : "rtl")) failures.push(`${label}: dir=${state.dir}`);
        if (!state.heading) failures.push(`${label}: no heading`);
        if (path === "/login" && (size.name === "320" || size.name === "zoom200")) await page.screenshot({ path: `${evidence}/matrix-login-${language}-${size.name}.png` });
      }
      if (errors.length) failures.push(`@${size.name}: ${errors.join("; ")}`);
      await ctx.close();
    }
    assert.deepEqual(failures, []);
  });
}

test("a keyboard-only user signs in with visible focus on every stop", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" }), page = await ctx.newPage();
  await page.goto(`${base}/login`, { waitUntil: "networkidle" });
  const stops: Array<{ id: string; tag: string; visible: boolean }> = [];
  // A focus indicator is any visible change between the focused and unfocused rendering.
  // Passed as source text: tsx would otherwise inject a helper the page does not have.
  const focusVisible = () => page.evaluate(`(() => {
    const element = document.activeElement;
    if (!element || element === document.body || element.tagName === "NEXTJS-PORTAL") return { id: "", tag: "SKIP", visible: true };
    // A compound field draws its indicator on the shared surface (.sk-input-group:focus-within).
    const surface = element.closest(".sk-input-group") || element;
    const read = () => [element, surface].map(node => { const style = getComputedStyle(node); return [style.outlineStyle, style.outlineWidth, style.outlineColor, style.boxShadow, style.borderColor, style.backgroundColor].join("|"); }).join("||");
    const focused = read();
    element.blur();
    const resting = read();
    element.focus({ preventScroll: true });
    return { id: element.id || element.getAttribute("name") || (element.textContent || "").trim().slice(0, 20), tag: element.tagName, visible: focused !== resting };
  })()`) as Promise<{ id: string; tag: string; visible: boolean }>;
  // Tab until the email field, type, Tab to the password, type, Enter.
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press("Tab");
    const stop = await focusVisible(); stops.push(stop);
    if (await page.evaluate(() => (document.activeElement as HTMLInputElement | null)?.type === "email")) break;
  }
  assert.equal(await page.evaluate(() => (document.activeElement as HTMLInputElement | null)?.type), "email", "email is reachable by Tab");
  await page.keyboard.type(teacherEmail);
  for (let i = 0; i < 6 && await page.evaluate(() => (document.activeElement as HTMLInputElement | null)?.type !== "password"); i++) { await page.keyboard.press("Tab"); stops.push(await focusVisible()); }
  assert.equal(await page.evaluate(() => (document.activeElement as HTMLInputElement | null)?.type), "password", "password follows email");
  await page.keyboard.type(password);
  await page.keyboard.press("Enter");
  await page.waitForURL(target => target.pathname.startsWith("/teacher"), { timeout: 20_000 });
  const hidden = stops.filter(stop => !stop.visible);
  assert.deepEqual(hidden, [], "every focused control shows a focus indicator");
  await ctx.close();
});
