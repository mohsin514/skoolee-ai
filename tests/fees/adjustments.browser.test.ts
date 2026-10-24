import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-433 on the isolated app: concurrent refund requests cannot exceed what is refundable; the
// requester cannot approve; approval is not disbursement; a refund is paid out once; waivers reduce
// what is owed without cash; a stale request cannot be approved; families see outcomes, not notes.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.FEES_TEST_APP || "http://localhost:3107";
const evidence = process.env.FEES_EVIDENCE_DIR || "/tmp/sko433-evidence";
const db = new PrismaClient(), password = "SyntheticAdjust433!";
const schoolId = `adj433-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), childId = randomUUID(), invoiceId = randomUUID();
const users = new Map<string, { id: string; email: string }>();
const ctxs = new Map<string, BrowserContext>();
let browser: Browser, paymentId = "", refundId = "";

async function user(key: string, role: string) {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role: role as never, schoolId, campusId, isActive: true, onboardingComplete: true } });
  users.set(key, { id, email }); return id;
}
async function context(key: string) {
  if (ctxs.has(key)) return ctxs.get(key)!;
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  assert.equal((await ctx.request.post(base + "/api/auth/login", { data: { email: users.get(key)!.email, password } })).status(), 200);
  const { secret } = await (await ctx.request.post(base + "/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
  if (secret) { await ctx.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(secret.replace(/\s+/g, "")) } }); await ctx.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } }); }
  ctxs.set(key, ctx); return ctx;
}
const request = (ctx: BrowserContext, body: Record<string, unknown>) => ctx.request.post(`${base}/api/fees/adjustments`, { data: { invoiceId, reasonCategory: "WITHDRAWAL", reason: "Synthetic staff reason with evidence", publicExplanation: "Synthetic family explanation", privateNote: "SYNTHETIC-PRIVATE-NOTE", idempotencyKey: randomUUID(), ...body } });
// Approve / decline are money decisions with a typed reason kept in the audit row (role-ux R3, P8-10).
const decide = (ctx: BrowserContext, id: string, action: string, reference = "") => ctx.request.patch(`${base}/api/fees/adjustments`, { data: { id, action, reference, ...(action === "approve" || action === "decline" ? { reason: "Checked the receipt and the fee policy." } : {}) } });
const invoice = () => db.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
const shot = async (page: Page, name: string) => { await page.evaluate("Promise.all(document.getAnimations().map(a => a.finished.catch(() => undefined)))"); await page.screenshot({ path: `${evidence}/${name}.png` }); };

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Cedar Ledger School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Karachi", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Cedar Ledger", regId: campusId, city: "Karachi" } });
  const bursar = await user("bursar", "CAMPUS_ADMIN"); await user("clerk", "ACCOUNTANT"); const parent = await user("parent", "PARENT");
  await db.academicCycle.create({ data: { schoolId, campusId, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Eight", academicYear: 2026 } });
  await db.student.create({ data: { id: childId, schoolId, campusId, classId, fullName: "Synthetic Sana Cedar", rollNo: "C-9", gender: "FEMALE", enrollmentDate: new Date("2026-04-01Z") } });
  const relationship = await db.guardianRelationship.create({ data: { schoolId, campusId, studentId: childId, guardianUserId: parent, createdByUserId: bursar, fullName: "Synthetic parent", email: users.get("parent")!.email, relationship: "Parent", status: "ACTIVE", verifiedAt: new Date() } });
  await db.guardianAccessVersion.create({ data: { schoolId, relationshipId: relationship.id, createdByUserId: bursar, reason: "Synthetic adjustment fixture", effectiveFrom: new Date(Date.now() - 60_000), permissions: { learningRecords: true, attendance: true, finances: true, communication: true, pickup: false } } });
  await db.invoice.create({ data: { id: invoiceId, schoolId, campusId, studentId: childId, invoiceDate: new Date("2026-09-01Z"), dueDate: new Date("2026-11-30Z"), currency: "PKR", invoiceNumber: "ADJ-001", monthlyFee: 100000, subtotal: 100000, totalAmount: 100000, balanceDue: 100000 } });
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
  const collected = await (await (await context("bursar")).request.post(`${base}/api/fees/collect`, { data: { studentId: childId, invoiceId, amount: 60000, paymentMethod: "BANK", paymentDate: "2026-10-01", idempotencyKey: randomUUID() } })).json();
  paymentId = collected.data.paymentId;
});
after(async () => { for (const ctx of ctxs.values()) await ctx.close(); await browser?.close(); await db.school.delete({ where: { id: schoolId } }).catch(() => undefined); await db.$disconnect(); });

test("two refund requests that together exceed the payment cannot both be reserved", async () => {
  const clerk = await context("clerk");
  const results = await Promise.all([request(clerk, { kind: "REFUND", paymentId, amount: 40000 }), request(clerk, { kind: "REFUND", paymentId, amount: 40000 })]);
  assert.deepEqual(results.map(r => r.status()).sort(), [201, 409]);
  refundId = (await results.find(r => r.status() === 201)!.json()).data.id;
  assert.equal(await db.financialAdjustment.count({ where: { invoiceId, kind: "REFUND" } }), 1);
});

test("the requester cannot approve; approval is not disbursement; disbursement is recorded once", async () => {
  const clerk = await context("clerk"), bursar = await context("bursar");
  const self = await decide(clerk, refundId, "approve");
  assert.equal(self.status(), 403);
  assert.match((await self.json()).error, /Only your campus admin approves/); // role-ux G28: the finance desk never checks
  assert.equal((await (await decide(bursar, refundId, "approve")).json()).data.status, "APPROVED");
  assert.deepEqual([(await invoice()).totalAmountPaid, await db.payment.count({ where: { invoiceId, amount: { lt: 0 } } })], [60000, 0], "approval moves no money");
  const family = await context("parent");
  const pending = (await (await family.request.get(`${base}/api/fees/family-statement?studentId=${childId}`)).json()).data.invoices[0].adjustments;
  assert.deepEqual(pending.map((row: { status: string }) => row.status), ["APPROVED"]);
  const paidOut = await Promise.all([1, 2, 3].map(() => decide(bursar, refundId, "disbursed", "SYN-BANK-REF-77")));
  assert.deepEqual(paidOut.map(r => r.status()), [200, 200, 200]);
  assert.equal(await db.payment.count({ where: { invoiceId, amount: { lt: 0 } } }), 1, "one refund payment");
  const after = await invoice();
  assert.deepEqual([after.totalAmountPaid, after.balanceDue], [20000, 80000]);
  assert.equal(await db.ledgerEntry.count({ where: { campusId, amount: -40000 } }), 1, "one balancing ledger entry");
});

test("a waiver reduces what is owed without cash; a stale request cannot be approved", async () => {
  const clerk = await context("clerk"), bursar = await context("bursar");
  const waiver = (await (await request(clerk, { kind: "WAIVER", amount: 30000, reasonCategory: "HARDSHIP" })).json()).data;
  assert.equal((await (await decide(bursar, waiver.id, "approve")).json()).data.status, "APPLIED");
  const after = await invoice();
  assert.deepEqual([after.totalAmount, after.balanceDue, after.totalAmountPaid], [70000, 50000, 20000]);
  assert.equal(await db.payment.count({ where: { invoiceId } }), 2, "no payment was created for the waiver");
  const credit = (await (await request(clerk, { kind: "CREDIT_NOTE", amount: 10000, reasonCategory: "BILLING_ERROR" })).json()).data;
  assert.equal((await bursar.request.post(`${base}/api/fees/collect`, { data: { studentId: childId, invoiceId, amount: 5000, paymentMethod: "CASH", paymentDate: "2026-10-10", idempotencyKey: randomUUID() } })).status(), 201);
  const stale = await decide(bursar, credit.id, "approve");
  assert.equal(stale.status(), 409);
  assert.match((await stale.json()).error, /changed since this request/);
  assert.equal((await decide(bursar, credit.id, "decline")).status(), 200);
});

test("families see decided outcomes with the public explanation only; the statement still reconciles", async () => {
  const family = await context("parent");
  const data = (await (await family.request.get(`${base}/api/fees/family-statement?studentId=${childId}`)).json()).data;
  const text = JSON.stringify(data);
  assert.doesNotMatch(text, /SYNTHETIC-PRIVATE-NOTE|Synthetic staff reason/);
  assert.deepEqual(data.invoices[0].adjustments.map((row: { kind: string; status: string }) => `${row.kind}:${row.status}`), ["REFUND:DISBURSED", "WAIVER:APPLIED"]);
  assert.equal(data.summary.reconciles, true);
  const page = await family.newPage();
  await page.goto(`${base}/parent/fees?student=${childId}`);
  await page.locator("[data-invoice-adjustments]").waitFor({ timeout: 30_000 });
  assert.match(await page.locator("[data-invoice-adjustments]").innerText(), /not a cash refund/);
  await shot(page, "adjustments-family-en-1440");
  await page.close();
});

test("the bursar sees the adjustment history and effect wording in the invoice dialog", async () => {
  const bursar = await context("bursar"), page = await bursar.newPage();
  await page.goto(`${base}/admin?view=fees`);
  await page.getByRole("tab", { name: "Invoices", exact: true }).first().click({ timeout: 30_000 }); // FeesPanel sections are ViewTabs (role-ux §3.1)
  await page.getByRole("button", { name: "View details" }).first().click({ timeout: 30_000 });
  const panel = page.locator("[data-adjustments-panel]");
  await panel.locator('[data-adjustment-status="DISBURSED"]').waitFor({ timeout: 15_000 });
  assert.equal(await panel.locator('[data-adjustment-status="DISBURSED"]').count(), 1);
  assert.equal(await panel.locator('[data-adjustment-status="DECLINED"]').count(), 1);
  await panel.scrollIntoViewIfNeeded();
  await shot(page, "adjustments-staff-en-1440");
  await page.close();
});
