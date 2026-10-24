import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { totp } from "../../src/lib/auth/mfa-crypto";
import { createWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { previewSchoolAiExecution } from "../../src/lib/school-ai/execution";
import { createSchoolRun, processSchoolRun } from "../../src/lib/school-ai/run-service";

// SKO-470 browser acceptance on the isolated app: a blocked partial run explains why it stopped,
// shows which steps committed with their receipts and who owns recovery, reopens from a shared link,
// re-reviews only its unrun steps, and cancellation states that committed steps are not undone.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.RUNS_TEST_APP || "http://localhost:3107";
const evidence = process.env.RUNS_EVIDENCE_DIR || "/tmp/sko470-evidence";
const db = new PrismaClient(), password = "SyntheticRuns470!";
const schoolId = `run470-${randomUUID()}`, campusId = randomUUID();
const people = new Map<string, AuthUser>();
let browser: Browser, blockedRunId = "", secondRecordId = "";

async function person(key: string, language = "en") {
  const user: AuthUser = { userId: randomUUID(), schoolId, campusId, role: "CAMPUS_ADMIN", email: `${randomUUID()}@example.invalid`, accessVersion: 0 };
  await db.user.create({ data: { id: user.userId, email: user.email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role: "CAMPUS_ADMIN", schoolId, campusId, isActive: true, onboardingComplete: true, preferredLanguage: language } });
  people.set(key, user);
  return user;
}
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
async function context(key: string, viewport = { width: 1440, height: 1000 }): Promise<BrowserContext> {
  const saved = sessions.get(key);
  if (saved) return browser.newContext({ viewport, reducedMotion: "reduce", storageState: saved });
  const ctx = await browser.newContext({ viewport, reducedMotion: "reduce" });
  assert.equal((await ctx.request.post(base + "/api/auth/login", { data: { email: people.get(key)!.email, password } })).status(), 200);
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
let n = 0;
async function step(admin: AuthUser) {
  const label = `Synthetic Grade ${++n}`, proposal = { operation: "academics.setup_year", academicYear: 2026, label: "Synthetic 2026", startDate: null, endDate: null, classes: [{ id: randomUUID(), name: label, section: null, teachingMode: "SINGLE" }] };
  let record = await createWorkspaceRecord(admin, { kind: "WORKFLOW", title: `Set up ${label}`, campusId, data: { goal: label, steps: [{ id: randomUUID(), title: label, status: "ready", module: "academics" }], sourceIds: [], missingInformation: [], proposal }, idempotencyKey: randomUUID() });
  record = await updateWorkspaceRecord(admin, record.id, { version: record.version, action: "approve" });
  const preview = await previewSchoolAiExecution(admin, record.id, "academics.setup_year", record.version);
  return { recordId: record.id, version: record.version, operation: "academics.setup_year" as const, previewHash: preview.previewHash };
}

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Cedar Runs School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Cedar Main", regId: campusId, city: "Lahore" } });
  const admin = await person("admin"); await person("other"); await person("admin-ar", "ar"); await person("admin-ur", "ur");
  const first = await step(admin), second = await step(admin);
  secondRecordId = second.recordId;
  const run = await createSchoolRun(admin, { title: "Synthetic year setup", campusId, steps: [first, second], scheduledAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString(), idempotencyKey: randomUUID() });
  blockedRunId = run.id;
  await processSchoolRun(admin, run.id);
  await updateWorkspaceRecord(admin, second.recordId, { version: second.version, title: "Set up Synthetic Grade 2 (edited)", action: "save" });
  await processSchoolRun(admin, run.id).catch(() => undefined);
  const later = await step(admin);
  await createSchoolRun(admin, { title: "Synthetic later setup", campusId, steps: [later], scheduledAt: new Date(Date.now() + 86400000).toISOString(), expiresAt: new Date(Date.now() + 2 * 86400000).toISOString(), idempotencyKey: randomUUID() });
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await db.schoolAiExecution.deleteMany({ where: { schoolId } }); await db.school.delete({ where: { id: schoolId } }).catch(() => undefined); await db.$disconnect(); await prisma.$disconnect(); });

