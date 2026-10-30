import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-447 browser acceptance against the isolated School AI database and app.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== (process.env.QA_DB_PORT || "55438") || url.pathname !== "/postgres") throw Error(`Only isolated local DB ${process.env.QA_DB_PORT || "55438"} is allowed`);
const base = process.env.DATA_SETTINGS_TEST_APP || "http://localhost:3107";
const evidence = process.env.DATA_SETTINGS_EVIDENCE_DIR || "/tmp/sko447-evidence";
const raw = new PrismaClient(), password = "SyntheticLifecycle447!", DAY = 86_400_000;
const schoolId = `lifecycle447-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), childId = randomUUID();
const people = new Map<string, { id: string; email: string }>();
type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;
const sessions = new Map<string, StorageState>();
let browser: Browser;

async function person(key: string, role: string, language = "en", owner = false) {
  const id = randomUUID(), email = `${id}@example.invalid`;
  await raw.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role: role as never, schoolId, campusId: role === "SUPER_ADMIN" ? null : campusId, isActive: true, onboardingComplete: true, isInstitutionOwner: owner, preferredLanguage: language } });
  people.set(key, { id, email });
}
async function context(key: string, viewport = { width: 1440, height: 1000 }): Promise<BrowserContext> {
  const saved = sessions.get(key);
  if (saved) return browser.newContext({ viewport, storageState: saved });
  const ctx = await browser.newContext({ viewport }), account = people.get(key)!;
  assert.equal((await ctx.request.post(base + "/api/auth/login", { data: { email: account.email, password } })).status(), 200);
  const setup = await ctx.request.post(base + "/api/auth/mfa", { data: { action: "setup" } });
  const { secret } = await setup.json().catch(() => ({}));
  if (secret) {
    await ctx.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(secret) } });
    await ctx.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } });
  }
  sessions.set(key, await ctx.storageState());
  return ctx;
}
async function open(key: string, viewport?: { width: number; height: number }) {
  const ctx = await context(key, viewport), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(base + "/settings/data");
  return { ctx, page, errors };
}
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const requestCard = (page: Page, kind: string) => page.locator("li").filter({ hasText: kind }).first();

before(async () => {
  await raw.school.create({ data: { id: schoolId, name: "Synthetic lifecycle academy", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Synthetic", status: "ACTIVE", plan: "PRO" } });
  await raw.campus.create({ data: { id: campusId, schoolId, name: "Synthetic campus", regId: campusId, city: "Synthetic" } });
  await raw.class.create({ data: { id: classId, schoolId, campusId, name: "Synthetic class", academicYear: 2026 } });
  await person("owner", "SUPER_ADMIN", "en", true); await person("second", "SUPER_ADMIN"); await person("parent", "PARENT");
  await person("owner-ar", "SUPER_ADMIN", "ar", true); await person("parent-ur", "PARENT", "ur");
  await raw.student.create({ data: { id: childId, schoolId, campusId, classId, fullName: "Synthetic child", rollNo: "L447", gender: "FEMALE", enrollmentDate: new Date("2026-09-01Z") } });
  for (const key of ["parent", "parent-ur"]) {
    const relationship = await raw.guardianRelationship.create({ data: { schoolId, campusId, studentId: childId, guardianUserId: people.get(key)!.id, createdByUserId: people.get("owner")!.id, fullName: "Synthetic guardian", email: people.get(key)!.email, relationship: "Parent", status: "ACTIVE", verifiedAt: new Date(Date.now() - DAY) } });
    await raw.guardianAccessVersion.create({ data: { schoolId, relationshipId: relationship.id, createdByUserId: people.get("owner")!.id, reason: "Synthetic fixture", permissions: { learningRecords: true, attendance: true, finances: false, communication: true, pickup: false } } });
  }
  for (const days of [100, 80, 2]) await raw.notification.create({ data: { schoolId, userId: people.get("owner")!.id, title: "Synthetic", message: "Synthetic", type: "INFO", createdAt: new Date(Date.now() - days * DAY) } });
  await raw.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await raw.school.delete({ where: { id: schoolId } }).catch(() => undefined); await raw.$disconnect(); });

test("the owner sees configured, unsupported and local placements without a verified claim", async () => {
  const { ctx, page, errors } = await open("owner");
  await page.getByRole("heading", { name: "Where your data is processed" }).waitFor();
  const table = page.getByRole("table");
  assert.equal(await table.getByRole("row").count(), 9);
  assert.equal(await table.getByText("Verified", { exact: true }).count(), 0, "nothing is verified without recorded evidence");
  assert.ok(await table.getByText("Regional placement not supported").count() >= 4);
  assert.equal(await table.getByRole("row", { name: /^Database PostgreSQL/ }).getByText("This host").count(), 1, "the isolated database is reported as local");
  await page.screenshot({ path: `${evidence}/data-owner-en-1440.png`, fullPage: true });
  assert.deepEqual(errors, []); await ctx.close();
});

test("retention runs respect a record hold and need a second administrator", async () => {
  const { ctx, page } = await open("owner");
  const row = page.locator("li").filter({ hasText: "In-app notifications" }).first();
  await row.getByRole("spinbutton").fill("30");
  await row.getByRole("button", { name: "Save new version" }).click();
  await page.getByRole("status").filter({ hasText: "Saved." }).waitFor();
  await row.getByText("version 1", { exact: false }).waitFor();
  const held = await raw.notification.findFirstOrThrow({ where: { schoolId, createdAt: { lt: new Date(Date.now() - 90 * DAY) } } });
  const holdForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Place hold" }) });
  await holdForm.getByLabel("Record ID", { exact: false }).fill(held.id);
  await holdForm.getByLabel("Reason").fill("Synthetic complaint review");
  await holdForm.getByRole("button", { name: "Place hold" }).click();
  await page.getByText("Synthetic complaint review").waitFor();
  await row.getByRole("button", { name: "Preview" }).click();
  await row.getByText("1 eligible for deletion · 1 preserved by a hold", { exact: false }).waitFor();
  await row.getByRole("button", { name: "Request deletion run" }).click();
  await requestCard(page, "Retention deletion").getByText("Another administrator must review your request.").waitFor();
  await ctx.close();

  const second = await open("second");
  const card = requestCard(second.page, "Retention deletion");
  await card.getByLabel("Review note").fill("Checked eligible list");
  await card.getByRole("button", { name: "Approve" }).click();
  await card.getByText("Completed").waitFor();
  await card.getByText("1 deleted · 1 preserved by a hold", { exact: false }).waitFor();
  assert.equal(await raw.notification.count({ where: { schoolId } }), 2, "the held and recent notifications remain");
  assert.equal(await raw.notification.count({ where: { id: held.id } }), 1);
  await second.page.screenshot({ path: `${evidence}/data-retention-approved-en-1440.png`, fullPage: true });
  await second.ctx.close();
});

test("a guardian requests an export, an administrator approves it, and only the guardian downloads it", async () => {
  const guardian = await open("parent", { width: 390, height: 900 });
  await guardian.page.getByLabel("Learner").selectOption(childId);
  await guardian.page.getByLabel("Reason").fill("Family records request");
  await guardian.page.getByRole("button", { name: "Request export" }).click();
  await requestCard(guardian.page, "Export").getByText("Awaiting review").waitFor();
  assert.equal(await guardian.page.getByRole("heading", { name: "Where your data is processed" }).count(), 0);
  assert.equal(await noOverflow(guardian.page), true);
  await guardian.page.screenshot({ path: `${evidence}/data-guardian-en-390.png`, fullPage: true });

  const owner = await open("owner");
  const card = requestCard(owner.page, "Family records request");
  await card.getByLabel("Review note").fill("Identity confirmed at front desk");
  await card.getByRole("button", { name: "Approve" }).click();
  await card.getByText("Completed").waitFor();
  assert.equal(await card.getByRole("button", { name: "Download export" }).count(), 0, "the reviewer never gets the download link");
  await owner.ctx.close();

  await guardian.page.reload();
  const download = guardian.page.waitForEvent("download");
  await requestCard(guardian.page, "Export").getByRole("button", { name: "Download export" }).click();
  const file = await download;
  const content = JSON.parse(await (await import("node:fs/promises")).readFile((await file.path())!, "utf8"));
  assert.equal(content.learner.id, childId);
  assert.deepEqual(content.invoices, [], "finances are excluded for this guardian");
  await guardian.ctx.close();
});

test("a region change to the UAE is blocked and lists every affected service", async () => {
  const { ctx, page } = await open("owner");
  await page.getByLabel("Target region").selectOption("me-central-1");
  await page.locator("form").filter({ hasText: "Plan a region change" }).getByLabel("Reason").fill("Evaluate in-country hosting");
  await page.getByRole("button", { name: "Review placement plan" }).click();
  const card = requestCard(page, "Region change");
  await card.getByText("Blocked").waitFor();
  await card.getByText("database cannot be placed in Middle East (UAE).").waitFor();
  assert.equal(await card.getByRole("listitem").filter({ hasText: /: / }).count() >= 8, true);
  await ctx.close();
});

test("Arabic and Urdu layouts are right-to-left without horizontal overflow at 390px", async () => {
  for (const [key, heading] of [["owner-ar", "أين تُعالَج بياناتك"], ["parent-ur", "ڈیٹا ایکسپورٹ کی درخواست"]] as const) {
    const { ctx, page, errors } = await open(key, { width: 390, height: 900 });
    await page.getByText(heading).first().waitFor();
    assert.equal(await page.locator("section[aria-labelledby='data-lifecycle-heading']").getAttribute("dir"), "rtl");
    assert.equal(await noOverflow(page), true, key);
    await page.screenshot({ path: `${evidence}/data-${key}-390.png`, fullPage: true });
    assert.deepEqual(errors, []); await ctx.close();
  }
});
