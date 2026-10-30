import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";
import { prisma as appPrisma } from "../../src/lib/db/prisma";

// SKO-436 on the isolated app: the librarian scans a member card then a copy to issue it, scans the
// copy to return it and a repeated scan changes nothing; copy-level loans cannot be returned through
// the older title-level route; EN desktop and AR phone.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== (process.env.QA_DB_PORT || "55438") || url.pathname !== "/postgres") throw Error(`Only isolated local DB ${process.env.QA_DB_PORT || "55438"} is allowed`);
const base = process.env.LIBRARY_TEST_APP || "http://localhost:3108";
const evidence = process.env.LIBRARY_EVIDENCE_DIR || "/tmp/sko436-evidence";
const db = new PrismaClient(), password = "SyntheticLibrary436!";
const schoolId = `lb436-${randomUUID()}`, campusId = randomUUID();
const users = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
let browser: Browser;

async function user(key: string, role: string, language = "en") {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role: role as never, schoolId, campusId, isActive: true, onboardingComplete: true, welcomeCompletedAt: new Date(), tourProgress: { librarian: { v: 1, s: "done", at: new Date().toISOString() } }, preferredLanguage: language } });
  users.set(key, { id, email });
}
async function context(key: string, viewport = { width: 1440, height: 1000 }) {
  const saved = sessions.get(key);
  if (saved) return browser.newContext({ viewport, storageState: saved, reducedMotion: "reduce" });
  const c = await browser.newContext({ viewport, reducedMotion: "reduce" });
  assert.equal((await c.request.post(base + "/api/auth/login", { data: { email: users.get(key)!.email, password } })).status(), 200, `login ${key}`);
  const { secret } = await (await c.request.post(base + "/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
  if (secret) { await c.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(secret.replace(/\s+/g, "")) } }); await c.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } }); }
  sessions.set(key, await c.storageState());
  return c;
}

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Cedar Library School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Jeddah", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Cedar Main", regId: campusId, city: "Jeddah" } });
  await user("librarian", "LIBRARIAN"); await user("librarian-ar", "LIBRARIAN", "ar"); await user("reader", "STUDENT");
  await db.libraryMember.create({ data: { schoolId, campusId, userId: users.get("reader")!.id, memberNo: "ST-104" } });
  const book = await db.book.create({ data: { schoolId, campusId, title: "Synthetic Desert Atlas", isbn: "9780000000104", copiesTotal: 2, copiesAvailable: 2 } });
  await db.bookCopy.createMany({ data: [{ schoolId, campusId, bookId: book.id, barcode: "BK-104-A" }, { schoolId, campusId, bookId: book.id, barcode: "BK-104-B" }] });
  await db.libraryLoanPolicy.create({ data: { schoolId, campusId, version: 1, loanDays: 14, maxLoans: 4, maxRenewals: 1, graceDays: 0, finePerDay: 1, fineCap: 20, lostCharge: 60, holdDays: 3, currency: "SAR", closures: [], createdById: users.get("librarian")!.id } });
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser?.close();
  for (const m of [db.libraryCharge, db.bookReservation, db.bookCopy, db.libraryLoanPolicy]) await (m as unknown as { deleteMany: (a: object) => Promise<unknown> }).deleteMany({ where: { schoolId } });
  await db.school.delete({ where: { id: schoolId } }).catch(() => undefined);
  await db.$disconnect(); await appPrisma.$disconnect();
});