test("a shared link reopens the blocked run, which explains the block, its committed receipt and the stopped step", async () => {
  const ctx = await context("admin"), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/ai#run-${blockedRunId}`);
  const run = page.locator(`#run-${blockedRunId}`);
  await run.waitFor({ timeout: 30_000 });
  await page.waitForFunction(`document.activeElement?.id === "run-${blockedRunId}"`, undefined, { timeout: 10_000 });
  assert.equal(await run.getAttribute("data-run-status"), "BLOCKED");
  assert.equal(await run.locator("[data-run-block-reason]").getAttribute("data-run-block-reason"), "STALE_WORKSPACE_VERSION");
  assert.match(await run.innerText(), /approved plan changed after this run was scheduled/);
  assert.match(await run.innerText(), /1 of 2 steps committed/);
  assert.match(await run.innerText(), /Approved by you/);
  assert.match(await run.innerText(), /Needs review · Partly done/);
  assert.deepEqual(await run.locator("[data-step-state]").evaluateAll(items => items.map(item => item.getAttribute("data-step-state"))), ["committed", "stopped"]);
  assert.match(await run.locator("[data-step-state=committed]").innerText(), /Committed .* · Receipt [0-9a-f]{8}/);
  assert.match(await page.locator("[data-run-status=QUEUED]").innerText(), /Scheduled for/);
  await shot(page, "run-blocked-en-1440");
  // The edited step is not approved, so re-review says so instead of scheduling it.
  await run.getByRole("button", { name: "Review remaining steps", exact: true }).click();
  await page.getByText(/1 remaining steps are no longer approved/).waitFor();
  assert.equal(await page.getByRole("button", { name: "Schedule reviewed work" }).count(), 0);
  assert.deepEqual(errors, []); await ctx.close();
});

test("once the edited step is approved again, only the unrun step is re-reviewed; cancelling keeps committed work", async () => {
  const admin = people.get("admin")!, current = await db.schoolAiRecord.findUniqueOrThrow({ where: { id: secondRecordId } });
  await updateWorkspaceRecord(admin, secondRecordId, { version: current.version, action: "approve" });
  const ctx = await context("admin"), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/ai#run-${blockedRunId}`);
  const run = page.locator(`#run-${blockedRunId}`);
  await run.waitFor({ timeout: 30_000 });
  await run.getByRole("button", { name: "Review remaining steps", exact: true }).click();
  await page.getByText(/1 remaining steps are selected below/).waitFor();
  await page.getByRole("button", { name: "Schedule reviewed work" }).waitFor({ timeout: 15_000 });
  assert.equal(await page.getByRole("textbox", { name: "Run name" }).inputValue(), "Synthetic year setup");
  assert.equal(await page.locator("details").count(), 1, "only the unrun step is previewed");
  await shot(page, "run-review-remaining-en-1440");
  await run.getByRole("button", { name: "Cancel remaining steps", exact: true }).click();
  const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog"));
  await dialog.getByText(/1 committed steps stay in effect and are not undone. The 1 steps that have not run will not run./).waitFor();
  await shot(page, "run-cancel-confirm-en-1440");
  await dialog.getByRole("button", { name: "Cancel remaining steps" }).click();
  await page.waitForFunction(`document.querySelector("#run-${blockedRunId}")?.getAttribute("data-run-status") === "CANCELLED"`);
  assert.match(await run.innerText(), /Cancelled · Partly done/);
  const saved = await db.schoolAiRun.findUniqueOrThrow({ where: { id: blockedRunId } });
  assert.deepEqual([saved.status, (saved.receipts as unknown[]).length], ["CANCELLED", 1]);
  assert.equal(await db.schoolAiExecution.count({ where: { schoolId } }), 1, "no new effect was committed");
  assert.deepEqual(errors, []); await ctx.close();
});

test("another manager sees who owns recovery and cannot re-review it", async () => {
  const admin = people.get("admin")!, other = people.get("other")!;
  const first = await step(admin), second = await step(admin);
  const run = await createSchoolRun(admin, { title: "Synthetic owner check", campusId, steps: [first, second], scheduledAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString(), idempotencyKey: randomUUID() });
  await processSchoolRun(admin, run.id);
  await updateWorkspaceRecord(admin, second.recordId, { version: second.version, title: "Edited again", action: "save" });
  await processSchoolRun(admin, run.id).catch(() => undefined);
  assert.ok(other.userId);
  const ctx = await context("other"), page = await ctx.newPage();
  await page.goto(`${base}/ai#run-${run.id}`);
  const card = page.locator(`#run-${run.id}`);
  await card.waitFor({ timeout: 30_000 });
  assert.match(await card.innerText(), /Approved by Synthetic admin/);
  assert.match(await card.innerText(), /Only Synthetic admin can resume or re-review this run/);
  assert.equal(await card.getByRole("button", { name: "Review remaining steps" }).count(), 0);
  await ctx.close();
});

