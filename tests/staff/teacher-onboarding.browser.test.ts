import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { prisma as appPrisma } from "../../src/lib/db/prisma";

// SKO-458 on the isolated app: only an incomplete teacher is routed into first-login onboarding; the
// short wizard needs just a name and an international-friendly phone, resumes a tab draft after a refresh,
// reviews before saving, saves once however often it is submitted, and lands on the teacher's real first
// task (never an invented assignment). An expired session saves nothing and offers a neutral sign-in.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== (process.env.QA_DB_PORT || "55438") || url.pathname !== "/postgres") throw Error(`Only isolated local DB ${process.env.QA_DB_PORT || "55438"} is allowed`);
const base = process.env.ONBOARDING_TEST_APP || "http://localhost:3108";
const evidence = process.env.ONBOARDING_EVIDENCE_DIR || "/tmp/sko458-evidence";
const db = new PrismaClient(), password = "SyntheticOnboard458!";
const schoolId = `to458-${randomUUID()}`, campusId = randomUUID();
const users = new Map<string, { id: string; email: string }>();
let browser: Browser;

async function user(key: string, role: string, { language = "en", complete = false } = {}) {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role: role as never, schoolId, campusId, isActive: true, onboardingComplete: complete, preferredLanguage: language } });
  users.set(key, { id, email });
}
async function signedIn(key: string, viewport = { width: 1440, height: 1000 }): Promise<BrowserContext> {
  const c = await browser.newContext({ viewport, reducedMotion: "reduce" });
  assert.equal((await c.request.post(base + "/api/auth/login", { data: { email: users.get(key)!.email, password } })).status(), 200, `login ${key}`);
  return c;
}
const id = (key: string) => users.get(key)!.id;
const profile = (key: string) => db.user.findUnique({ where: { id: id(key) }, select: { fullName: true, phone: true, onboardingComplete: true, subjectSpecialties: true, teachesAllSubjects: true, province: true } });
const shot = async (page: Page, name: string) => { await page.evaluate("Promise.all(document.getAnimations().map(a => a.finished.catch(() => undefined)))"); await page.screenshot({ path: `${evidence}/${name}.png`, fullPage: true }); };
const open = async (c: BrowserContext) => { const page = await c.newPage(); await page.goto(base + "/teacher-onboarding"); await page.getByRole("heading", { level: 1, name: /Personal Info|المعلومات الشخصية/ }).waitFor({ timeout: 60_000 }); return page; };

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Linden School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Dubai", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Linden North", regId: campusId, city: "Dubai" } });
  await user("assigned", "TEACHER"); await user("unassigned", "TEACHER"); await user("arabic", "TEACHER", { language: "ar" });
  await user("done", "TEACHER", { complete: true });
  const cls = await db.class.create({ data: { schoolId, campusId, name: "Four", section: "B", academicYear: 2026, classTeacherId: id("assigned") } });
  await db.subject.create({ data: { schoolId, campusId, classId: cls.id, name: "Science", teacherId: id("assigned") } });
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser?.close();
  await db.school.delete({ where: { id: schoolId } }).catch(() => undefined);
  await db.$disconnect(); await appPrisma.$disconnect();
});

test("only an incomplete teacher is routed into onboarding; a completed teacher goes to the workspace", async () => {
  const fresh = await signedIn("unassigned");
  const page = await fresh.newPage();
  await page.goto(base + "/teacher");
  await page.waitForURL(/\/teacher-onboarding$/, { timeout: 60_000 });
  await fresh.close();
  const complete = await signedIn("done");
  const back = await complete.newPage();
  await back.goto(base + "/teacher-onboarding");
  await back.waitForURL((u) => u.pathname === "/teacher", { timeout: 60_000 });
  await complete.close();
});

