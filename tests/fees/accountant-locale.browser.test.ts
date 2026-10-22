import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";
import { translateUi } from "../../src/lib/locale/ui-messages";

// SKO-497 on the isolated app with synthetic data: the accountant's fee-structure sub-navigation and console
// branding follow the saved Arabic or Urdu display language, the active tab and keyboard switching still work,
// the sidebar has no untranslated links, and the school's own name is shown verbatim.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.ACCOUNTANT_TEST_APP || "http://localhost:3107";
const evidence = process.env.ACCOUNTANT_EVIDENCE_DIR || "/tmp/sko497-evidence";
const db = new PrismaClient(), password = "SyntheticAccountant497!";
const schoolId = `acc497-${randomUUID()}`, campusId = randomUUID(), SCHOOL = "Synthetic Cedar Grammar School";
const users = new Map<string, string>();
let browser: Browser;
// role-ux §8.2 / M75: Fee setup sections are ViewTabs (role="tab", aria-selected) with sentence-case names.
const TABS = ["Fee types", "Fee groups", "Amounts", "Class groups", "Discounts", "Carry forward", "Fine rules", "Class structures"];

before(async () => {
  await db.school.create({ data: { id: schoolId, name: SCHOOL, slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } as never });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Cedar campus", regId: campusId, city: "Lahore" } });
  for (const lang of ["ar", "ur"]) {
    const email = `${randomUUID()}@example.invalid`;
    await db.user.create({ data: { email, password: await bcrypt.hash(password, 10), fullName: `Synthetic accountant ${lang}`, role: "ACCOUNTANT", schoolId, campusId, isActive: true, onboardingComplete: true, preferredLanguage: lang } });
    users.set(lang, email);
  }
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await db.school.delete({ where: { id: schoolId } }).catch(() => undefined); await db.$disconnect(); });

for (const lang of ["ar", "ur"] as const) {
  test(`${lang}: fee-structure tabs, console branding and sidebar are translated; tabs still switch by keyboard`, async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "en-US", reducedMotion: "reduce" });
    assert.equal((await ctx.request.post(base + "/api/auth/login", { data: { email: users.get(lang)!, password } })).status(), 200);
    const { secret } = await (await ctx.request.post(base + "/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
    if (secret) { await ctx.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(secret.replace(/\s+/g, "")) } }); await ctx.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } }); }
    const page = await ctx.newPage();
    await page.goto(`${base}/accountant?view=fee-structures`);
    const first = page.getByRole("tab", { name: translateUi("Fee types", lang) });
    await first.waitFor({ timeout: 60_000 });
    assert.equal(await page.evaluate(() => document.documentElement.dir), "rtl");
    for (const tab of TABS) {
      const label = translateUi(tab, lang);
      assert.notEqual(label, tab, `${tab} has a ${lang} translation`);
      assert.equal(await page.getByRole("tab", { name: label, exact: true }).count(), 1, `${tab} shows as ${label}`);
      assert.equal(await page.getByRole("tab", { name: tab, exact: true }).count(), 0, `${tab} is not shown in English`);
    }
    assert.equal(await first.getAttribute("aria-selected"), "true");
    // Keyboard: focus Carry Forward and press Enter; it becomes the active tab.
    const carry = page.getByRole("tab", { name: translateUi("Carry forward", lang), exact: true });
    await carry.focus(); await page.keyboard.press("Enter");
    assert.equal(await carry.getAttribute("aria-selected"), "true");
    assert.equal(await first.getAttribute("aria-selected"), "false");
    const text = await page.locator("body").innerText();
    assert.ok(!/Finance desk/.test(text), "console branding is translated");
    assert.ok(text.includes(translateUi("Finance desk", lang)));
    for (const english of ["Integrations", "Identity and roster", "Improvement evidence", "Group policy"]) assert.ok(!text.includes(english), `sidebar has no untranslated "${english}"`);
    assert.ok(text.includes(SCHOOL), "the school's own name is shown verbatim");
    await page.screenshot({ path: `${evidence}/${lang}-fee-structures.png` });
    await ctx.close();
  });
}