for (const [key, viewport, name] of [["admin-ar", { width: 390, height: 844 }, "run-blocked-ar-390"], ["admin-ur", { width: 768, height: 1024 }, "run-blocked-ur-768"]] as const) {
  test(`${key}: the run timeline reads right-to-left without horizontal overflow (${viewport.width}px)`, async () => {
    const admin = people.get(key)!, first = await step(admin), second = await step(admin);
    const run = await createSchoolRun(admin, { title: "Synthetic RTL run", campusId, steps: [first, second], scheduledAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString(), idempotencyKey: randomUUID() });
    await processSchoolRun(admin, run.id);
    await updateWorkspaceRecord(admin, second.recordId, { version: second.version, title: "Edited RTL", action: "save" });
    await processSchoolRun(admin, run.id).catch(() => undefined);
    const ctx = await context(key, viewport), page = await ctx.newPage();
    await page.goto(`${base}/ai#run-${run.id}`);
    const card = page.locator(`#run-${run.id}`);
    await card.waitFor({ timeout: 30_000 });
    await page.waitForFunction(`document.activeElement?.id === "run-${run.id}"`, undefined, { timeout: 10_000 });
    assert.equal(await card.evaluate(el => getComputedStyle(el).direction), "rtl");
    assert.equal(await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true);
    assert.doesNotMatch(await card.innerText(), /steps committed|Approved by|Stopped here/, "no English lifecycle copy in RTL");
    await shot(page, name);
    await ctx.close();
  });
}

async function blockedRun(key: string, title: string) {
  const admin = people.get(key)!, first = await step(admin), second = await step(admin);
  const run = await createSchoolRun(admin, { title, campusId, steps: [first, second], scheduledAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString(), idempotencyKey: randomUUID() });
  await processSchoolRun(admin, run.id);
  await updateWorkspaceRecord(admin, second.recordId, { version: second.version, title: `${title} (edited)`, action: "save" });
  await processSchoolRun(admin, run.id).catch(() => undefined);
  return run.id;
}

test("keyboard only: reach re-review and cancel, open the dialog, and Escape returns focus to its trigger", async () => {
  const runId = await blockedRun("admin", "Synthetic keyboard run");
  const ctx = await context("admin"), page = await ctx.newPage();
  await page.goto(`${base}/ai#run-${runId}`);
  await page.waitForFunction(`document.activeElement?.id === "run-${runId}"`, undefined, { timeout: 30_000 });
  const tabTo = async (name: string) => {
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press("Tab");
      if ((await page.evaluate("document.activeElement?.textContent?.trim() ?? ''")) === name) return;
    }
    throw new Error(`Could not reach ${name} by keyboard`);
  };
  await tabTo("Review remaining steps");
  assert.equal(await page.evaluate("getComputedStyle(document.activeElement).outlineStyle !== 'none' || getComputedStyle(document.activeElement).boxShadow !== 'none'"), true, "focus is visible");
  await page.keyboard.press("Enter");
  await page.getByText(/remaining steps are no longer approved/).waitFor();
  await page.locator(`#run-${runId}`).focus();
  await tabTo("Cancel remaining steps");
  await page.keyboard.press("Enter");
  await page.getByRole("alertdialog").or(page.getByRole("dialog")).last().waitFor();
  assert.equal(await page.evaluate("Boolean(document.activeElement?.closest('[role=dialog],[role=alertdialog]'))"), true, "focus moves into the dialog");
  await page.keyboard.press("Escape");
  await page.waitForFunction("!document.querySelector('[role=alertdialog]')");
  await page.waitForFunction("document.activeElement?.textContent?.trim() === 'Cancel remaining steps'", undefined, { timeout: 5_000 });
  assert.equal((await db.schoolAiRun.findUniqueOrThrow({ where: { id: runId } })).status, "BLOCKED", "Escape changed nothing");
  await ctx.close();
});

for (const [key, viewport, label] of [["admin", { width: 320, height: 720 }, "en-320"], ["admin-ar", { width: 768, height: 1024 }, "ar-768"], ["admin", { width: 720, height: 500 }, "en-200pct-zoom"]] as const) {
  test(`the run card fits without horizontal scrolling (${label})`, async () => {
    const runId = await blockedRun(key, `Synthetic matrix ${label}`);
    const ctx = await context(key, viewport), page = await ctx.newPage();
    await page.goto(`${base}/ai#run-${runId}`);
    await page.locator(`#run-${runId}`).waitFor({ timeout: 30_000 });
    assert.equal(await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true);
    const box = await page.locator(`#run-${runId}`).boundingBox();
    assert.ok(box && box.width <= viewport.width, "the card stays inside the viewport");
    if (label === "en-320") await shot(page, "run-blocked-en-320");
    await ctx.close();
  });
}