test("name and an international phone are enough; a refresh resumes the tab draft; review then lands on the real first task", async () => {
  const c = await signedIn("assigned");
  const page = await open(c);
  assert.ok(await page.getByText("Teacher profile for Synthetic Linden School · Linden North").isVisible(), "invitation context is visible");
  await page.getByLabel("Full Name").fill("A");
  await page.getByLabel("Phone Number").fill("12-34");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  assert.ok(await page.getByText("Name must be at least 2 characters").first().isVisible());
  assert.ok(await page.getByText("Enter a phone number with 7 to 15 digits").first().isVisible());
  await page.getByLabel("Full Name").fill("Synthetic Hana Linden");
  await page.getByLabel("Phone Number").fill("+971 50 123 4567");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("heading", { level: 1, name: "Professional" }).waitFor();
  await page.getByRole("button", { name: "Add Mathematics" }).click();
  await page.getByLabel("Add a subject").fill("Robotics");
  await page.getByLabel("Add a subject").press("Enter");
  await page.waitForTimeout(1500);

  await page.reload();
  await page.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 60_000 });
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Review recovered draft" }).click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("button", { name: "Apply selected draft" }).click();
  await page.getByRole("heading", { level: 1, name: "Professional" }).waitFor();
  assert.ok(await page.getByRole("button", { name: "Remove Robotics" }).isVisible(), "the specialty list survives the refresh");

  await page.getByRole("button", { name: "Skip to review", exact: true }).click();
  await page.getByRole("heading", { level: 1, name: "Review" }).waitFor();
  const review = await page.locator("dl").innerText();
  assert.match(review, /Synthetic Hana Linden/);
  assert.match(review, /\+971 50 123 4567/);
  assert.match(review, /Mathematics, Robotics/);
  assert.match(review, /Add later/, "optional details are shown as complete-later, not as blockers");
  assert.equal((await profile("assigned"))!.onboardingComplete, false, "nothing is saved before Complete Profile");
  await shot(page, "en-1440-review");

  await page.getByRole("button", { name: "Complete Profile", exact: true }).dblclick();
  await page.getByRole("heading", { name: "You're ready to teach" }).waitFor({ timeout: 60_000 });
  assert.ok(await page.getByText("Four B").first().isVisible(), "the real class-teacher assignment is shown");
  assert.ok(await page.getByText("Science · Four B").isVisible());
  await shot(page, "en-1440-ready");
  const saved = (await profile("assigned"))!;
  assert.equal(saved.onboardingComplete, true);
  assert.equal(saved.fullName, "Synthetic Hana Linden");
  assert.equal(saved.phone, "+971 50 123 4567");
  assert.deepEqual(saved.subjectSpecialties, ["Mathematics", "Robotics"]);
  assert.equal(await db.class.count({ where: { classTeacherId: id("assigned") } }), 1, "completion creates no assignment");

  await page.getByRole("button", { name: "Take today's register" }).click();
  await page.waitForURL(/\/teacher\/attendance/, { timeout: 60_000 });
  await page.goBack();
  await page.waitForURL((u) => u.pathname !== "/teacher-onboarding", { timeout: 60_000 }).catch(() => undefined);
  await page.waitForTimeout(1500);
  assert.notEqual(new URL(page.url()).pathname, "/teacher-onboarding", "back navigation does not reopen the completed wizard");
  await c.close();
});

test("a replay from a second tab saves once; a teacher with no classes gets a helpful next step", async () => {
  const c = await signedIn("unassigned");
  const first = await open(c), second = await open(c);
  for (const [page, name] of [[first, "Synthetic First Tab"], [second, "Synthetic Second Tab"]] as const) {
    await page.getByLabel("Full Name").fill(name);
    await page.getByLabel("Phone Number").fill("0300 1234567");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Skip to review", exact: true }).click();
  }
  await first.getByRole("button", { name: "Complete Profile", exact: true }).click();
  await first.getByRole("heading", { name: "You're ready to teach" }).waitFor({ timeout: 60_000 });
  const once = (await profile("unassigned"))!;
  await second.getByRole("button", { name: "Complete Profile", exact: true }).click();
  await second.getByText("Already saved").waitFor({ timeout: 60_000 });
  assert.ok(await second.getByText("Your profile was already complete, so nothing was saved twice.").isVisible());
  const after = (await profile("unassigned"))!;
  assert.equal(after.fullName, "Synthetic First Tab", "the replay does not overwrite the saved profile");
  assert.deepEqual(after, once, "the second submission changes nothing");
  assert.ok(await first.getByText(/No classes are assigned to you yet/).isVisible());
  await first.getByRole("button", { name: "Open your workspace" }).click();
  await first.waitForURL((u) => u.pathname === "/teacher", { timeout: 60_000 });
  await c.close();
});

test("Arabic reads right to left on a phone; an expired session saves nothing and offers sign-in", async () => {
  const c = await signedIn("arabic", { width: 390, height: 844 });
  const page = await open(c);
  assert.equal(await page.locator("[dir=rtl]").first().getAttribute("lang"), "ar");
  assert.ok(await page.getByText("ملف المعلم في Synthetic Linden School · Linden North").isVisible());
  await page.getByLabel("الاسم الكامل").fill("Synthetic Salma Linden");
  await page.getByLabel("رقم الهاتف").fill("+966 55 123 4567");
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(width <= 390, `no horizontal scroll at 390px (scrollWidth ${width})`);
  await shot(page, "ar-390-personal");
  await page.getByRole("button", { name: "التالي", exact: true }).click();
  await page.getByRole("button", { name: "الانتقال إلى المراجعة" }).click();
  await c.clearCookies();
  await page.getByRole("button", { name: "إكمال الملف الشخصي" }).click();
  await page.getByText("انتهت جلستك").waitFor({ timeout: 60_000 });
  assert.equal((await profile("arabic"))!.onboardingComplete, false, "nothing is saved without a session");
  assert.ok(await page.getByRole("button", { name: "سجّل الدخول مرة أخرى" }).isVisible());
  await c.close();
});
