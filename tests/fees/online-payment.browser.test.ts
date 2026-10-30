import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-431 / SKO-474 on the isolated development app (sandbox mode, no real gateway): availability is
// decided before an order exists, a pending payment is never started twice, the return lands on the
// same child and invoice and shows only server-confirmed status, and other families cannot see it.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== (process.env.QA_DB_PORT || "55438") || url.pathname !== "/postgres") throw Error(`Only isolated local DB ${process.env.QA_DB_PORT || "55438"} is allowed`);
const base = process.env.FEES_TEST_APP || "http://localhost:3107";
const evidence = process.env.FEES_EVIDENCE_DIR || "/tmp/sko431-evidence";
const db = new PrismaClient(), password = "SyntheticFees431!";
const schoolId = `fee431-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID();
const users = new Map<string, { id: string; email: string }>();
const child1 = randomUUID(), child2 = randomUUID(), child3 = randomUUID();
const inv1 = randomUUID(), inv2 = randomUUID(), invSar = randomUUID(), inv3 = randomUUID();
let browser: Browser, orderRef = "", adminId = "";

async function user(key: string, role: string, language = "en") {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role: role as never, schoolId, campusId, isActive: true, onboardingComplete: true, preferredLanguage: language } });
  users.set(key, { id, email });
  return id;
}
async function guardian(parent: string, studentId: string) {
  const relationship = await db.guardianRelationship.create({ data: { schoolId, campusId, studentId, guardianUserId: users.get(parent)!.id, createdByUserId: adminId, fullName: `Synthetic ${parent}`, email: users.get(parent)!.email, relationship: "Parent", status: "ACTIVE", verifiedAt: new Date() } });
  await db.guardianAccessVersion.create({ data: { schoolId, relationshipId: relationship.id, createdByUserId: adminId, reason: "Synthetic fee fixture", effectiveFrom: new Date(Date.now() - 60_000), permissions: { learningRecords: true, attendance: true, finances: true, communication: true, pickup: false } } });
}
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
async function context(key: string, viewport = { width: 1440, height: 1000 }): Promise<BrowserContext> {
  const saved = sessions.get(key);
  if (saved) return browser.newContext({ viewport, reducedMotion: "reduce", storageState: saved });
  const ctx = await browser.newContext({ viewport, reducedMotion: "reduce" });
  assert.equal((await ctx.request.post(base + "/api/auth/login", { data: { email: users.get(key)!.email, password } })).status(), 200);
  const { secret } = await (await ctx.request.post(base + "/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
  if (secret) {
    await ctx.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(secret.replace(/\s+/g, "")) } });
    await ctx.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } });
  }
  sessions.set(key, await ctx.storageState());
  return ctx;
}
const settled = (page: Page) => page.evaluate("Promise.all(document.getAnimations().map(a => a.finished.catch(() => undefined)))");
const shot = async (page: Page, name: string) => { await settled(page); await page.screenshot({ path: `${evidence}/${name}.png` }); };
const invoice = (id: string, studentId: string, currency: string, amount: number) => db.invoice.create({ data: { id, schoolId, campusId, studentId, invoiceDate: new Date("2026-09-01Z"), dueDate: new Date("2026-11-01Z"), currency, invoiceNumber: `SYN-431-${id.slice(0, 6)}`, monthlyFee: amount, subtotal: amount, totalAmount: amount, balanceDue: amount } });

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Cypress School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Cypress Main", regId: campusId, city: "Lahore" } });
  adminId = await user("admin", "CAMPUS_ADMIN");
  await user("parent", "PARENT"); await user("parent-ur", "PARENT", "ur"); await user("other", "PARENT"); const pupilLogin = await user("pupil", "STUDENT");
  await db.academicCycle.create({ data: { schoolId, campusId, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Five", section: "A", academicYear: 2026 } });
  for (const [id, name, roll, login] of [[child1, "Synthetic Hira Pupil", "C-1", pupilLogin], [child2, "Synthetic Omar Pupil", "C-2", null], [child3, "Synthetic Other Pupil", "C-3", null]] as const) await db.student.create({ data: { id, schoolId, campusId, classId, fullName: name, rollNo: roll, gender: "FEMALE", enrollmentDate: new Date("2026-04-01Z"), ...(login ? { studentUserId: login } : {}) } });
  await guardian("parent", child1); await guardian("parent", child2); await guardian("parent-ur", child2); await guardian("other", child3);
  await invoice(inv1, child1, "PKR", 500000); await invoice(inv2, child2, "PKR", 300000); await invoice(invSar, child2, "SAR", 10000); await invoice(inv3, child3, "PKR", 200000);
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await db.school.delete({ where: { id: schoolId } }).catch(() => undefined); await db.$disconnect(); });

test("the guardian starts one payment for the second child and returns to that child's invoice", async () => {
  const ctx = await context("parent");
  const started = await ctx.request.post(`${base}/api/fees/pay-online`, { data: { invoiceId: inv2 } });
  assert.equal(started.status(), 200);
  const body = await started.json();
  orderRef = body.orderRef;
  assert.equal(body.method, "sandbox");
  assert.equal(body.returnPath, `/parent/fees?invoice=${inv2}&payment=${orderRef}&student=${child2}`);
  assert.equal(new URL(body.url).searchParams.get("returnTo"), body.returnPath);
  const again = await ctx.request.post(`${base}/api/fees/pay-online`, { data: { invoiceId: inv2 } });
  assert.equal(again.status(), 409);
  assert.deepEqual([(await again.json()).code, (await again.json()).orderRef], ["PAYMENT_PENDING", orderRef]);
  assert.equal(await db.onlinePaymentOrder.count({ where: { invoiceId: inv2 } }), 1, "one logical order");
  const status = await (await ctx.request.get(`${base}/api/fees/pay-online?ref=${orderRef}`)).json();
  assert.equal(status.order.status, "PENDING");
  await ctx.close();
});

test("an unsupported currency is refused before any order exists, and other families cannot see or pay", async () => {
  const ctx = await context("parent");
  const sar = await ctx.request.post(`${base}/api/fees/pay-online`, { data: { invoiceId: invSar } });
  assert.equal(sar.status(), 503);
  assert.deepEqual([(await sar.json()).code, (await sar.json()).reason], ["PAYMENT_METHOD_UNAVAILABLE", "CURRENCY_UNSUPPORTED"]);
  assert.equal(await db.onlinePaymentOrder.count({ where: { invoiceId: invSar } }), 0, "no orphan order");
  assert.equal((await ctx.request.post(`${base}/api/fees/pay-online`, { data: { invoiceId: inv3 } })).status(), 404, "another family's invoice");
  await ctx.close();
  const other = await context("other");
  assert.equal((await other.request.get(`${base}/api/fees/pay-online?ref=${orderRef}`)).status(), 404, "another family's payment reference");
  await other.close();
  const pupil = await context("pupil");
  const own = await (await pupil.request.post(`${base}/api/fees/pay-online`, { data: { invoiceId: inv1 } })).json();
  assert.ok(own.returnPath.startsWith(`/student/fees?invoice=${inv1}&payment=`), "a pupil returns to their own fees");
  assert.equal((await pupil.request.post(`${base}/api/fees/pay-online`, { data: { invoiceId: inv2 } })).status(), 404, "a pupil cannot pay a sibling's invoice");
  await pupil.close();
});

test("the return page shows pending, then the server-confirmed receipt for the right child, once", async () => {
  const ctx = await context("parent"), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/parent/fees?invoice=${inv2}&payment=${orderRef}&student=${child2}`);
  const banner = page.locator("[data-payment-return]");
  await page.locator('[data-payment-return="PENDING"]').waitFor({ timeout: 30_000 });
  assert.match(await banner.innerText(), /pending confirmation\. Please do not pay again yet/);
  await page.getByText("Synthetic Omar Pupil").first().waitFor();
  await page.locator(`#invoice-${inv2}[data-focused-invoice]`).waitFor();
  assert.equal(await page.locator(`#invoice-${inv2} [data-pay-state="pending"]`).count(), 1, "the pending invoice offers status, not a second payment");
  assert.equal(await page.locator(`#invoice-${invSar} [data-pay-state="unavailable"][data-pay-reason="CURRENCY_UNSUPPORTED"]`).count(), 0, "SAR is listed under its own currency");
  await shot(page, "payment-pending-en-1440");
  // The development sandbox stands in for the provider's verified callback.
  assert.equal((await ctx.request.post(`${base}/api/safepay/simulate`, { data: { orderRef } })).status(), 200);
  await page.locator('[data-payment-return="COMPLETED"]').waitFor({ timeout: 20_000 });
  assert.match(await banner.innerText(), /Payment confirmed and allocated/);
  assert.match(await banner.innerText(), /Receipt/);
  await shot(page, "payment-confirmed-en-1440");
  assert.equal(await db.payment.count({ where: { invoiceId: inv2 } }), 1);
  assert.equal((await db.invoice.findUniqueOrThrow({ where: { id: inv2 } })).balanceDue, 0);
  assert.equal((await ctx.request.post(`${base}/api/safepay/simulate`, { data: { orderRef } })).status(), 200, "a replayed confirmation is accepted");
  assert.equal(await db.payment.count({ where: { invoiceId: inv2 } }), 1, "and records nothing twice");
  await page.getByRole("combobox", { name: "Currency" }).selectOption("SAR");
  await page.locator(`#invoice-${invSar} [data-pay-state="unavailable"][data-pay-reason="CURRENCY_UNSUPPORTED"]`).waitFor();
  await shot(page, "payment-currency-unavailable-en-1440");
  assert.deepEqual(errors, []); await ctx.close();
});

test("the Urdu guardian view reads right-to-left at phone width", async () => {
  const ctx = await context("parent-ur", { width: 390, height: 844 }), page = await ctx.newPage();
  await page.goto(`${base}/parent/fees?invoice=${inv2}&payment=${orderRef}&student=${child2}`);
  await page.locator('[data-payment-return="COMPLETED"]').waitFor({ timeout: 30_000 });
  assert.equal(await page.evaluate("document.documentElement.dir"), "rtl");
  assert.equal(await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true);
  assert.doesNotMatch(await page.locator("[data-payment-return]").innerText(), /Payment confirmed/, "the status is translated");
  await shot(page, "payment-confirmed-ur-390");
  await ctx.close();
});
