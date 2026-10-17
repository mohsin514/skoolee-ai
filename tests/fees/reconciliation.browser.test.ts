import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-432 on the isolated app: two same-name pupils and a partial transfer need a human match with a
// reason; the statement balances (received = allocated + credit + unallocated); posting creates one
// payment per matched transaction even when replayed; the same data re-imported under another name
// and column order is recognized and nothing is imported twice.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.FEES_TEST_APP || "http://localhost:3107";
const evidence = process.env.FEES_EVIDENCE_DIR || "/tmp/sko432-evidence";
const db = new PrismaClient(), password = "SyntheticRecon432!";
const schoolId = `rec432-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), pupilA = randomUUID(), pupilB = randomUUID(), invA = randomUUID(), invB = randomUUID();
const email = `${randomUUID()}@example.invalid`;
let browser: Browser, ctx: BrowserContext, reconciliationId = "";
const csv = "date,amount,description\n2026-10-05,750.00,Fee INV-REC-A1 Ayaan Khan\n2026-10-06,250.00,Fee Ayaan Khan\n2026-10-07,80.00,Unknown transfer\n";
const reordered = "Description,Value,Transaction Date\nfee   inv-rec-a1 ayaan khan,750.00,2026-10-05\nFEE AYAAN KHAN,250.00,2026-10-06\nunknown transfer,80.00,2026-10-07\n";
const stage = async (text: string, name: string) => (await (await ctx.request.post(`${base}/api/import-batches`, { data: { kind: "BANK_STATEMENT", sourceName: name, csvText: text, accountName: "Synthetic Main Account", currency: "PKR", statementFrom: "2026-10-01", statementTo: "2026-10-31", campusId } })).json()).data;
const shot = async (page: Page, name: string) => { await page.evaluate("Promise.all(document.getAnimations().map(a => a.finished.catch(() => undefined)))"); await page.screenshot({ path: `${evidence}/${name}.png` }); };

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Banyan Ledger School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Ledger Main", regId: campusId, city: "Lahore" } });
  await db.user.create({ data: { email, password: await bcrypt.hash(password, 12), fullName: "Synthetic bursar", role: "CAMPUS_ADMIN", schoolId, campusId, isActive: true, onboardingComplete: true } });
  await db.academicCycle.create({ data: { schoolId, campusId, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Six", academicYear: 2026 } });
  for (const [id, roll] of [[pupilA, "K-1"], [pupilB, "K-2"]]) await db.student.create({ data: { id, schoolId, campusId, classId, fullName: "Synthetic Ayaan Khan", rollNo: roll, gender: "MALE", enrollmentDate: new Date("2026-04-01Z") } });
  for (const [id, student, number, amount] of [[invA, pupilA, "INV-REC-A1", 75000], [invB, pupilB, "INV-REC-B1", 50000]] as const) await db.invoice.create({ data: { id, schoolId, campusId, studentId: student, invoiceDate: new Date("2026-09-01Z"), dueDate: new Date("2026-10-30Z"), currency: "PKR", invoiceNumber: number, monthlyFee: amount, subtotal: amount, totalAmount: amount, balanceDue: amount } });
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
  ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  assert.equal((await ctx.request.post(base + "/api/auth/login", { data: { email, password } })).status(), 200);
  const { secret } = await (await ctx.request.post(base + "/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
  if (secret) { await ctx.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(secret.replace(/\s+/g, "")) } }); await ctx.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } }); }
});
after(async () => { await browser?.close(); await db.school.delete({ where: { id: schoolId } }).catch(() => undefined); await db.$disconnect(); });

test("a reference match is automatic; a hand match needs a reason; the statement balances before posting", async () => {
  const batch = await stage(csv, "october.csv");
  const rows = Object.fromEntries(batch.rows.map((row: { rowNumber: number }) => [row.rowNumber, row]));
  assert.equal(rows[2].proposal.matchedInvoiceId, invA, "exact invoice reference matched");
  assert.equal(rows[3].proposal.matchedInvoiceId, null, "a name alone never matches");
  const batchUrl = `${base}/api/import-batches/${batch.id}?campusId=${campusId}`;
  const noReason = await ctx.request.patch(batchUrl, { data: { rows: [{ rowNumber: 3, matchedInvoiceId: invB }] } });
  assert.equal(noReason.status(), 422);
  assert.equal((await ctx.request.patch(batchUrl, { data: { rows: [{ rowNumber: 3, matchedInvoiceId: invB, reason: "Payer note names K-2; confirmed by phone" }] } })).status(), 200);
  assert.equal((await ctx.request.post(batchUrl, { data: { action: "commit" } })).status(), 200);
  const list = (await (await ctx.request.get(`${base}/api/fees/reconciliations?campusId=${campusId}`)).json()).data;
  reconciliationId = list[0].id;
  assert.deepEqual([list[0].status, list[0].report.received, list[0].report.allocated, list[0].report.unallocated, list[0].report.balanced], ["pending", 108000, 100000, 8000, true]);
  assert.equal(list[0].matched.find((row: { rowNumber: number }) => row.rowNumber === 3).manualMatch.reason, "Payer note names K-2; confirmed by phone");
  assert.equal(await db.payment.count({ where: { campusId } }), 0, "nothing is posted at commit");
});

test("the same data under another name and column order is recognized as already imported", async () => {
  const again = await stage(reordered, "renamed-statement.csv");
  assert.deepEqual(again.rows.map((row: { state: string }) => row.state), ["SKIPPED", "SKIPPED", "SKIPPED"]);
  assert.match(again.rows[0].matchLabel, /already imported/);
});

test("the bursar posts from the workbench; replays post nothing twice and money stays conserved", async () => {
  const page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/admin?view=fees`);
  await page.getByRole("button", { name: "Payments", exact: true }).first().click({ timeout: 30_000 });
  const card = page.locator(`[data-reconciliation="${reconciliationId}"]`);
  await card.waitFor({ timeout: 30_000 });
  assert.equal(await card.locator('[data-conservation="balanced"]').count(), 1);
  await card.scrollIntoViewIfNeeded();
  await shot(page, "reconciliation-review-en-1440");
  await card.getByRole("button", { name: "Post 2 matched payment(s)" }).click();
  await page.getByRole("alertdialog").or(page.getByRole("dialog")).last().getByRole("button", { name: "Post payments" }).click();
  await page.locator(`[data-reconciliation="${reconciliationId}"][data-reconciliation-status="posted"]`).waitFor({ timeout: 20_000 });
  await page.getByText(/BANK-/).first().waitFor({ timeout: 15_000 }).catch(() => undefined);
  assert.doesNotMatch(await page.locator("body").innerText(), /Payments: 0/, "the payments list refreshed after posting");
  await shot(page, "reconciliation-posted-en-1440");
  const replays = await Promise.all(Array.from({ length: 5 }, () => ctx.request.post(`${base}/api/fees/reconciliations`, { data: { id: reconciliationId, action: "post" } })));
  assert.deepEqual(replays.map(r => r.status()), [200, 200, 200, 200, 200]);
  assert.equal(await db.payment.count({ where: { campusId } }), 2, "one payment per matched transaction");
  assert.deepEqual([(await db.invoice.findUniqueOrThrow({ where: { id: invA } })).balanceDue, (await db.invoice.findUniqueOrThrow({ where: { id: invB } })).balanceDue], [0, 25000]);
  const report = (await (await ctx.request.get(`${base}/api/fees/reconciliations?campusId=${campusId}`)).json()).data[0].report;
  assert.deepEqual([report.received, report.allocated, report.credited, report.unallocated, report.balanced], [108000, 100000, 0, 8000, true]);
  assert.deepEqual(errors, []); await page.close();
});
