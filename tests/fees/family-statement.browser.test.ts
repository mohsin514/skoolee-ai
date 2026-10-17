import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";
import { schoolToday } from "../../src/lib/fees/statement";

// SKO-431 family statement on the isolated app: every invoice (not the latest five), due states in
// the school's calendar, a part-paid future instalment never shown as overdue, cancelled invoices
// carrying no charge, receipts listed, and the same figures for the guardian and the pupil.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.FEES_TEST_APP || "http://localhost:3107";
const evidence = process.env.FEES_EVIDENCE_DIR || "/tmp/sko431-evidence";
const db = new PrismaClient(), password = "SyntheticStatement431!";
const schoolId = `stm431-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), childId = randomUUID(), siblingId = randomUUID();
const users = new Map<string, { id: string; email: string }>();
let browser: Browser, adminId = "";
const day = (offset: number) => { const d = new Date(`${schoolToday("Asia/Karachi")}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + offset); return d; };

async function user(key: string, role: string, language = "en") {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role: role as never, schoolId, campusId, isActive: true, onboardingComplete: true, preferredLanguage: language } });
  users.set(key, { id, email }); return id;
}
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
async function context(key: string, viewport = { width: 1440, height: 1000 }): Promise<BrowserContext> {
  const saved = sessions.get(key);
  if (saved) return browser.newContext({ viewport, reducedMotion: "reduce", storageState: saved });
  const ctx = await browser.newContext({ viewport, reducedMotion: "reduce" });
  assert.equal((await ctx.request.post(base + "/api/auth/login", { data: { email: users.get(key)!.email, password } })).status(), 200);
  const { secret } = await (await ctx.request.post(base + "/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
  if (secret) { await ctx.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(secret.replace(/\s+/g, "")) } }); await ctx.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } }); }
  sessions.set(key, await ctx.storageState());
  return ctx;
}
const shot = async (page: Page, name: string) => { await page.evaluate("Promise.all(document.getAnimations().map(a => a.finished.catch(() => undefined)))"); await page.screenshot({ path: `${evidence}/${name}.png`, fullPage: true }); };
async function invoice(studentId: string, number: string, total: number, paid: number, dueOffset: number, status: string) {
  const inv = await db.invoice.create({ data: { schoolId, campusId, studentId, invoiceDate: day(dueOffset - 30), dueDate: day(dueOffset), currency: "PKR", invoiceNumber: number, monthlyFee: total, subtotal: total, totalAmount: total, totalAmountPaid: paid, balanceDue: Math.max(total - paid, 0), status: status as never } });
  if (paid > 0) await db.payment.create({ data: { schoolId, campusId, studentId, invoiceId: inv.id, currency: "PKR", amount: paid, paymentDate: day(dueOffset - 5), paymentMethod: "CASH", receiptNo: `RCP-SYN-${number}` } });
  return inv;
}

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Juniper Hills School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Karachi", status: "ACTIVE", plan: "PRO", timezone: "Asia/Karachi" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Juniper Hills", regId: campusId, city: "Karachi" } });
  adminId = await user("admin", "CAMPUS_ADMIN");
  const parent = await user("parent", "PARENT"); const pupil = await user("pupil", "STUDENT", "ur");
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Seven", academicYear: 2026 } });
  await db.student.create({ data: { id: childId, schoolId, campusId, classId, fullName: "Synthetic Areeba Hills", rollNo: "J-1", gender: "FEMALE", enrollmentDate: new Date("2026-04-01Z"), studentUserId: pupil } });
  await db.student.create({ data: { id: siblingId, schoolId, campusId, classId, fullName: "Synthetic Bilal Hills", rollNo: "J-2", gender: "MALE", enrollmentDate: new Date("2026-04-01Z") } });
  for (const studentId of [childId, siblingId]) {
    const relationship = await db.guardianRelationship.create({ data: { schoolId, campusId, studentId, guardianUserId: parent, createdByUserId: adminId, fullName: "Synthetic parent", email: users.get("parent")!.email, relationship: "Parent", status: "ACTIVE", verifiedAt: new Date() } });
    await db.guardianAccessVersion.create({ data: { schoolId, relationshipId: relationship.id, createdByUserId: adminId, reason: "Synthetic statement fixture", effectiveFrom: new Date(Date.now() - 60_000), permissions: { learningRecords: true, attendance: true, finances: studentId === childId, communication: true, pickup: false } } });
  }
  // Seven invoices: overdue part-paid, due today, future part-paid instalment, future unpaid, paid, cancelled, older paid.
  await invoice(childId, "STM-01", 10000, 4000, -10, "PARTIAL");
  await invoice(childId, "STM-02", 5000, 0, 0, "PENDING");
  await invoice(childId, "STM-03", 30000, 10000, 20, "PARTIAL");
  await invoice(childId, "STM-04", 20000, 0, 45, "PENDING");
  await invoice(childId, "STM-05", 8000, 8000, -40, "PAID");
  await invoice(childId, "STM-06", 9000, 0, -20, "CANCELLED");
  await invoice(childId, "STM-07", 6000, 6000, -90, "PAID");
  await invoice(siblingId, "STM-SIB", 7000, 0, -5, "PENDING");
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await db.school.delete({ where: { id: schoolId } }).catch(() => undefined); await db.$disconnect(); });

