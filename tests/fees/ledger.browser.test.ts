import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-468 on the isolated app: manual, fee and payroll rows in two currencies; totals, report and
// export reconcile to the same filtered rows; retries post once; reconciled periods are protected and
// corrections keep the original; used accounts keep their type and are deactivated, not deleted;
// another campus sees nothing.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.FEES_TEST_APP || "http://localhost:3107";
const evidence = process.env.FEES_EVIDENCE_DIR || "/tmp/sko468-evidence";
const db = new PrismaClient(), password = "SyntheticLedger468!";
const schoolId = `led468-${randomUUID()}`, campusId = randomUUID(), otherCampusId = randomUUID(), classId = randomUUID(), childId = randomUUID(), invoiceId = randomUUID(), bankId = randomUUID();
const users = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
let browser: Browser, incomeAccount = "", expenseAccount = "", reconciledEntry = "", payrollLineId = "";

async function user(key: string, role: string, campus: string | null = campusId, language = "en") {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role: role as never, schoolId, campusId: campus, isActive: true, onboardingComplete: true, preferredLanguage: language } });
  users.set(key, { id, email }); return id;
}
async function context(key: string, viewport = { width: 1440, height: 1000 }) {
  const saved = sessions.get(key);
  if (saved) return browser.newContext({ viewport, storageState: saved, reducedMotion: "reduce", acceptDownloads: true });
  const ctx = await browser.newContext({ viewport, reducedMotion: "reduce", acceptDownloads: true });
  assert.equal((await ctx.request.post(base + "/api/auth/login", { data: { email: users.get(key)!.email, password } })).status(), 200);
  const { secret } = await (await ctx.request.post(base + "/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
  if (secret) { await ctx.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(secret.replace(/\s+/g, "")) } }); await ctx.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } }); }
  sessions.set(key, await ctx.storageState());
  return ctx;
}
const ledger = `${base}/api/accounts/ledger`;
const entry = (body: Record<string, unknown>) => ({ campusId, kind: "INCOME", sourceName: "Synthetic donation", accountId: incomeAccount, currency: "PKR", amount: 25000, date: "2026-10-05", idempotencyKey: randomUUID(), ...body });
const shot = async (page: Page, name: string) => { await page.evaluate("Promise.all(document.getAnimations().filter(a => Number.isFinite(Number(a.effect && a.effect.getComputedTiming().endTime))).map(a => a.finished.catch(() => undefined)))"); await page.screenshot({ path: `${evidence}/${name}.png` }); };

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Teak Ledger School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Karachi", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Teak Main", regId: campusId, city: "Karachi" } });
  await db.campus.create({ data: { id: otherCampusId, schoolId, name: "Teak North", regId: otherCampusId, city: "Karachi" } });
  const bursar = await user("bursar", "CAMPUS_ADMIN"); await user("accountant", "ACCOUNTANT"); await user("accountant-ar", "ACCOUNTANT", campusId, "ar"); await user("other", "CAMPUS_ADMIN", otherCampusId);
  const teacher = await user("teacher", "TEACHER");
  await db.localePolicy.create({ data: { schoolId, scopeKey: "school", settings: { timezone: "Asia/Karachi", currency: "PKR" }, effectiveAt: new Date("2026-01-01T00:00:00Z"), createdBy: bursar, financeReviewedBy: bursar } });
  await db.academicCycle.create({ data: { schoolId, campusId, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Seven", academicYear: 2026 } });
  await db.student.create({ data: { id: childId, schoolId, campusId, classId, fullName: "Synthetic Zara Teak", rollNo: "T-7", gender: "FEMALE", enrollmentDate: new Date("2026-04-01Z") } });
  await db.invoice.create({ data: { id: invoiceId, schoolId, campusId, studentId: childId, invoiceDate: new Date("2026-09-01Z"), dueDate: new Date("2026-11-30Z"), currency: "PKR", invoiceNumber: "LED-001", monthlyFee: 100000, subtotal: 100000, totalAmount: 100000, balanceDue: 100000 } });
  incomeAccount = (await db.chartOfAccount.create({ data: { schoolId, campusId, name: "Donations", type: "INCOME" } })).id;
  expenseAccount = (await db.chartOfAccount.create({ data: { schoolId, campusId, name: "Utilities", type: "EXPENSE" } })).id;
  await db.bankAccount.create({ data: { id: bankId, schoolId, campusId, name: "Synthetic Operating Account", currency: "PKR" } });
  // A September expense already sits inside a reconciled bank statement.
  reconciledEntry = (await db.ledgerEntry.create({ data: { schoolId, campusId, kind: "EXPENSE", sourceName: "Synthetic generator fuel", accountId: expenseAccount, bankAccountId: bankId, currency: "PKR", amount: 40000, date: new Date("2026-09-15Z"), createdById: bursar } })).id;
  await db.bankReconciliation.create({ data: { schoolId, campusId, bankAccount: bankId, importDate: new Date(), statementPeriodFrom: new Date("2026-09-01Z"), statementPeriodTo: new Date("2026-09-30Z"), status: "reconciled", reconciledBy: bursar, reconciledAt: new Date(), reconciliationDetailsJson: { currency: "PKR", rows: [{ ledgerId: reconciledEntry }] } } });
  const run = await db.payrollRun.create({ data: { schoolId, campusId, month: 10, year: 2026, status: "FINALIZED" } });
  payrollLineId = (await db.payrollLine.create({ data: { schoolId, payrollRunId: run.id, userId: teacher, basic: 300000, net: 300000 } })).id;
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await db.school.delete({ where: { id: schoolId } }).catch(() => undefined); await db.$disconnect(); });

test("invalid entries are rejected with guidance; a retried entry posts once; a changed retry is refused", async () => {
  const ctx = await context("bursar");
  const cases: [Record<string, unknown>, RegExp][] = [
    [{ amount: 0 }, /amount greater than zero/], [{ accountId: expenseAccount }, /income account/], [{ date: "2099-01-01" }, /future/],
    [{ sourceName: "x" }, /Describe what this money is for/], [{ currency: "USD", bankAccountId: bankId }, /currency must match/], [{ currency: "XYZ" }, /Invalid currency/],
  ];
  for (const [body, message] of cases) {
    const response = await ctx.request.post(ledger, { data: entry(body) });
    assert.equal(response.status(), 400, JSON.stringify(body));
    assert.match((await response.json()).error, message);
  }
  const key = randomUUID();
  const replies = await Promise.all([1, 2, 3].map(() => ctx.request.post(ledger, { data: entry({ idempotencyKey: key }) })));
  assert.deepEqual(replies.map(r => r.status()).sort(), [200, 200, 201]);
  assert.equal(await db.ledgerEntry.count({ where: { campusId, idempotencyKey: key } }), 1);
  const changed = await ctx.request.post(ledger, { data: entry({ idempotencyKey: key, amount: 99999 }) });
  assert.equal(changed.status(), 409);
  assert.equal((await ctx.request.post(ledger, { data: entry({ currency: "USD", amount: 1000, sourceName: "Synthetic USD grant" }) })).status(), 201);
});

test("fee and payroll postings land once, in the campus currency, with their source", async () => {
  const ctx = await context("bursar");
  assert.equal((await ctx.request.post(`${base}/api/fees/collect`, { data: { studentId: childId, invoiceId, amount: 60000, paymentMethod: "CASH", paymentDate: "2026-10-02", idempotencyKey: randomUUID() } })).status(), 201);
  const paid = await Promise.all([1, 2].map(() => ctx.request.patch(`${base}/api/payroll/lines`, { data: { id: payrollLineId, status: "PAID" } })));
  assert.deepEqual(paid.map(r => r.status()), [200, 200]);
  const payroll = await db.ledgerEntry.findMany({ where: { payrollLineId } });
  assert.equal(payroll.length, 1, "payroll posts once");
  assert.equal(payroll[0].currency, "PKR");
  const sources = (await (await ctx.request.get(`${ledger}?campusId=${campusId}&currency=PKR&pageSize=200`)).json()).data.map((row: { source: string }) => row.source).sort();
  assert.deepEqual(sources, ["FEE", "MANUAL", "MANUAL", "PAYROLL"]);
});

test("a reconciled period cannot be posted into or deleted from; a correction keeps the original", async () => {
  const ctx = await context("bursar");
  const late = await ctx.request.post(ledger, { data: entry({ kind: "EXPENSE", accountId: expenseAccount, bankAccountId: bankId, date: "2026-09-20" }) });
  assert.equal(late.status(), 409);
  assert.match((await late.json()).error, /reconciled/);
  const removal = await ctx.request.delete(`${ledger}?id=${reconciledEntry}`);
  assert.equal(removal.status(), 409);
  assert.match((await removal.json()).error, /Post a correction instead/);
  assert.equal((await ctx.request.patch(ledger, { data: { id: reconciledEntry, action: "reverse", reason: "no" } })).status(), 400, "a reason is required");
  const reversals = await Promise.all([1, 2].map(() => ctx.request.patch(ledger, { data: { id: reconciledEntry, action: "reverse", reason: "Synthetic: fuel was billed to the transport contractor" } })));
  assert.deepEqual(reversals.map(r => r.status()), [200, 200]);
  const original = await db.ledgerEntry.findUniqueOrThrow({ where: { id: reconciledEntry }, include: { reversedBy: true } });
  assert.deepEqual([original.amount, original.date.toISOString().slice(0, 10), original.reversedBy?.amount], [40000, "2026-09-15", -40000], "original kept, one opposite entry");
  assert.ok(original.reversedBy!.date > new Date("2026-09-30Z"), "the correction is dated in an open period");
  assert.ok(await db.auditLog.findFirst({ where: { recordId: reconciledEntry, tableName: "ledger_entries" } }), "correction audited");
  assert.equal((await ctx.request.delete(`${ledger}?id=${original.reversedBy!.id}`)).status(), 409, "a correction cannot be deleted");
  const fee = await db.ledgerEntry.findFirstOrThrow({ where: { campusId, paymentId: { not: null } } });
  const feeReverse = await ctx.request.patch(ledger, { data: { id: fee.id, action: "reverse", reason: "Synthetic attempt on fee row" } });
  assert.equal(feeReverse.status(), 409);
  assert.match((await feeReverse.json()).error, /Correct the payment from Fees/);
});

test("list totals, profit report and export reconcile to the same rows and never mix currencies", async () => {
  const ctx = await context("bursar");
  const list = await (await ctx.request.get(`${ledger}?campusId=${campusId}&currency=PKR&pageSize=1`)).json();
  assert.deepEqual([list.totals.income, list.totals.expense, list.totals.net, list.totals.count], [85000, 300000, -215000, 5], "fee 600 + donation 250; payroll 3000 + fuel 400 − correction 400");
  assert.equal(list.data.length, 1, "totals cover every filtered row, not the page");
  const report = (await (await ctx.request.get(`${base}/api/accounts/profit?campusId=${campusId}&currency=PKR&from=2000-01-01&to=2099-12-31`)).json()).data;
  assert.deepEqual([report.income, report.expense, report.net, report.count], [85000, 300000, -215000, 5]);
  assert.deepEqual(report.otherCurrencies, [{ currency: "USD", entries: 1 }]);
  assert.deepEqual(report.bySource.CORRECTION, { income: 0, expense: -40000, count: 1 });
  const csv = await (await ctx.request.get(`${ledger}?campusId=${campusId}&currency=PKR&format=csv`)).text();
  const lines = csv.replace(/^﻿/, "").trim().split(/\r\n/);
  const rows = lines.slice(1, lines.indexOf(""));
  assert.equal(rows.length, 5);
  assert.match(lines.find(line => line.startsWith("Total income"))!, /,PKR,850\.00$/);
  assert.match(lines.find(line => line.startsWith("Net"))!, /,PKR,-2150\.00$/);
  assert.doesNotMatch(csv, /USD/, "the PKR export carries no USD rows");
  const manual = await (await ctx.request.get(`${ledger}?campusId=${campusId}&currency=PKR&source=MANUAL&kind=INCOME`)).json();
  assert.deepEqual([manual.totals.income, manual.totals.count], [25000, 1]);
  const corrected = await (await ctx.request.get(`${ledger}?campusId=${campusId}&currency=PKR&status=reversed`)).json();
  assert.deepEqual([corrected.totals.expense, corrected.totals.count], [0, 2], "a corrected pair nets to zero");
  const september = await (await ctx.request.get(`${ledger}?campusId=${campusId}&currency=PKR&from=2026-09-01&to=2026-09-30`)).json();
  assert.deepEqual([september.totals.expense, september.totals.count], [40000, 1], "the original stays in its own period");
});

test("used accounts keep their type and are deactivated, not deleted; other campuses see nothing", async () => {
  const ctx = await context("bursar"), chart = `${base}/api/accounts/chart`;
  const retype = await ctx.request.patch(chart, { data: { id: expenseAccount, type: "INCOME" } });
  assert.equal(retype.status(), 409);
  assert.equal((await ctx.request.delete(`${chart}?id=${expenseAccount}`)).status(), 409);
  const salaries = await db.chartOfAccount.findFirstOrThrow({ where: { campusId, name: "Salaries Expense" } });
  assert.equal((await ctx.request.patch(chart, { data: { id: salaries.id, isActive: false } })).status(), 409, "system account stays active");
  assert.equal((await ctx.request.patch(chart, { data: { id: incomeAccount, isActive: false } })).status(), 200);
  const blocked = await ctx.request.post(ledger, { data: entry({}) });
  assert.equal(blocked.status(), 409);
  assert.match((await blocked.json()).error, /inactive/);
  const report = (await (await ctx.request.get(`${base}/api/accounts/profit?campusId=${campusId}&currency=PKR&from=2000-01-01&to=2099-12-31`)).json()).data;
  assert.equal(report.income, 85000, "history of an inactive account stays in the report");
  assert.equal(report.breakdown.find((row: { accountId: string }) => row.accountId === incomeAccount).accountActive, false);
  assert.equal((await ctx.request.patch(chart, { data: { id: incomeAccount, isActive: true } })).status(), 200);
  const other = await context("other");
  assert.equal((await other.request.patch(chart, { data: { id: incomeAccount, name: "Hijacked" } })).status(), 404);
  assert.equal((await other.request.get(`${ledger}?campusId=${campusId}&currency=PKR`)).status(), 403);
  assert.equal((await other.request.patch(ledger, { data: { id: reconciledEntry, action: "reverse", reason: "Synthetic cross-campus attempt" } })).status(), 404);
  const own = await (await other.request.get(`${ledger}?currency=PKR`)).json();
  assert.equal(own.totals.count, 0);
});

test("the accountant filters the ledger, corrects an entry from the dialog and reads the report", async () => {
  const ctx = await context("accountant");
  const created = await (await ctx.request.post(ledger, { data: entry({ kind: "EXPENSE", accountId: expenseAccount, sourceName: "Synthetic printer toner", amount: 12000, date: "2026-10-08" }) })).json();
  const page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/accountant?view=accounts`);
  await page.getByRole("button", { name: "Expense", exact: true }).click({ timeout: 30_000 });
  const panel = page.locator('[data-ledger-panel="EXPENSE"]');
  const row = panel.locator(`[data-ledger-row="${created.data.id}"]`);
  await row.waitFor({ timeout: 30_000 });
  assert.match(await panel.locator("[data-ledger-scope]").innerText(), /PKR only/);
  await row.getByRole("button", { name: /Correct entry/ }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("button", { name: "Post correction" }).click();
  await dialog.getByRole("alert").waitFor();
  await dialog.getByLabel("Reason for the correction").fill("Synthetic: toner was returned to the supplier");
  await shot(page, "ledger-correction-dialog-en-1440");
  await dialog.getByRole("button", { name: "Post correction" }).click();
  await panel.locator(`[data-ledger-row="${created.data.id}"][data-ledger-reversed="true"]`).waitFor({ timeout: 15_000 });
  assert.equal(await panel.locator('[data-ledger-source="CORRECTION"]').count(), 2);
  await panel.getByLabel("Source").selectOption("PAYROLL");
  await page.waitForFunction(`document.querySelectorAll('[data-ledger-panel="EXPENSE"] [data-ledger-row]').length === 1 && document.querySelector('[data-ledger-panel="EXPENSE"] [data-ledger-source="PAYROLL"]') !== null`, undefined, { timeout: 15_000 });
  assert.equal(await panel.locator("[data-ledger-total]").getAttribute("data-ledger-total"), "300000");
  await shot(page, "ledger-expense-filtered-en-1440");
  await page.getByRole("button", { name: "Profit", exact: true }).click();
  const totals = page.locator("[data-profit-totals]");
  await totals.waitFor({ timeout: 15_000 });
  assert.deepEqual([await totals.getAttribute("data-income"), await totals.getAttribute("data-expense")], ["85000", "300000"]);
  assert.match(await page.locator("[data-profit-other-currencies]").innerText(), /USD \(1\)/);
  await shot(page, "ledger-profit-en-1440");
  assert.deepEqual(errors, []);
  await page.close();
});

test("Arabic accountant at phone width reads the report right-to-left without overflow", async () => {
  const ctx = await context("accountant-ar", { width: 390, height: 844 }), page = await ctx.newPage();
  await page.goto(`${base}/accountant?view=accounts`);
  await page.waitForLoadState("networkidle");
  if (!page.url().includes("view=accounts")) await page.goto(`${base}/accountant?view=accounts`);
  assert.equal(await page.evaluate("document.documentElement.dir"), "rtl");
  await page.getByRole("button", { name: "الأرباح", exact: true }).click({ timeout: 30_000 });
  await page.locator("[data-profit-basis]").waitFor({ timeout: 15_000 });
  assert.equal(await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true);
  await shot(page, "ledger-profit-ar-390");
  await page.close();
});
