import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-476 browser acceptance against the isolated database and app.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.AUDIT_TEST_APP || "http://localhost:3107";
const evidence = process.env.AUDIT_EVIDENCE_DIR || "/tmp/sko476-evidence";
const raw = new PrismaClient(), password = "SyntheticAudit476!";
const schoolId = `audit476b-${randomUUID()}`, campusA = randomUUID(), campusB = randomUUID();
const people = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
let browser: Browser;

async function person(key: string, role: string, campusId: string | null, language = "en") {
  const id = randomUUID(), email = `${id}@example.invalid`;
  await raw.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role: role as never, schoolId, campusId, isActive: true, onboardingComplete: true, preferredLanguage: language } });
  people.set(key, { id, email });
}
async function context(key: string, viewport = { width: 1440, height: 1000 }) {
  const saved = sessions.get(key);
  if (saved) return browser.newContext({ viewport, storageState: saved, acceptDownloads: true });
  const ctx = await browser.newContext({ viewport, acceptDownloads: true });
  assert.equal((await ctx.request.post(base + "/api/auth/login", { data: { email: people.get(key)!.email, password } })).status(), 200);
  const { secret } = await (await ctx.request.post(base + "/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
  if (secret) {
    await ctx.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(secret.replace(/\s+/g, "")) } });
    await ctx.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } });
  }
  sessions.set(key, await ctx.storageState());
  return ctx;
}
async function openHistory(key: string, path: string, viewport?: { width: number; height: number }, prepare?: (page: Page) => Promise<void>) {
  const ctx = await context(key, viewport), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(base + path);
  // A first visit in a non-English language reloads once to set the language cookie, dropping ?view=.
  const query = path.split("?")[1];
  if (query) { await page.waitForLoadState("networkidle"); if (!page.url().includes(query)) await page.goto(base + path); }
  if (prepare) await prepare(page);
  await page.getByRole("button", { name: "Activity Log" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  return { ctx, page, dialog, errors };
}
// Wait for finite (enter) animations only; spinners and ambient effects run forever.
const settled = (page: Page) => page.evaluate(() => Promise.all(document.getAnimations().filter(animation => Number.isFinite(Number(animation.effect?.getComputedTiming().endTime))).map(animation => animation.finished.catch(() => undefined))));
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

before(async () => {
  await raw.school.create({ data: { id: schoolId, name: "Synthetic history academy", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Synthetic", status: "ACTIVE", plan: "PRO" } });
  for (const id of [campusA, campusB]) await raw.campus.create({ data: { id, schoolId, name: `Campus ${id.slice(0, 4)}`, regId: id, city: "Synthetic" } });
  await person("owner", "SUPER_ADMIN", null); await person("campusAdmin", "CAMPUS_ADMIN", campusA);
  await person("campusAdmin-ar", "CAMPUS_ADMIN", campusB, "ar"); await person("campusAdmin-ur", "CAMPUS_ADMIN", campusA, "ur");
  const actor = people.get("owner")!.id;
  for (const [campusId, tableName] of [[campusA, "students"], [campusA, "marks"], [campusB, "classes"]] as const) {
    await raw.auditLog.create({ data: { schoolId, campusId, userId: actor, tableName, recordId: randomUUID(), oldValue: { status: "ACTIVE" }, newValue: { status: "ARCHIVED" } } });
  }
  await raw.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await raw.school.delete({ where: { id: schoolId } }).catch(() => undefined); await raw.$disconnect(); });

test("a campus administrator sees only their campus history and exports it once", async () => {
  const { ctx, page, dialog, errors } = await openHistory("campusAdmin", "/admin?view=leadership");
  await dialog.getByRole("listitem").first().waitFor();
  assert.equal(await dialog.getByRole("listitem").count(), 2, "campus B's change is not shown");
  assert.equal(await dialog.getByRole("listitem").filter({ hasText: "Students" }).count(), 1, "table-style names are labelled by record type");
  assert.equal(await dialog.getByLabel("Campus").count(), 0, "campus-limited roles cannot switch campus");
  await settled(page); await page.screenshot({ path: `${evidence}/history-campus-admin-en-1440.png`, fullPage: true });
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export CSV" }).click();
  const file = await download;
  assert.match(file.suggestedFilename(), /^activity-history-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = await readFile((await file.path())!, "utf8");
  assert.equal(csv.trim().split(/\r?\n/).length, 3, "header plus two scoped rows");
  await dialog.getByText("Export downloaded", { exact: false }).waitFor();
  assert.equal(await raw.auditLog.count({ where: { schoolId, tableName: "audit_log_exports" } }), 1);
  assert.deepEqual(errors, []); await ctx.close();
});

test("the school owner can switch campus and revoking export permission shows a denial", async () => {
  const owner = await openHistory("owner", "/super", undefined, async page => {
    await page.locator("div").filter({ hasText: `Campus ${campusB.slice(0, 4)}` }).getByRole("button", { name: "Manage" }).last().click();
  });
  await owner.dialog.getByRole("listitem").first().waitFor();
  assert.equal(await owner.dialog.getByLabel("Campus").inputValue(), campusB, "opens on the selected campus");
  assert.equal(await owner.dialog.getByRole("listitem").count(), 1);
  await owner.dialog.getByLabel("Campus").selectOption("");
  await owner.dialog.getByRole("listitem").nth(2).waitFor();
  // The school-wide view also includes the owner's own sign-in security and export events.
  for (const label of ["Students", "Marks", "Classes"]) assert.equal(await owner.dialog.getByRole("listitem").filter({ hasText: label }).count() >= 1, true, `${label} from every campus`);
  await settled(owner.page); await owner.page.screenshot({ path: `${evidence}/history-owner-campus-filter-en-1440.png`, fullPage: true });
  await owner.ctx.close();

  await raw.rolePermission.create({ data: { schoolId, role: "CAMPUS_ADMIN", module: "reports", canView: false, canAdd: false, canEdit: false, canDelete: false } });
  const admin = await openHistory("campusAdmin", "/admin?view=leadership");
  await admin.dialog.getByRole("button", { name: "Export CSV" }).click();
  await admin.dialog.getByText("You do not have permission to export activity history.").waitFor();
  await settled(admin.page); await admin.page.screenshot({ path: `${evidence}/history-export-denied-en-1440.png`, fullPage: true });
  await admin.ctx.close();
  await raw.rolePermission.deleteMany({ where: { schoolId, role: "CAMPUS_ADMIN", module: "reports" } });
});

test("Arabic and Urdu campus admin layouts are RTL without overflow at 390px", async () => {
  for (const [key, path, title] of [["campusAdmin-ar", "/admin?view=leadership", "سجل النشاط"], ["campusAdmin-ur", "/admin", "سرگرمی کی تاریخ"]] as const) {
    const { ctx, page, dialog, errors } = await openHistory(key, path, { width: 390, height: 900 }, async page => {
      if (page.url().includes("view=leadership")) return;
      // Deep link fell back to the overview: reach the section the way a phone user does.
      await page.getByRole("button", { name: key.endsWith("-ur") ? "مزید" : "المزيد" }).click();
      await page.getByRole("button", { name: key.endsWith("-ur") ? "منتظمین اور رسائی" : "المسؤولون والوصول" }).first().click();
    });
    await dialog.getByText(title).first().waitFor();
    assert.equal(await dialog.locator("[dir='rtl']").count() > 0, true);
    assert.equal(await noOverflow(page), true, key);
    await settled(page); await page.screenshot({ path: `${evidence}/history-${key}-390.png`, fullPage: true });
    assert.deepEqual(errors, []); await ctx.close();
  }
});
