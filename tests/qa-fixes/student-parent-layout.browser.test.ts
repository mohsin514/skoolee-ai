import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-483, SKO-485 and SKO-487 on the isolated app: the Arabic student's Report Card action is
// translated; the Urdu student header has readable line height and spacing on a phone; the parent's
// policy question field stays inside a 320px screen at 200% text in English, Arabic and Urdu.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== (process.env.QA_DB_PORT || "55438") || url.pathname !== "/postgres") throw Error(`Only isolated local DB ${process.env.QA_DB_PORT || "55438"} is allowed`);
const base = process.env.QA_TEST_APP || "http://localhost:3108";
const evidence = process.env.QA_EVIDENCE_DIR || "/tmp/qa-fixes-evidence";
const db = new PrismaClient(), password = "SyntheticQaFixes48x!";
const schoolId = `qa48x-${randomUUID()}`, campusId = randomUUID();
const users = new Map<string, { id: string; email: string }>();
let browser: Browser;

async function user(key: string, role: string, language: string) {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role: role as never, schoolId, campusId, isActive: true, onboardingComplete: true, preferredLanguage: language } });
  users.set(key, { id, email });
}
async function context(key: string, viewport: { width: number; height: number }): Promise<BrowserContext> {
  const c = await browser.newContext({ viewport, reducedMotion: "reduce" });
  assert.equal((await c.request.post(base + "/api/auth/login", { data: { email: users.get(key)!.email, password } })).status(), 200, `login ${key}`);
  const { secret } = await (await c.request.post(base + "/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
  if (secret) { await c.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(secret.replace(/\s+/g, "")) } }); await c.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } }); }
  return c;
}

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Today North", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Today North", regId: campusId, city: "Lahore" } });
  await db.academicCycle.create({ data: { schoolId, campusId, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  const classId = (await db.class.create({ data: { schoolId, campusId, name: "Grade 6", section: "B", academicYear: 2026 } })).id;
  for (const [key, lang] of [["student-ar", "ar"], ["student-ur", "ur"]] as const) {
    await user(key, "STUDENT", lang);
    await db.student.create({ data: { schoolId, campusId, classId, fullName: `Synthetic Pupil ${key}`, rollNo: key, gender: "FEMALE", status: "active", studentUserId: users.get(key)!.id } });
  }
  const child = await db.student.create({ data: { schoolId, campusId, classId, fullName: "Synthetic Pupil Sara", rollNo: "S1", gender: "FEMALE", status: "active" } });
  for (const lang of ["en", "ar", "ur"]) {
    await user(`parent-${lang}`, "PARENT", lang);
    const rel = await db.guardianRelationship.create({ data: { schoolId, campusId, studentId: child.id, guardianUserId: users.get(`parent-${lang}`)!.id, createdByUserId: users.get("student-ar")!.id, fullName: "Synthetic guardian", email: users.get(`parent-${lang}`)!.email, relationship: "Parent", status: "ACTIVE", verifiedAt: new Date() } });
    await db.guardianAccessVersion.create({ data: { schoolId, relationshipId: rel.id, createdByUserId: users.get("student-ar")!.id, reason: "Synthetic fixture", effectiveFrom: new Date(Date.now() - 60_000), permissions: { learningRecords: true, attendance: true, finances: false, communication: true, pickup: false } } });
  }
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser?.close();
  await db.school.delete({ where: { id: schoolId } }).catch(() => undefined);
  await db.$disconnect();
});

test("SKO-483: the Arabic student's Report Card action is translated", async () => {
  const page = await (await context("student-ar", { width: 390, height: 844 })).newPage();
  await page.goto(`${base}/student`);
  await page.getByRole("button", { name: "بطاقة التقرير" }).waitFor({ timeout: 60_000 });
  assert.equal(await page.getByRole("button", { name: "Report Card" }).count(), 0);
  await page.screenshot({ path: `${evidence}/sko483-student-ar-390.png` });
  await page.close();
});

test("SKO-485: the Urdu student header keeps readable line height and spacing on phones", async () => {
  for (const [width, zoom] of [[390, "100%"], [320, "200%"]] as const) {
    const page = await (await context("student-ur", { width, height: 860 })).newPage();
    await page.goto(`${base}/student/access`);
    const h1 = page.locator("main h1").first();
    await h1.waitFor({ timeout: 60_000 });
    await page.addStyleTag({ content: `html{font-size:${zoom} !important}` });
    const m = await h1.evaluate((el) => { const p = el.parentElement?.querySelector("p"); const hs = getComputedStyle(el), ps = p ? getComputedStyle(p) : null; return { hLine: parseFloat(hs.lineHeight) / parseFloat(hs.fontSize), pLine: ps ? parseFloat(ps.lineHeight) / parseFloat(ps.fontSize) : 2, gap: p ? p.getBoundingClientRect().top - el.getBoundingClientRect().bottom : 10, overflow: document.documentElement.scrollWidth - window.innerWidth }; });
    assert.ok(m.hLine >= 1.37 && m.pLine >= 1.6, `line heights ${JSON.stringify(m)}`);
    assert.ok(m.gap >= 2, `heading and summary do not collide ${JSON.stringify(m)}`);
    assert.ok(m.overflow <= 1, "no horizontal overflow");
    await page.screenshot({ path: `${evidence}/sko485-access-ur-${width}-${zoom.replace("%", "")}.png` });
    await page.close();
  }
});

test("SKO-487 → M95: the parent policy question field (Help › Ask the school) stays inside 320px at 200% text in EN, AR and UR", async () => {
  for (const lang of ["en", "ar", "ur"]) {
    const page = await (await context(`parent-${lang}`, { width: 320, height: 720 })).newPage();
    await page.goto(`${base}/parent`);
    // The policy assistant left Home: it opens from the header Help menu as a dialog (SPEC §4.2, M95).
    await page.locator('[data-tour="shell.header.help"]').first().click({ timeout: 60_000 });
    await page.locator('[data-tour="shell.help.ask"]').click();
    const field = page.locator("#field-policy-question, [name='policy-question'], #policy-question").first();
    await page.locator('section[aria-labelledby="policy-assistant"]').waitFor({ timeout: 60_000 });
    await page.addStyleTag({ content: "html{font-size:200% !important}" });
    const section = page.locator('section[aria-labelledby="policy-assistant"]');
    await section.scrollIntoViewIfNeeded();
    const input = section.locator("input").first();
    await input.fill("How do I request a long leave for a family trip abroad next term?");
    const box = await input.boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= 321, `${lang}: the field fits (${JSON.stringify(box)})`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${lang}: no horizontal scroll`);
    await input.focus(); assert.equal(await input.evaluate((el) => el === document.activeElement), true);
    await page.screenshot({ path: `${evidence}/sko487-policy-${lang}-320-200.png` });
    void field;
    await page.close();
  }
});