test("scan the member, scan the copy, return it twice — availability changes once (EN desktop)", async () => {
  const page = await (await context("librarian")).newPage();
  await page.goto(`${base}/librarian?view=library`);
  const desk = page.locator("section[data-lending-desk]");
  await desk.waitFor({ timeout: 60_000 });
  await page.locator('div.pointer-events-none.fixed.inset-0[aria-hidden="true"]').waitFor({ state: "hidden" });
  const scan = desk.getByLabel("Scan a member card or a copy");
  await scan.fill("ST-104"); await scan.press("Enter");
  await desk.getByText("Loans: 0 of 4 allowed").waitFor({ timeout: 30_000 });
  await scan.fill("BK-104-A"); await scan.press("Enter");
  await desk.getByText(/Copy BK-104-A issued\. Due/).waitFor({ timeout: 30_000 });
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("name") ?? document.activeElement?.id ?? ""), await scan.evaluate((el) => el.getAttribute("name") ?? el.id), "focus returns to the scan field");
  await desk.getByText("Loans: 1 of 4 allowed").waitFor();
  const issue = await db.bookIssue.findFirstOrThrow({ where: { returnedAt: null, book: { campusId } } });
  const legacy = await (await context("librarian")).request.patch(`${base}/api/library/issues`, { data: { id: issue.id } });
  assert.equal(legacy.status(), 409, "the older title-level route does not bypass the copy");
  await desk.getByLabel("Copy barcode").fill("BK-104-A");
  await desk.getByRole("button", { name: "Confirm return" }).click();
  await desk.getByText("Return recorded; availability updated.").waitFor({ timeout: 30_000 });
  await desk.getByLabel("Copy barcode").fill("BK-104-A");
  await desk.getByRole("button", { name: "Confirm return" }).click();
  await desk.getByText("Already returned · no duplicate change").waitFor({ timeout: 30_000 });
  assert.equal((await db.book.findFirstOrThrow({ where: { campusId } })).copiesAvailable, 2, "availability went up once");
  await desk.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${evidence}/lending-desk-en-1440.png` });
  await page.close();
});

test("the desk reads right to left on a phone (AR)", async () => {
  const page = await (await context("librarian-ar", { width: 390, height: 844 })).newPage();
  await page.goto(`${base}/librarian?view=library`);
  const desk = page.locator("section[data-lending-desk]");
  await desk.waitFor({ timeout: 60_000 });
  await page.locator('div.pointer-events-none.fixed.inset-0[aria-hidden="true"]').waitFor({ state: "hidden" });
  assert.equal(await page.evaluate("document.documentElement.dir"), "rtl");
  const scan = desk.getByLabel("امسح بطاقة عضو أو نسخة كتاب");
  await scan.fill("BK-104-B"); await scan.press("Enter");
  await desk.getByText("على الرف").first().waitFor({ timeout: 30_000 });
  await desk.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${evidence}/lending-desk-ar-390.png` });
  await page.close();
});


test("failed initial desk data retries without reload at 320px", async () => {
  const ctx = await context("librarian", { width: 320, height: 800 }); const page = await ctx.newPage(); let fail = true;
  await page.route("**/api/library/desk", route => fail ? route.fulfill({ status: 503, json: { success: false, error: "Library data unavailable" } }) : route.continue());
  await page.goto(`${base}/librarian?view=library`);
  const desk = page.locator("[data-lending-desk]"); const retry = desk.getByRole("button", { name: "Try again" });
  await retry.waitFor();
  await page.locator('div.pointer-events-none.fixed.inset-0[aria-hidden="true"]').waitFor({ state: "hidden" });
  await desk.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${evidence}/library-retry-320.png` });
  fail = false; await retry.click(); await retry.waitFor({ state: "hidden" });
  await desk.getByText(/Loans last 14 days/).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await ctx.close();
});

test("a saved issue followed by a failed refresh keeps the receipt and removes stale reader actions", async () => {
  const ctx = await context("librarian"); const page = await ctx.newPage(); const errors: string[] = []; let failRefresh = false;
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/library/desk?code=ST-104", route => failRefresh ? route.fulfill({ status: 503, json: { success: false } }) : route.continue());
  await page.goto(`${base}/librarian?view=library`);
  const desk = page.locator("[data-lending-desk]"); const scan = desk.getByLabel("Scan a member card or a copy");
  await scan.fill("ST-104"); await scan.press("Enter"); await desk.getByText("Loans: 0 of 4 allowed").waitFor();
  failRefresh = true;
  await scan.fill("BK-104-A"); await scan.press("Enter");
  await desk.getByText("The action was saved, but the reader's loans could not be refreshed. Scan the card again.").waitFor();
  assert.match(await desk.innerText(), /Copy BK-104-A issued/);
  assert.equal(await desk.locator("[data-lending-reader]").count(), 0);
  assert.equal(await db.bookIssue.count({ where: { returnedAt: null, book: { campusId } } }), 1);
  failRefresh = false;
  await scan.fill("ST-104"); await scan.press("Enter"); await desk.getByText("Loans: 1 of 4 allowed").waitFor();
  assert.deepEqual(errors, []);
  await ctx.close();
});
