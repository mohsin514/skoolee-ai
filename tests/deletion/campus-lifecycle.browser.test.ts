import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-389 campus lifecycle on the isolated app: the owner sees what a campus still holds; a campus
// with pupils or classes cannot be archived; the check is repeated at commit so a pupil enrolled while
// the dialog was open stops it; an empty campus archives with a reason, keeps its history and restores;
// a restore that would duplicate an active campus name is refused.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.DELETION_TEST_APP || "http://localhost:3107";
const evidence = process.env.DELETION_EVIDENCE_DIR || "/tmp/sko389-evidence";
const db = new PrismaClient(), password = "SyntheticCampus389!";
const schoolId = `cam389-${randomUUID()}`, busy = randomUUID(), empty = randomUUID(), racing = randomUUID(), annexActive = randomUUID(), annexArchived = randomUUID();
const users = new Map<string, string>();
let browser: Browser;
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
async function context(key: string, viewport = { width: 1440, height: 1000 }): Promise<BrowserContext> {
  const saved = sessions.get(key);
  if (saved) return browser.newContext({ viewport, reducedMotion: "reduce", storageState: saved });
  const ctx = await browser.newContext({ viewport, reducedMotion: "reduce" });
  assert.equal((await ctx.request.post(base + "/api/auth/login", { data: { email: users.get(key)!, password } })).status(), 200);
  const { secret } = await (await ctx.request.post(base + "/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
  if (secret) { await ctx.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(secret.replace(/\s+/g, "")) } }); await ctx.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } }); }
  sessions.set(key, await ctx.storageState());
  return ctx;
}
const shot = async (page: Page, name: string) => { await page.evaluate("Promise.all(document.getAnimations().map(a => a.finished.catch(() => undefined)))"); await page.screenshot({ path: `${evidence}/${name}.png` }); };
const dialog = (page: Page) => page.getByRole("alertdialog").or(page.getByRole("dialog")).last();

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Magnolia Group", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Jeddah", status: "ACTIVE", plan: "PRO", registrationKind: "GROUP" } });
  for (const [id, name, archived] of [[busy, "Magnolia North", false], [empty, "Magnolia South", false], [racing, "Magnolia East", false], [annexActive, "Cedar Annex", false], [annexArchived, "cedar annex", true]] as const) await db.campus.create({ data: { id, schoolId, name, regId: id, city: "Jeddah", ...(archived ? { archivedAt: new Date("2026-06-30Z"), archiveReason: "Merged into Cedar Annex" } : {}) } });
  for (const [key, language] of [["owner", "en"], ["owner-ar", "ar"]] as const) { const email = `${randomUUID()}@example.invalid`; users.set(key, email); await db.user.create({ data: { email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role: "SUPER_ADMIN", schoolId, campusId: null, isActive: true, onboardingComplete: true, preferredLanguage: language } }); }
  const classId = randomUUID();
  await db.class.create({ data: { id: classId, schoolId, campusId: busy, name: "Two", academicYear: 2026 } });
  await db.student.create({ data: { schoolId, campusId: busy, classId, fullName: "Synthetic North Pupil", rollNo: "N-1", gender: "MALE", enrollmentDate: new Date("2026-04-01Z") } });
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await db.school.delete({ where: { id: schoolId } }).catch(() => undefined); await db.$disconnect(); });

