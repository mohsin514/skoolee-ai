import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, webkit, type Browser, type BrowserContext, type Page } from "playwright";
import { expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// Synthetic local acceptance for SCRUM-309. Never run against a shared/production database.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.DELETE_TEST_APP || "http://localhost:3110";
const evidence = process.env.DELETE_EVIDENCE_DIR || "/tmp/scrum309/evidence";
const db = new PrismaClient(), password = "SyntheticDelete309!";
const schoolId = `delete309-${randomUUID()}`, campusA = randomUUID(), campusB = randomUUID();
const users = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
let browser: Browser;

async function user(key: string, role: string, campus: string | null = campusA, language = "en") {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role: role as never, schoolId, campusId: campus, isActive: true, onboardingComplete: true, welcomeCompletedAt: new Date(), tourProgress: { accountant: { v: 1, s: "done", at: new Date().toISOString() }, librarian: { v: 1, s: "done", at: new Date().toISOString() } }, joiningDate: new Date("2026-01-01T00:00:00Z"), preferredLanguage: language } });
  users.set(key, { id, email }); return id;
}
async function context(key: string, viewport = { width: 1440, height: 1000 }) {
  const saved = sessions.get(key);
  if (saved) { const ctx = await browser.newContext({ viewport, storageState: saved, reducedMotion: "reduce" }); ctx.setDefaultTimeout(30000); ctx.setDefaultNavigationTimeout(120000); return ctx; }
  const ctx = await browser.newContext({ viewport, reducedMotion: "reduce" });
  const login = await ctx.request.post(base + "/api/auth/login", { data: { email: users.get(key)!.email, password, schoolId } });
  assert.equal(login.status(), 200, key + " login");
  const loginBody = await login.json();
  assert.ok(loginBody.success || loginBody.mfaRequired, key + " login outcome");
  const { secret } = await (await ctx.request.post(base + "/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
  if (secret) { await ctx.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(secret.replace(/\s+/g, "")) } }); await ctx.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } }); }
  const signedIn = await ctx.request.get(base + "/api/auth/session");
  assert.equal(signedIn.status(), 200, key + " authenticated session");
  sessions.set(key, await ctx.storageState());
  ctx.setDefaultTimeout(30000); ctx.setDefaultNavigationTimeout(120000); return ctx;
}