test("the statement lists every invoice and reconciles; overdue counts only past-due balances", async () => {
  const ctx = await context("parent");
  const json = await (await ctx.request.get(`${base}/api/fees/family-statement?studentId=${childId}`)).json();
  assert.equal(json.data.invoices.length, 7, "all seven invoices, not the latest five");
  const s = json.data.summary;
  assert.deepEqual([s.charges, s.payments, s.closing, s.outstanding, s.reconciles], [79000, 28000, 51000, 51000, true]);
  assert.deepEqual([s.overdue, s.dueToday, s.notYetDue], [6000, 5000, 40000]);
  const states = Object.fromEntries(json.data.invoices.map((i: { invoiceNumber: string; dueState: string }) => [i.invoiceNumber, i.dueState]));
  assert.deepEqual(states, { "STM-01": "OVERDUE", "STM-02": "DUE_TODAY", "STM-03": "NOT_YET_DUE", "STM-04": "NOT_YET_DUE", "STM-05": "PAID", "STM-06": "CANCELLED", "STM-07": "PAID" });
  assert.equal((await ctx.request.get(`${base}/api/fees/family-statement?studentId=${siblingId}`)).status(), 404, "no finance permission for the sibling");
  await ctx.close();
});

test("the guardian page shows the reconciled statement with due states and receipts", async () => {
  const ctx = await context("parent"), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/parent/fees?student=${childId}`);
  await page.locator("[data-family-statement] [data-statement-summary]").waitFor({ timeout: 30_000 });
  assert.equal(await page.locator("[data-due-state]").count(), 7);
  assert.equal(await page.locator('[data-statement-reconciliation="ok"]').count(), 1);
  assert.match(await page.locator('[data-due-state="NOT_YET_DUE"]').first().innerText(), /it is not overdue/);
  assert.equal(await page.locator('[data-due-state="CANCELLED"] [data-pay-state]').count(), 0, "no payment offered on a cancelled invoice");
  assert.match(await page.locator("[data-invoice-receipts]").first().innerText(), /RCP-SYN-STM-/);
  await shot(page, "family-statement-en-1440");
  assert.deepEqual(errors, []); await ctx.close();
});

test("the pupil sees the same figures in Urdu at phone width", async () => {
  const ctx = await context("pupil", { width: 390, height: 844 }), page = await ctx.newPage();
  await page.goto(`${base}/student/fees`);
  await page.locator("[data-statement-summary]").waitFor({ timeout: 30_000 });
  assert.equal(await page.locator("[data-due-state]").count(), 7);
  assert.equal(await page.evaluate("document.documentElement.dir"), "rtl");
  assert.equal(await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true);
  assert.doesNotMatch(await page.locator("[data-statement-summary]").innerText(), /Overdue|Not yet due/);
  await shot(page, "family-statement-ur-390");
  await ctx.close();
});
