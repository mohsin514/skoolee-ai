import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-402 on the isolated app with a synthetic school group: a campus administrator edits only their own
// campus (the group stays read-only); a save sends and records only the fields that changed, after a
// before/after review; invalid values fail with the form kept and nothing written; history shows each
// change; unpaid invoices block archiving; an invoice keeps the campus identity it was first issued with.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.SETTINGS_TEST_APP || "http://localhost:3107";
const evidence = process.env.SETTINGS_EVIDENCE_DIR || "/tmp/sko402-evidence";
const db = new PrismaClient(), password = "SyntheticInst402!";
const schoolId = `inst402-${randomUUID()}`, north = randomUUID(), south = randomUUID(), northClass = randomUUID(), southClass = randomUUID();
const users = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
let browser: Browser, invoiceId = "";

async function user(key: string, role: string, campus: string | null, language = "en") {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role: role as never, schoolId, campusId: campus, isActive: true, onboardingComplete: true, preferredLanguage: language } });
  users.set(key, { id, email }); return id;
}
async function context(key: string, viewport = { width: 1440, height: 1000 }) {
  const saved = sessions.get(key);
  if (saved) return browser.newContext({ viewport, storageState: saved, reducedMotion: "reduce" });
  const ctx = await browser.newContext({ viewport, reducedMotion: "reduce" });
  assert.equal((await ctx.request.post(base + "/api/auth/login", { data: { email: users.get(key)!.email, password } })).status(), 200);
  const { secret } = await (await ctx.request.post(base + "/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
  if (secret) { await ctx.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(secret.replace(/\s+/g, "")) } }); await ctx.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } }); }
  sessions.set(key, await ctx.storageState());
  return ctx;
}
const shot = async (page: Page, name: string) => { await page.evaluate("Promise.all(document.getAnimations().filter(a => Number.isFinite(Number(a.effect && a.effect.getComputedTiming().endTime))).map(a => a.finished.catch(() => undefined)))"); await page.screenshot({ path: `${evidence}/${name}.png` }); };
const dialog = (page: Page) => page.getByRole("dialog").last();
const audits = (recordId: string) => db.auditLog.findMany({ where: { schoolId, recordId }, orderBy: { createdAt: "asc" } });

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Palm Group", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Riyadh", status: "ACTIVE", plan: "PRO", registrationKind: "GROUP", tagline: "Old motto", phone: "+966 11 000 0000" } });
  await db.campus.create({ data: { id: north, schoolId, name: "Palm North", regId: `N-${north}`, city: "Riyadh", address: "Synthetic Street 1", phone: "+966 11 111 1111", email: "north@example.invalid", principalName: "Synthetic Head North", board: "Synthetic Board" } });
  await db.campus.create({ data: { id: south, schoolId, name: "Palm South", regId: `S-${south}`, city: "Riyadh" } });
  await db.class.create({ data: { id: northClass, schoolId, campusId: north, name: "Grade 1", academicYear: 2026 } });
  await db.class.create({ data: { id: southClass, schoolId, campusId: south, name: "Grade 1", academicYear: 2026, archivedAt: new Date("2026-06-30Z") } });
  await user("owner", "SUPER_ADMIN", null); await user("northAdmin", "CAMPUS_ADMIN", north); await user("northAdmin-ar", "CAMPUS_ADMIN", north, "ar");
  const northPupil = randomUUID(), southPupil = randomUUID();
  await db.student.create({ data: { id: northPupil, schoolId, campusId: north, classId: northClass, fullName: "Synthetic Pupil Noor", rollNo: "N-1", gender: "FEMALE", enrollmentDate: new Date("2026-04-01Z") } });
  // South has no active pupils or classes, only a former pupil's unpaid invoice.
  await db.student.create({ data: { id: southPupil, schoolId, campusId: south, classId: southClass, fullName: "Synthetic Former Pupil Ali", rollNo: "S-1", gender: "MALE", enrollmentDate: new Date("2025-04-01Z"), archivedAt: new Date("2026-06-30Z"), status: "archived" } });
  await db.invoice.create({ data: { schoolId, campusId: south, studentId: southPupil, invoiceDate: new Date("2026-05-01Z"), dueDate: new Date("2026-05-30Z"), currency: "SAR", invoiceNumber: `SYN-402-${randomUUID()}`, monthlyFee: 50000, subtotal: 50000, totalAmount: 50000, balanceDue: 50000 } });
  invoiceId = (await db.invoice.create({ data: { schoolId, campusId: north, studentId: northPupil, invoiceDate: new Date("2026-09-01Z"), dueDate: new Date("2026-09-30Z"), currency: "SAR", invoiceNumber: `SYN-402-N-${randomUUID().slice(0, 8)}`, monthlyFee: 40000, subtotal: 40000, totalAmount: 40000, balanceDue: 40000 } })).id;
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await db.school.delete({ where: { id: schoolId } }).catch(() => undefined); await db.$disconnect(); });