before(async () => {
  await mkdir(evidence, { recursive: true });
  await db.school.create({ data: { id: schoolId, name: "Synthetic Confirmation School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  for (const id of [campusA, campusB]) await db.campus.create({ data: { id, schoolId, name: id === campusA ? "North" : "South", regId: id, city: "Lahore" } });
  await user("librarian", "LIBRARIAN"); await user("librarian-ur", "LIBRARIAN", campusA, "ur"); await user("teacher", "TEACHER");
  await user("accountant", "ACCOUNTANT");
  await db.rolePermission.create({ data: { schoolId, role: "ACCOUNTANT", module: "fees", canView: true, canAdd: true, canEdit: true, canDelete: true } });
  browser = await (process.env.DELETE_BROWSER === "webkit" ? webkit : chromium).launch({ headless: true });
});
after(async () => { await browser?.close(); await db.$disconnect(); });
const shot = async (page: Page, name: string) => { await page.locator("[data-boot-splash]").waitFor({ state: "hidden" }); await page.screenshot({ path: `${evidence}/${name}.png`, fullPage: true }); };
async function book(title: string) { return db.book.create({ data: { schoolId, campusId: campusA, title, copiesTotal: 0, copiesAvailable: 0 } }); }
async function ask(page: Page, title: string, ur = false) {
  await page.getByRole("row").filter({ hasText: title }).getByRole("button").last().click();
  await page.getByRole("menuitem", { name: ur ? "حذف کریں" : "Delete", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog.waitFor(); return dialog;
}

test("cancel preserves URL, search and unsaved book draft; stale confirmation requires another review", async () => {
  const row = await book("Synthetic Review Atlas"), ctx = await context("librarian"), page = await ctx.newPage();
  await page.goto(`${base}/librarian?view=catalogue&section=books&tab=books`);
  await page.getByRole("button", { name: "Add book", exact: true }).click();
  await page.getByRole("textbox", { name: "Title", exact: true }).fill("Unsaved title");
  const before = page.url();
  let dialog = await ask(page, row.title);
  await dialog.getByRole("button", { name: "Delete", exact: true }).waitFor();
  assert.equal(await dialog.getByRole("button", { name: "Keep editing", exact: true }).evaluate(el => el === document.activeElement), true);
  await page.keyboard.press("Escape"); await dialog.waitFor({ state: "hidden" });
  assert.equal(page.url(), before); assert.equal(await page.getByRole("textbox", { name: "Title", exact: true }).inputValue(), "Unsaved title");
  assert.ok(await db.book.findUnique({ where: { id: row.id } }));
  dialog = await ask(page, row.title);
  await dialog.getByRole("button", { name: "Delete", exact: true }).waitFor({ state: "visible" });
  await expect(dialog.getByRole("button", { name: "Delete", exact: true })).toBeEnabled();
  await db.book.update({ where: { id: row.id }, data: { title: "Synthetic Review Atlas changed" } });
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await dialog.getByText("This record or its dependencies changed. Review it again before deleting.").waitFor();
  assert.equal(await dialog.getByRole("button", { name: "Delete", exact: true }).isDisabled(), true);
  await shot(page, "library-stale-keeps-draft-en");
  await dialog.getByRole("button", { name: "Review again", exact: true }).click();
  await dialog.getByRole("heading", { name: "Delete Synthetic Review Atlas changed?", exact: true }).waitFor();
  await dialog.getByRole("button", { name: "Keep editing", exact: true }).click();
  assert.equal(await page.getByRole("textbox", { name: "Title", exact: true }).inputValue(), "Unsaved title");
  await ctx.close();
});

test("offline retry retains review and successful deletion persists after reload without duplicate effects", async () => {
  const row = await book("Synthetic Retry Atlas"), ctx = await context("librarian"), page = await ctx.newPage();
  await page.goto(`${base}/librarian?view=catalogue&section=books&tab=books`);
  const dialog = await ask(page, row.title), confirm = dialog.getByRole("button", { name: "Delete", exact: true });
  await expect(confirm).toBeEnabled();
  await ctx.setOffline(true); await confirm.click();
  await dialog.getByText("Deletion could not be confirmed. Your work is kept. Retry safely or cancel.").waitFor();
  await shot(page, "library-offline-retry-en");
  assert.ok(await db.book.findUnique({ where: { id: row.id } }));
  await ctx.setOffline(false); await page.getByText("No internet connection", { exact: true }).waitFor({ state: "hidden" }); await confirm.click(); await dialog.waitFor({ state: "hidden" });
  assert.equal(await db.book.findUnique({ where: { id: row.id } }), null);
  await page.reload(); await page.getByRole("button", { name: "Add book", exact: true }).waitFor();
  assert.equal(await page.getByRole("row").filter({ hasText: row.title }).count(), 0);
  assert.equal(await db.auditLog.count({ where: { schoolId, recordId: row.id, tableName: "library/books" } }), 1);
  await ctx.close();
});

test("permission revoked after review denies direct API confirmation and preserves the record", async () => {
  const row = await book("Synthetic Revoked Atlas"), ctx = await context("librarian");
  const endpoint = `${base}/api/library/books?id=${row.id}&campusId=${campusA}`;
  assert.equal((await ctx.request.delete(endpoint)).status(), 428);
  const preview = await (await ctx.request.delete(endpoint + "&preview=true")).json();
  await db.rolePermission.create({ data: { schoolId, role: "LIBRARIAN", module: "library", canView: true, canAdd: true, canEdit: true, canDelete: false } });
  assert.equal((await ctx.request.delete(endpoint, { headers: { "If-Match": preview.preview.version } })).status(), 403);
  await db.rolePermission.deleteMany({ where: { schoolId, role: "LIBRARIAN" } });
  const denied = await context("teacher");
  assert.equal((await denied.request.delete(endpoint + "&preview=true")).status(), 403);
  const hidden = await db.book.create({ data: { schoolId, campusId: campusB, title: "Private other campus" } });
  assert.equal((await ctx.request.delete(`${base}/api/library/books?id=${hidden.id}&preview=true`)).status(), 404);
  await denied.close(); await ctx.close();
});

test("Urdu mobile confirmation has localized consequences, safe focus and keyboard cancellation", async () => {
  const row = await book("Synthetic Urdu Atlas"), ctx = await context("librarian-ur", { width: 390, height: 844 }), page = await ctx.newPage();
  await page.goto(`${base}/librarian?view=catalogue&section=books&tab=books`);
  const dialog = await ask(page, row.title, true);
  assert.equal(await page.locator("html").getAttribute("dir"), "rtl");
  assert.equal(await dialog.getByRole("button", { name: "ترمیم جاری رکھیں", exact: true }).evaluate(el => el === document.activeElement), true);
  await expect(dialog.getByRole("button", { name: "حذف کریں", exact: true })).toBeEnabled();
  await shot(page, "library-confirmation-ur-mobile");
  await page.keyboard.press("Escape"); await dialog.waitFor({ state: "hidden" });
  assert.ok(await db.book.findUnique({ where: { id: row.id } }));
  await ctx.close();
});


test("finance deletion preserves the section on cancel, rejects stale review, and persists one canonical audit event", async () => {
  const row = await db.feeType.create({ data: { schoolId, campusId: campusA, name: "Synthetic Tuition Head", code: randomUUID() } });
  const ctx = await context("accountant"), page = await ctx.newPage();
  await page.goto(`${base}/accountant?view=fee-structures&tab=types`);
  const open = async () => {
    await page.locator(".sk-panel").filter({ has: page.getByText(row.name, { exact: true }) }).getByRole("button", { name: "More actions", exact: true }).click();
    await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog.getByRole("button", { name: "Delete", exact: true })).toBeEnabled();
    return dialog;
  };
  let dialog = await open();
  const before = page.url();
  await expect(dialog.getByRole("button", { name: "Keep editing", exact: true })).toBeFocused();
  await page.keyboard.press("Escape"); await dialog.waitFor({ state: "hidden" });
  assert.equal(page.url(), before);
  assert.ok(await db.feeType.findUnique({ where: { id: row.id } }));
  dialog = await open();
  await db.feeType.update({ where: { id: row.id }, data: { description: "Changed after preparation" } });
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await dialog.getByText("This record or its dependencies changed. Review it again before deleting.").waitFor();
  await shot(page, "finance-stale-review-en");
  await dialog.getByRole("button", { name: "Review again", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Delete", exact: true })).toBeEnabled();
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  await page.reload();
  await page.getByRole("button", { name: "New fee type", exact: true }).first().waitFor();
  assert.equal(page.url(), before);
  assert.equal(await db.feeType.findUnique({ where: { id: row.id } }), null);
  const receipts = await db.auditLog.findMany({ where: { schoolId, recordId: row.id, tableName: "fee_types" } });
  assert.equal(receipts.length, 1); assert.ok(receipts[0].oldValue); assert.equal(receipts[0].newValue, null);
  await ctx.close();
});