test("a campus still running pupils and classes shows what blocks archiving and nothing changes", async () => {
  const ctx = await context("owner"), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/super?view=settings`);
  await page.locator(`[data-archive-campus="${busy}"]`).click({ timeout: 30_000 });
  const confirm = dialog(page);
  await confirm.locator("[data-campus-archive-blockers]").waitFor();
  const text = await confirm.innerText();
  assert.match(text, /1 active pupil\(s\) · 1 active class\(es\)/);
  assert.match(text, /Move or archive its 1 active pupil\(s\) first/);
  await shot(page, "campus-archive-blocked-en-1440");
  await confirm.getByRole("button", { name: "Close", exact: true }).last().click();
  assert.equal((await db.campus.findUniqueOrThrow({ where: { id: busy } })).archivedAt, null);
  assert.deepEqual(errors, []); await ctx.close();
});

test("a pupil enrolled while the dialog is open stops the archive at commit", async () => {
  const ctx = await context("owner"), page = await ctx.newPage();
  await page.goto(`${base}/super?view=settings`);
  await page.locator(`[data-archive-campus="${racing}"]`).click({ timeout: 30_000 });
  const confirm = dialog(page);
  await confirm.getByLabel("Reason").fill("Synthetic consolidation");
  const classId = randomUUID();
  await db.class.create({ data: { id: classId, schoolId, campusId: racing, name: "Late", academicYear: 2026 } });
  await db.student.create({ data: { schoolId, campusId: racing, classId, fullName: "Synthetic Late Pupil", rollNo: "E-1", gender: "FEMALE", enrollmentDate: new Date("2026-10-01Z") } });
  await confirm.getByRole("button", { name: "Archive campus" }).click();
  await confirm.locator("[data-campus-archive-blockers]").waitFor();
  assert.equal((await db.campus.findUniqueOrThrow({ where: { id: racing } })).archivedAt, null, "revalidated inside the transaction");
  await ctx.close();
});

test("an empty campus archives with a reason, keeps its history, and restores; a clashing name blocks restore", async () => {
  const invoiceSchoolClass = randomUUID();
  await db.class.create({ data: { id: invoiceSchoolClass, schoolId, campusId: empty, name: "Former", academicYear: 2025, archivedAt: new Date("2026-06-01Z"), status: "COMPLETED" } });
  const ctx = await context("owner"), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/super?view=settings`);
  await page.locator(`[data-archive-campus="${empty}"]`).click({ timeout: 30_000 });
  const confirm = dialog(page);
  await confirm.getByRole("button", { name: "Archive campus" }).click();
  await confirm.getByText("Give a reason for archiving this campus.").waitFor();
  await confirm.getByLabel("Reason").fill("Building closed for the year");
  await shot(page, "campus-archive-confirm-en-1440");
  await confirm.getByRole("button", { name: "Archive campus" }).click();
  await page.locator(`[data-archived-campus="${empty}"]`).waitFor();
  const archived = await db.campus.findUniqueOrThrow({ where: { id: empty } });
  assert.ok(archived.archivedAt); assert.equal(archived.archiveReason, "Building closed for the year");
  assert.equal(await db.class.count({ where: { campusId: empty } }), 1, "history kept");
  assert.equal(await db.auditLog.count({ where: { tableName: "campus", recordId: empty } }), 1);
  await page.locator(`[data-archived-campus="${annexArchived}"]`).getByRole("button", { name: "Restore" }).click();
  await dialog(page).getByRole("button", { name: "Restore campus" }).click();
  await dialog(page).getByText("An active campus already uses this name").waitFor();
  assert.ok((await db.campus.findUniqueOrThrow({ where: { id: annexArchived } })).archivedAt, "nothing changed on a clash");
  await dialog(page).getByRole("button", { name: "Cancel" }).click();
  await page.locator(`[data-archived-campus="${empty}"]`).getByRole("button", { name: "Restore" }).click();
  await dialog(page).getByRole("button", { name: "Restore campus" }).click();
  await page.locator(`[data-archive-campus="${empty}"]`).waitFor();
  assert.equal((await db.campus.findUniqueOrThrow({ where: { id: empty } })).archivedAt, null);
  assert.deepEqual(errors, []); await ctx.close();
});

test("the Arabic archive dialog reads right-to-left at phone width", async () => {
  const ctx = await context("owner-ar", { width: 390, height: 844 }), page = await ctx.newPage();
  await page.goto(`${base}/super?view=settings`);
  await page.locator(`[data-archive-campus="${busy}"]`).click({ timeout: 30_000 });
  await dialog(page).locator("[data-campus-archive-blockers]").waitFor();
  assert.equal(await page.evaluate("document.documentElement.dir"), "rtl");
  assert.equal(await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true);
  assert.doesNotMatch(await dialog(page).innerText(), /active pupil/);
  await shot(page, "campus-archive-blocked-ar-390");
  await ctx.close();
});
