import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-491 on the isolated app with synthetic data: the guardian form reflows inside a 320px viewport with text at
// 200% in English, Arabic and Urdu; every field stays inside the viewport, keyboard focus is never hidden behind
// the sticky actions, and the review dialog fits too.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== (process.env.QA_DB_PORT || "55438") || url.pathname !== "/postgres") throw Error(`Only isolated local DB ${process.env.QA_DB_PORT || "55438"} is allowed`);
const base = process.env.GUARDIAN_TEST_APP || "http://localhost:3107";
const evidence = process.env.GUARDIAN_EVIDENCE_DIR || "/tmp/sko491-evidence";
const db = new PrismaClient(), password = "SyntheticReflow491!";
const schoolId = `gr491-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), studentId = randomUUID();
const admins = new Map<string, string>();
let browser: Browser;

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Reflow School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } as never });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Reflow campus", regId: campusId, city: "Lahore" } });
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Grade 5", section: "B", academicYear: 2026 } });
  await db.student.create({ data: { id: studentId, schoolId, campusId, classId, fullName: "Synthetic Hira Qureshi", rollNo: "501", gender: "OTHER", status: "active" } as never });
  for (const lang of ["en", "ar", "ur"]) {
    const email = `${randomUUID()}@example.invalid`;
    await db.user.create({ data: { email, password: await bcrypt.hash(password, 10), fullName: `Synthetic admin ${lang}`, role: "ADMIN", schoolId, campusId, isActive: true, onboardingComplete: true, preferredLanguage: lang } });
    admins.set(lang, email);
  }
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await db.school.delete({ where: { id: schoolId } }).catch(() => undefined); await db.$disconnect(); });

async function open(lang: string): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 320, height: 720 }, reducedMotion: "reduce" });
  assert.equal((await ctx.request.post(base + "/api/auth/login", { data: { email: admins.get(lang)!, password } })).status(), 200);
  const { secret } = await (await ctx.request.post(base + "/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
  if (secret) { await ctx.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(secret.replace(/\s+/g, "")) } }); await ctx.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } }); }
  const page = await ctx.newPage();
  // /dashboard/guardians is only a redirect now (§6.1); the screen lives in the campus console.
  await page.goto(`${base}/admin?view=guardians`);
  await page.locator("#guardian-child").waitFor({ timeout: 60_000 });
  await page.locator("#guardian-child").selectOption(studentId);
  await page.locator("#guardian-editor > form").first().waitFor();
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await page.waitForTimeout(300);
  return page;
}

for (const lang of ["en", "ar", "ur"]) {
  test(`${lang}: the guardian form reflows at 320px with 200% text and keeps focus visible`, async () => {
    const page = await open(lang);
    const width = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, view: window.innerWidth }));
    assert.ok(width.doc <= width.view + 1, `no horizontal scroll: document ${width.doc}px in a ${width.view}px viewport`);
    const fields = await page.locator("#guardian-editor > form").locator("input, select, textarea").evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width) }; }));
    assert.ok(fields.length >= 6);
    for (const f of fields) assert.ok(f.left >= -1 && f.right <= 321, `field ${JSON.stringify(f)} inside the viewport`);
    await page.locator("#guardian-editor").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${evidence}/${lang}-320-200-text-form.png` });
    // Tab through every field: none ends up under the sticky action bar.
    const bar = page.locator("#guardian-editor > form > div.sticky");
    await page.locator("#guardian-editor > form input").first().focus();
    for (let i = 0; i < 8; i++) {
      const hidden = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null, bar = document.querySelector("#guardian-editor > form > div.sticky");
        if (!el || !bar || bar.contains(el)) return false;
        const a = el.getBoundingClientRect(), b = bar.getBoundingClientRect();
        return a.bottom > b.top && a.top < b.bottom;
      });
      assert.equal(hidden, false, `focused field ${i} is not covered by the sticky actions`);
      await page.keyboard.press("Tab");
    }
    assert.ok(await bar.count());
    // The review dialog fits as well.
    await page.locator("#guardian-editor > form input").first().fill("Synthetic Reflow Guardian");
    await page.locator('#guardian-editor input[type="email"]').fill(`${randomUUID()}@example.invalid`);
    await page.locator("#guardian-editor textarea").fill("Synthetic reflow check reason");
    await page.locator('#guardian-editor button[type="submit"]').click();
    const dialog = page.locator("#guardian-preview-title");
    await dialog.waitFor({ timeout: 30_000 }).catch(async e => { await page.screenshot({ path: `${evidence}/${lang}-debug-review.png`, fullPage: true }); console.log("ALERTS", await page.locator('[role="alert"]').allInnerTexts()); throw e; });
    const box = await page.evaluate(() => { const d = document.querySelector("#guardian-preview-title")!.closest('[role="dialog"]') ?? document.querySelector("#guardian-preview-title")!.parentElement!; const r = d.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), doc: document.documentElement.scrollWidth }; });
    assert.ok(box.left >= -1 && box.right <= 321 && box.doc <= 321, `review dialog inside the viewport ${JSON.stringify(box)}`);
    await page.screenshot({ path: `${evidence}/${lang}-320-200-text-review.png` });
    await page.context().close();
  });
}
