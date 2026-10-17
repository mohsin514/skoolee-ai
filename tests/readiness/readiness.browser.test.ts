import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-397 browser acceptance against the isolated database and app.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.READINESS_TEST_APP || "http://localhost:3107";
const evidence = process.env.READINESS_EVIDENCE_DIR || "/tmp/sko397-evidence";
const raw = new PrismaClient(), password = "SyntheticReady397!", DAY = 86_400_000;
const schoolId = `ready397b-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID();
const people = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
let browser: Browser;

async function person(key: string, role: string, language = "en", owner = false) {
  const id = randomUUID(), email = `${id}@example.invalid`;
  await raw.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role: role as never, schoolId, campusId, isActive: true, onboardingComplete: true, isInstitutionOwner: owner, preferredLanguage: language } });
  people.set(key, { id, email });
}
async function context(key: string, viewport = { width: 1440, height: 1000 }) {
  const saved = sessions.get(key);
  if (saved) return browser.newContext({ viewport, storageState: saved });
  const ctx = await browser.newContext({ viewport });
  assert.equal((await ctx.request.post(base + "/api/auth/login", { data: { email: people.get(key)!.email, password } })).status(), 200);
  const { secret } = await (await ctx.request.post(base + "/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
  if (secret) {
    await ctx.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(secret.replace(/\s+/g, "")) } });
    await ctx.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } });
  }
  sessions.set(key, await ctx.storageState());
  return ctx;
}
async function open(key: string, viewport?: { width: number; height: number }) {
  const ctx = await context(key, viewport), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(base + "/setup/readiness");
  return { ctx, page, errors };
}
const settled = (page: Page) => page.evaluate(() => Promise.all(document.getAnimations().filter(a => Number.isFinite(Number(a.effect?.getComputedTiming().endTime))).map(a => a.finished.catch(() => undefined))));
const shot = async (page: Page, name: string) => { await settled(page); await page.screenshot({ path: `${evidence}/${name}.png`, fullPage: true }); };
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

before(async () => {
  await raw.school.create({ data: { id: schoolId, name: "Synthetic Cedar Academy", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Riyadh", status: "ACTIVE", plan: "PRO" } });
  await raw.campus.create({ data: { id: campusId, schoolId, name: "Cedar Main", regId: campusId, city: "Riyadh" } });
  await person("owner", "ADMIN", "en", true); await person("teacher", "TEACHER"); await person("owner-ar", "ADMIN", "ar", true); await person("delegate-ur", "PRINCIPAL", "ur");
  const owner = people.get("owner")!.id, teacher = people.get("teacher")!.id;
  await raw.institutionSetup.create({ data: { schoolId, institutionType: "STANDALONE", adoptionMode: "FULL_OPERATIONS", status: "COMPLETED", draft: { school: {}, campuses: [] }, delegateUserId: people.get("delegate-ur")!.id } });
  await raw.localePolicy.create({ data: { schoolId, scopeKey: "school", status: "ACTIVE", effectiveAt: new Date(Date.now() - DAY), createdBy: owner, settings: { country: "SA", currency: "SAR", timezone: "Asia/Riyadh" } } });
  await raw.academicCycle.create({ data: { schoolId, campusId, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  await raw.class.create({ data: { id: classId, schoolId, campusId, name: "Grade 4", section: "A", academicYear: 2026, classTeacherId: teacher } });
  await raw.subject.create({ data: { schoolId, campusId, classId, name: "Mathematics", teacherId: teacher } });
  for (const [index, name] of ["Synthetic pupil one", "Synthetic pupil two"].entries()) {
    const studentId = randomUUID();
    await raw.student.create({ data: { id: studentId, schoolId, campusId, classId, fullName: name, rollNo: String(index + 1), gender: "FEMALE", enrollmentDate: new Date("2026-09-01Z") } });
    await raw.guardianRelationship.create({ data: { schoolId, campusId, studentId, guardianUserId: owner, createdByUserId: owner, fullName: "Synthetic guardian", email: people.get("owner")!.email, relationship: "Parent", status: "ACTIVE", verifiedAt: new Date() } });
  }
  await raw.feeStructure.create({ data: { schoolId, campusId, classId, monthlyFee: 1000, activeFrom: new Date("2026-09-01Z") } });
  await raw.importBatch.create({ data: { schoolId, campusId, kind: "STUDENT_ROSTER", fingerprint: randomUUID(), targetScope: campusId, sourceName: "cedar-roster.csv", state: "COMMITTED", committedAt: new Date(), createdById: owner, expiresAt: new Date(Date.now() + DAY),
    data: { rows: [{ state: "ACCEPTED", errors: [] }, { state: "ACCEPTED", errors: [] }, { state: "REJECTED", errors: ["classId: Class is outside the selected campus or does not exist"] }] } } });
  await raw.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await raw.school.delete({ where: { id: schoolId } }).catch(() => undefined); await raw.$disconnect(); });

test("the lead sees required checks, reconciliation and the next step; approval waits for the rehearsal", async () => {
  const { ctx, page, errors } = await open("owner");
  await page.getByRole("heading", { name: "School readiness" }).waitFor();
  await page.getByText("Setup in progress").waitFor();
  await page.getByRole("region", { name: "Required before going live" }).waitFor();
  assert.equal(await page.getByRole("region", { name: "Optional — can follow go-live" }).count(), 0, "no empty optional section in full operations");
  assert.equal(await page.getByRole("region", { name: "Next required step" }).getByText("First-class practice rehearsal").count(), 1);
  await page.getByText("cedar-roster.csv").waitFor();
  assert.equal(await page.getByText("1 unknown class", { exact: false }).count() >= 1, true, "the rejected unknown-class row stays visible");
  assert.equal(await page.getByRole("button", { name: "Approve go-live" }).isDisabled(), true);
  await shot(page, "readiness-setup-en-1440");
  assert.deepEqual(errors, []); await ctx.close();
});

test("the practice rehearsal is labelled synthetic and then go-live is approved with an owned follow-up", async () => {
  const { ctx, page } = await open("owner");
  await page.getByText("Practice — synthetic learners. Nothing is saved, sent or charged.").waitFor();
  const steps = page.locator("#practice li");
  for (let index = 0; index < 3; index += 1) {
    await steps.nth(index).getByRole("button", { name: "Run" }).click();
    await steps.nth(index).getByText("Done:", { exact: false }).waitFor();
  }
  await page.getByText("What a family sees: Practice learner A").waitFor();
  await shot(page, "readiness-practice-family-en-1440");
  const roster = page.locator("li").filter({ hasText: "Complete the pupil roster" }).first();
  await roster.getByLabel("Owner").selectOption({ label: "Synthetic teacher" });
  await page.getByRole("status").filter({ hasText: "Saved." }).waitFor();
  assert.equal(await raw.attendance.count({ where: { schoolId } }), 0, "rehearsal attendance is never saved");
  await page.getByRole("button", { name: "Approve go-live" }).click();
  await page.getByText("Live — approved").waitFor();
  const record = await raw.schoolReadiness.findUniqueOrThrow({ where: { schoolId } });
  assert.equal(record.approvedById, people.get("owner")!.id);
  assert.ok((record.evidence as { outstandingOptional: unknown[] }).outstandingOptional.length > 0);
  await shot(page, "readiness-approved-en-1440");
  await ctx.close();
});

test("a teacher sees and closes only the follow-up assigned to them, on a phone", async () => {
  const { ctx, page, errors } = await open("teacher", { width: 390, height: 860 });
  await page.getByRole("heading", { name: "Your setup tasks" }).waitFor();
  assert.equal(await page.getByRole("listitem").count(), 1);
  await page.getByText("Assigned to you").waitFor();
  await page.getByRole("button", { name: "Mark done" }).click();
  await page.getByText("Done", { exact: true }).first().waitFor();
  assert.equal(await page.getByRole("region", { name: "Required before going live" }).count(), 0);
  assert.equal(await noOverflow(page), true);
  await shot(page, "readiness-teacher-task-en-390");
  assert.deepEqual(errors, []); await ctx.close();
});

test("Arabic owner and Urdu setup delegate layouts are RTL without overflow at 390px", async () => {
  for (const [key, title] of [["owner-ar", "جاهزية المدرسة"], ["delegate-ur", "اسکول کی تیاری"]] as const) {
    const { ctx, page, errors } = await open(key, { width: 390, height: 860 });
    await page.getByRole("heading", { name: title }).waitFor();
    await page.locator("#practice").waitFor(); // lead content loaded, not the loading state
    assert.equal(await page.locator("main").getAttribute("dir"), "rtl");
    assert.equal(await noOverflow(page), true, key);
    await shot(page, `readiness-${key}-390`);
    assert.deepEqual(errors, []); await ctx.close();
  }
});
