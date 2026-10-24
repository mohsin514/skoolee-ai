import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-475 browser acceptance on the isolated app: the accountant's collection commits on the server but
// the response is lost; retrying from the same dialog replays the original receipt and posts nothing twice.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.FEES_TEST_APP || "http://localhost:3107";
const evidence = process.env.FEES_EVIDENCE_DIR || "/tmp/sko432-evidence";
const db = new PrismaClient(), password = "SyntheticReplay475!";
const schoolId = `rep475-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), studentId = randomUUID(), invoiceId = randomUUID();
const email = `${randomUUID()}@example.invalid`;
let browser: Browser;

async function context(viewport = { width: 1440, height: 1000 }): Promise<BrowserContext> {
  const ctx = await browser.newContext({ viewport, reducedMotion: "reduce" });
  assert.equal((await ctx.request.post(base + "/api/auth/login", { data: { email, password } })).status(), 200);
  const { secret } = await (await ctx.request.post(base + "/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
  if (secret) { await ctx.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(secret.replace(/\s+/g, "")) } }); await ctx.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } }); }
  return ctx;
}
const shot = async (page: Page, name: string) => { await page.evaluate("Promise.all(document.getAnimations().map(a => a.finished.catch(() => undefined)))"); await page.screenshot({ path: `${evidence}/${name}.png` }); };

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Tamarind School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Quetta", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Tamarind Main", regId: campusId, city: "Quetta" } });
  await db.user.create({ data: { email, password: await bcrypt.hash(password, 12), fullName: "Synthetic accountant", role: "ACCOUNTANT", schoolId, campusId, isActive: true, onboardingComplete: true } });
  await db.academicCycle.create({ data: { schoolId, campusId, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Three", section: "A", academicYear: 2026 } });
  await db.student.create({ data: { id: studentId, schoolId, campusId, classId, fullName: "Synthetic Zara Tamarind", rollNo: "T-1", gender: "FEMALE", enrollmentDate: new Date("2026-04-01Z") } });
  await db.invoice.create({ data: { id: invoiceId, schoolId, campusId, studentId, invoiceDate: new Date("2026-09-01Z"), dueDate: new Date("2026-10-30Z"), currency: "PKR", invoiceNumber: "SYN-475-001", monthlyFee: 500000, subtotal: 500000, totalAmount: 500000, balanceDue: 500000 } });
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await db.school.delete({ where: { id: schoolId } }).catch(() => undefined); await db.$disconnect(); });

test("a collection whose response is lost replays the same receipt on retry and is posted once", async () => {
  const ctx = await context(), page = await ctx.newPage(), errors: string[] = [], keys: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  let dropped = false;
  await page.route("**/api/fees/collect", async route => {
    if (route.request().method() !== "POST") return route.continue();
    keys.push(route.request().postDataJSON().idempotencyKey);
    if (!dropped) { dropped = true; await route.fetch(); return route.abort("connectionreset"); }
    return route.continue();
  });
  await page.goto(`${base}/accountant?view=payments`);
  await page.getByRole("button", { name: "Record payment" }).first().click({ timeout: 30_000 });
  await page.getByPlaceholder("Search by name or roll no...").fill("Tamarind");
  await page.getByPlaceholder("Search by name or roll no...").press("Enter");
  await page.getByRole("button", { name: /Synthetic Zara Tamarind/ }).click({ timeout: 15_000 });
  await page.getByRole("button", { name: "Continue to payment" }).click({ timeout: 15_000 });
  await page.getByRole("button", { name: "Save & Generate Receipt" }).click();
  // The response was lost: the dialog says the outcome is unknown and offers to check, not to pay again.
  await page.locator('[data-collect-outcome="unknown"]').waitFor({ timeout: 15_000 });
  assert.equal(await db.payment.count({ where: { invoiceId } }), 1, "the first attempt committed on the server");
  await shot(page, "collect-outcome-unknown-en-1440");
  await page.getByRole("button", { name: "Check payment result" }).click();
  await page.getByText("This payment was already recorded; no duplicate was posted.").waitFor({ timeout: 15_000 });
  await shot(page, "collect-replayed-receipt-en-1440");
  assert.equal(keys.length, 2); assert.equal(keys[0], keys[1], "the retry reused the operation key");
  const payments = await db.payment.findMany({ where: { invoiceId }, select: { id: true, receiptNo: true } });
  assert.equal(payments.length, 1);
  assert.match(await page.locator("body").innerText(), new RegExp(payments[0].receiptNo!));
  assert.equal(await db.ledgerEntry.count({ where: { paymentId: payments[0].id } }), 1);
  assert.equal((await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).balanceDue, 0);
  assert.deepEqual(errors, []); await ctx.close();
});