test("an invoice keeps the campus identity it was first issued with after the campus is renamed", async () => {
  const admin = await context("northAdmin");
  const first = await admin.request.get(`${base}/api/fees/invoice-pdf?id=${invoiceId}`);
  assert.equal(first.status(), 200, await first.text().catch(() => ""));
  await writeFile(`${evidence}/invoice-before.pdf`, await first.body());
  assert.match(execFileSync("pdftotext", [`${evidence}/invoice-before.pdf`, "-"]).toString(), /Palm North/);
  assert.ok((await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).issuerSnapshot, "the identity is captured when the invoice is first produced");
  await db.campus.update({ where: { id: north }, data: { name: "Palm North (temporary rename)", phone: "+966 11 999 9999" } });
  const again = await admin.request.get(`${base}/api/fees/invoice-pdf?id=${invoiceId}`);
  await writeFile(`${evidence}/invoice-after.pdf`, await again.body());
  const text = execFileSync("pdftotext", [`${evidence}/invoice-after.pdf`, "-"]).toString();
  assert.ok(!text.includes("temporary rename"), "an issued invoice is not rebranded");
  await db.campus.update({ where: { id: north }, data: { name: "Palm North", phone: "+966 11 111 1111" } });
});

test("a campus administrator edits only their campus name after reviewing it; nothing else changes", async () => {
  const admin = await context("northAdmin"), page = await admin.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  // role-ux: a group campus admin's record lives in Campus setup › Profile (one campus card; the group's own record
  // belongs to the group admin and is not shown here).
  await page.goto(`${base}/admin?view=settings&tab=profile`);
  await page.locator("[data-campus-card]").waitFor({ timeout: 30_000 });
  assert.equal(await page.locator("[data-school-record]").count(), 0, "the school group's record is not on the campus admin's screen");
  assert.equal(await page.getByRole("button", { name: "Edit" }).count(), 1, "only their own campus can be edited");
  const before = await db.campus.findUniqueOrThrow({ where: { id: north } });
  await page.getByRole("button", { name: "Edit" }).click();
  await dialog(page).getByText("You are editing Palm North, not the whole school group.").waitFor();
  await page.locator("#c-name").fill("Palm North Campus");
  await dialog(page).getByRole("button", { name: "Review changes" }).click();
  const summary = dialog(page).locator("[data-change-summary]");
  await summary.waitFor();
  assert.deepEqual(await summary.locator("[data-changed-field]").evaluateAll(nodes => nodes.map(node => node.getAttribute("data-changed-field"))), ["name"]);
  await shot(page, "campus-review-en-1440");
  await dialog(page).getByRole("button", { name: "Save changes" }).click();
  await page.getByText("Palm North Campus updated.", { exact: false }).first().waitFor({ timeout: 15_000 });
  const afterSave = await db.campus.findUniqueOrThrow({ where: { id: north } });
  assert.equal(afterSave.name, "Palm North Campus");
  for (const field of ["city", "address", "phone", "email", "principalName", "board", "website", "regId"] as const) assert.equal(afterSave[field], before[field], `${field} unchanged`);
  const entries = await audits(north);
  assert.equal(entries.length, 1);
  assert.deepEqual(Object.keys((entries[0].newValue as { fields: Record<string, unknown> }).fields), ["name"]);
  assert.equal((await db.school.findUniqueOrThrow({ where: { id: schoolId } })).name, "Synthetic Palm Group", "the group name is untouched");
  await page.getByRole("button", { name: /Change history for/ }).first().click();
  await dialog(page).locator('[data-history-kind="DETAILS"]').first().waitFor();
  assert.deepEqual(errors, []);
  await page.close();
});

