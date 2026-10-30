import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";
import { schoolToday } from "../../src/lib/fees/statement";

// SKO-431 instalment plans on the isolated app: one staff member proposes, the same person cannot
// approve, a colleague approves; the family sees only the approved schedule, the invoice's old due
// date stops counting as overdue, and a later payment fills instalments in order.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== (process.env.QA_DB_PORT || "55438") || url.pathname !== "/postgres") throw Error(`Only isolated local DB ${process.env.QA_DB_PORT || "55438"} is allowed`);
const base = process.env.FEES_TEST_APP || "http://localhost:3107";
const evidence = process.env.FEES_EVIDENCE_DIR || "/tmp/sko431-evidence";
const db = new PrismaClient(), password = "SyntheticPlans431!";
const schoolId = `pln431-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), childId = randomUUID(), invoiceId = randomUUID();
const users = new Map<string, { id: string; email: string }>();
let browser: Browser, planId = "";
const today = schoolToday("Asia/Karachi");
const plusDays = (n: number) => { const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

async function user(key: string, role: string) {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role: role as never, schoolId, campusId, isActive: true, onboardingComplete: true } });
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
const shot = async (page: Page, name: string) => { await page.evaluate("Promise.all(document.getAnimations().map(a => a.finished.catch(() => undefined)))"); await page.screenshot({ path: `${evidence}/${name}.png` }); };
const statement = async (ctx: BrowserContext) => (await (await ctx.request.get(`${base}/api/fees/family-statement?studentId=${childId}`)).json()).data;

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Orchard School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Peshawar", status: "ACTIVE", plan: "PRO", timezone: "Asia/Karachi" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Orchard Main", regId: campusId, city: "Peshawar" } });
  const admin = await user("bursar", "CAMPUS_ADMIN"); await user("accountant", "ACCOUNTANT"); const parent = await user("parent", "PARENT");
  await db.academicCycle.create({ data: { schoolId, campusId, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Nine", academicYear: 2026 } });
  await db.student.create({ data: { id: childId, schoolId, campusId, classId, fullName: "Synthetic Hamza Orchard", rollNo: "O-1", gender: "MALE", enrollmentDate: new Date("2026-04-01Z") } });
  const relationship = await db.guardianRelationship.create({ data: { schoolId, campusId, studentId: childId, guardianUserId: parent, createdByUserId: admin, fullName: "Synthetic parent", email: users.get("parent")!.email, relationship: "Parent", status: "ACTIVE", verifiedAt: new Date() } });
  await db.guardianAccessVersion.create({ data: { schoolId, relationshipId: relationship.id, createdByUserId: admin, reason: "Synthetic plan fixture", effectiveFrom: new Date(Date.now() - 60_000), permissions: { learningRecords: true, attendance: true, finances: true, communication: true, pickup: false } } });
  await db.invoice.create({ data: { id: invoiceId, schoolId, campusId, studentId: childId, invoiceDate: new Date(`${plusDays(-35)}T00:00:00Z`), dueDate: new Date(`${plusDays(-5)}T00:00:00Z`), currency: "PKR", invoiceNumber: "PLN-001", monthlyFee: 90000, subtotal: 90000, totalAmount: 90000, balanceDue: 90000 } });
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await db.school.delete({ where: { id: schoolId } }).catch(() => undefined); await db.$disconnect(); });

test("a schedule that does not add up is refused; the proposer cannot approve their own plan", async () => {
  const accountant = await context("accountant");
  const bad = await accountant.request.post(`${base}/api/fees/payment-plans`, { data: { invoiceId, installments: [{ dueDate: plusDays(10), amount: 40000 }, { dueDate: plusDays(40), amount: 40000 }] } });
  assert.equal(bad.status(), 422);
  const proposed = await accountant.request.post(`${base}/api/fees/payment-plans`, { data: { invoiceId, installments: [{ dueDate: plusDays(10), amount: 30000 }, { dueDate: plusDays(40), amount: 30000 }, { dueDate: plusDays(70), amount: 30000 }] } });
  assert.equal(proposed.status(), 201);
  planId = (await proposed.json()).data.id;
  assert.equal((await accountant.request.post(`${base}/api/fees/payment-plans`, { data: { invoiceId, installments: [{ dueDate: plusDays(10), amount: 45000 }, { dueDate: plusDays(40), amount: 45000 }] } })).status(), 409, "one open plan per invoice");
  const self = await accountant.request.patch(`${base}/api/fees/payment-plans`, { data: { id: planId, version: 1, action: "approve" } });
  assert.equal(self.status(), 403);
  assert.match((await self.json()).error, /someone other than the person who proposed it/);
  const parent = await context("parent");
  const before = await statement(parent);
  assert.equal(before.invoices[0].installments, null, "the family does not see a proposed plan");
  assert.equal(before.invoices[0].dueState, "OVERDUE");
  await accountant.close(); await parent.close();
});

test("a colleague approves in the invoice dialog; the family then sees the schedule and nothing overdue", async () => {
  const ctx = await context("bursar"), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/admin?view=fees`);
  await page.getByRole("tab", { name: "Invoices", exact: true }).first().click({ timeout: 30_000 }); // FeesPanel sections are ViewTabs; the campus admin approves plans in the invoice drawer (role-ux §3.1)
  await page.getByRole("button", { name: "View details" }).first().click({ timeout: 30_000 });
  const panel = page.locator('[data-installment-panel="proposed"]');
  await panel.waitFor({ timeout: 15_000 });
  assert.match(await panel.innerText(), /waiting for your approval/);
  await shot(page, "installment-plan-approve-en-1440");
  await panel.getByRole("button", { name: "Approve plan" }).click();
  // Approving a schedule is confirmed (role-ux R3); the confirm button repeats the verb.
  await page.getByRole("dialog", { name: "Approve this instalment plan?" }).getByRole("button", { name: "Approve plan" }).click();
  await page.locator('[data-installment-panel="active"]').waitFor();
  assert.equal((await db.paymentPlan.findUniqueOrThrow({ where: { id: planId } })).approvedById, users.get("bursar")!.id);
  assert.deepEqual(errors, []); await ctx.close();
  const parent = await context("parent");
  const after = await statement(parent);
  assert.equal(after.invoices[0].dueState, "NOT_YET_DUE", "the old single due date no longer makes it overdue");
  assert.deepEqual([after.summary.overdue, after.summary.notYetDue, after.summary.reconciles], [0, 90000, true]);
  await parent.close();
});

test("a later payment fills instalments in date order and the family page shows the schedule", async () => {
  const bursar = await context("bursar");
  assert.equal((await bursar.request.post(`${base}/api/fees/collect`, { data: { studentId: childId, invoiceId, amount: 40000, paymentMethod: "CASH", paymentDate: today, idempotencyKey: randomUUID() } })).status(), 201);
  await bursar.close();
  const parent = await context("parent"), page = await parent.newPage();
  const data = await statement(parent);
  assert.deepEqual(data.invoices[0].installments.map((i: { state: string; remaining: number }) => [i.state, i.remaining]), [["PAID", 0], ["PART_PAID", 20000], ["NOT_YET_DUE", 30000]]);
  await page.goto(`${base}/parent/fees?student=${childId}`);
  await page.locator("[data-installment-schedule]").waitFor({ timeout: 30_000 });
  assert.equal(await page.locator("[data-installment-state]").count(), 3);
  await shot(page, "installment-plan-family-en-1440");
  await parent.close();
});
