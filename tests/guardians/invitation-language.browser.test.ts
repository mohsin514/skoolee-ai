import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-490 on the isolated app with synthetic data: the guardian invitation page follows the account's saved
// language — never the browser's — in its loaded, empty, error and accepted states, and the dashboard after
// acceptance agrees with it.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.INVITE_TEST_APP || "http://localhost:3107";
const evidence = process.env.INVITE_EVIDENCE_DIR || "/tmp/sko490-evidence";
const db = new PrismaClient(), password = "SyntheticInvite490!";
const schoolId = `inv490-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID();
const users = new Map<string, { id: string; email: string }>();
let browser: Browser;

async function user(key: string, role: string, language: string) {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { id, email, password: await bcrypt.hash(password, 10), fullName: `Synthetic ${key}`, role: role as never, schoolId, campusId, isActive: true, onboardingComplete: true, preferredLanguage: language } });
  users.set(key, { id, email }); return id;
}
async function signedIn(key: string, locale: string, viewport = { width: 1280, height: 900 }): Promise<BrowserContext> {
  const ctx = await browser.newContext({ locale, viewport, reducedMotion: "reduce" });
  assert.equal((await ctx.request.post(base + "/api/auth/login", { data: { email: users.get(key)!.email, password } })).status(), 200);
  const { secret } = await (await ctx.request.post(base + "/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
  if (secret) { await ctx.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(secret.replace(/\s+/g, "")) } }); await ctx.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } }); }
  return ctx;
}
async function invite(key: string, child: string) {
  const studentId = randomUUID();
  await db.student.create({ data: { id: studentId, schoolId, campusId, classId, fullName: child, rollNo: String(Math.floor(Math.random() * 900) + 100), gender: "OTHER", status: "active" } as never });
  await db.guardianRelationship.create({ data: { schoolId, campusId, studentId, createdByUserId: users.get("admin")!.id, fullName: `Synthetic ${key}`, email: users.get(key)!.email, relationship: "MOTHER", status: "INVITED", invitationExpiresAt: new Date(Date.now() + 86_400_000) } });
}

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Invite School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } as never });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Invite campus", regId: campusId, city: "Lahore" } });
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Grade 3", section: "A", academicYear: 2026 } });
  await user("admin", "ADMIN", "en");
  await user("parent-ar", "PARENT", "ar"); await user("parent-ur", "PARENT", "ur"); await user("parent-en", "PARENT", "en"); await user("parent-none", "PARENT", "ar");
  await invite("parent-ar", "Synthetic Alex Same Name علي"); await invite("parent-ur", "Synthetic Sana Malik"); await invite("parent-en", "Synthetic Omar Raza");
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await db.school.delete({ where: { id: schoolId } }).catch(() => undefined); await db.$disconnect(); });

for (const [key, browserLocale, lang, dir, heading, button] of [
  ["parent-ar", "en-US", "ar", "rtl", "دعوات ولي الأمر", "قبول الدعوة"],
  ["parent-ur", "ar-SA", "ur", "rtl", "سرپرست کی دعوتیں", "دعوت قبول کریں"],
  ["parent-en", "ur-PK", "en", "ltr", "Guardian invitations", "Accept invitation"],
] as const) {
  test(`saved ${lang} wins over a ${browserLocale} browser on the invitation page`, async () => {
    const ctx = await signedIn(key, browserLocale);
    const page = await ctx.newPage();
    await page.goto(`${base}/parent-invitations`);
    await page.locator("main h1").waitFor();
    const main = page.locator("main[dir]").last();
    assert.equal(await main.getAttribute("dir"), dir); assert.equal(await main.getAttribute("lang"), lang);
    assert.equal((await page.locator("main h1").innerText()).trim(), heading);
    await page.getByRole("button", { name: button }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.dir), dir, "the document direction agrees from first paint");
    await page.screenshot({ path: `${evidence}/01-${lang}-on-${browserLocale}.png`, fullPage: true });
    // The load error is in the saved language too.
    await page.route("**/api/parent/invitations", r => r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ success: false }) }));
    await page.reload();
    const alert = page.locator("main p[role=alert]");
    await alert.waitFor();
    assert.equal((await alert.innerText()).trim(), { ar: "تعذر تحميل الدعوة أو قبولها.", ur: "دعوت لوڈ یا قبول نہیں ہوسکی۔", en: "Could not load or accept this invitation." }[lang]);
    await ctx.close();
  });
}

test("an account with no invitation sees the empty state in its language; accepting keeps the language into the dashboard", async () => {
  const empty = await (await signedIn("parent-none", "en-US")).newPage();
  await empty.goto(`${base}/parent-invitations`);
  await empty.getByText("لا توجد دعوات لهذا الحساب.").waitFor();
  await empty.context().close();
  const ctx = await signedIn("parent-ar", "en-US", { width: 390, height: 844 });
  const page = await ctx.newPage();
  await page.goto(`${base}/parent-invitations`);
  await page.locator("bdi", { hasText: "Synthetic Alex Same Name علي" }).waitFor();
  await page.getByRole("button", { name: "قبول الدعوة" }).click();
  await page.waitForURL(/\/parent(\?|$|\/)/);
  await page.waitForFunction(() => document.documentElement.dir === "rtl" && document.documentElement.lang === "ar");
  await page.screenshot({ path: `${evidence}/02-ar-dashboard-after-accept.png` });
  assert.equal((await db.guardianRelationship.findFirstOrThrow({ where: { schoolId, email: users.get("parent-ar")!.email } })).status, "ACTIVE");
  await ctx.close();
});