test("the owner's invalid save keeps the form and writes nothing; a tagline-only save changes only the tagline", async () => {
  const owner = await context("owner"), page = await owner.newPage();
  await page.goto(`${base}/super?view=settings`);
  await page.locator("[data-history-school]").waitFor({ timeout: 30_000 });
  await page.locator("[data-history-school]").locator("..").getByRole("button", { name: "Edit" }).click();
  await page.locator("#s-phone").fill("12");
  await dialog(page).getByRole("button", { name: "Review changes" }).click();
  await dialog(page).getByRole("button", { name: "Save changes" }).click();
  await page.getByText("Phone number is too short to be valid.").first().waitFor({ timeout: 15_000 });
  assert.equal(await page.locator("#s-phone").inputValue(), "12", "the entered value is kept");
  assert.equal((await db.school.findUniqueOrThrow({ where: { id: schoolId } })).phone, "+966 11 000 0000");
  assert.equal((await audits(schoolId)).length, 0, "a failed save writes no history");
  await dialog(page).getByRole("button", { name: "Back to editing" }).click();
  await page.locator("#s-phone").fill("+966 11 000 0000");
  await page.locator("#s-tagline").fill("Synthetic new motto");
  await dialog(page).getByRole("button", { name: "Review changes" }).click();
  assert.deepEqual(await dialog(page).locator("[data-changed-field]").evaluateAll(nodes => nodes.map(node => node.getAttribute("data-changed-field"))), ["tagline"]);
  await dialog(page).getByRole("button", { name: "Save changes" }).click();
  await page.getByText("School details updated.", { exact: false }).first().waitFor({ timeout: 15_000 });
  const saved = await db.school.findUniqueOrThrow({ where: { id: schoolId } });
  assert.equal(saved.tagline, "Synthetic new motto"); assert.equal(saved.name, "Synthetic Palm Group"); assert.equal(saved.city, "Riyadh"); assert.equal(saved.phone, "+966 11 000 0000");
  await page.locator("[data-history-school]").click();
  await dialog(page).locator("[data-institution-history]").filter({ hasText: "Synthetic new motto" }).waitFor();
  await shot(page, "school-history-en-1440");
  await page.close();
});

test("unpaid invoices block archiving a campus that has no active pupils or classes", async () => {
  const owner = await context("owner"), page = await owner.newPage();
  // role-ux M17: archiving happens from the campus detail (`?view=campuses&campus=<id>`), footer start side.
  await page.goto(`${base}/super?view=campuses&campus=${south}`);
  await page.getByRole("button", { name: "Archive campus" }).click({ timeout: 30_000 });
  const blockers = page.locator("[data-campus-archive-blockers]");
  await blockers.waitFor({ timeout: 15_000 });
  assert.match(await blockers.innerText(), /unpaid invoice/);
  assert.equal((await db.campus.findUniqueOrThrow({ where: { id: south } })).archivedAt, null);
  await shot(page, "archive-invoice-blocker-en-1440");
  await page.close();
});

test("the Arabic campus review reads right-to-left at phone width with a long Arabic name", async () => {
  const ctx = await context("northAdmin-ar", { width: 390, height: 844 }), page = await ctx.newPage();
  await page.goto(`${base}/admin?view=settings&tab=profile`);
  await page.getByRole("button", { name: "تعديل" }).first().click({ timeout: 30_000 });
  await page.locator("#c-name").fill("فرع النخيل الشمالي للتعليم الأساسي والمتوسط");
  await dialog(page).getByRole("button", { name: "مراجعة التغييرات" }).click();
  await dialog(page).locator("[data-change-summary]").waitFor();
  assert.equal(await page.evaluate("document.documentElement.dir"), "rtl");
  assert.equal(await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true);
  await shot(page, "campus-review-ar-390");
  await page.close();
});
