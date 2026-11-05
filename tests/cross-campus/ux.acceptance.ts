/** Owner interaction regressions. Run only against the isolated owner QA server/database. */
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import { chromium, type Page } from "playwright";
import { expect } from "@playwright/test";

async function main() {
  const base = "http://127.0.0.1:3094";
  const database = "postgresql://angular_dev_15@127.0.0.1:5432/owner_audit_20261024";
  assert.equal(process.env.DATABASE_URL, database);
  assert.equal(process.env.AUTH_SECRET, "synthetic-owner-audit-only-20261024");
  const db = new PrismaClient({ datasourceUrl: database + "?connection_limit=2" });
  const output = "test-results/owner-ux";
  await mkdir(output, { recursive: true });
  const run = randomUUID().slice(0, 8);
  const seedSchool = async (name: string) => db.school.create({ data: { name, slug: randomUUID(), regId: randomUUID(), city: "Lahore", contactEmail: `${randomUUID()}@example.invalid`, status: "ACTIVE", plan: "PRO", registrationKind: "GROUP", planPricing: {} } });
  const school = await seedSchool(`UX Cedar ${run}`), other = await seedSchool(`UX Maple ${run}`);
  const campus = await db.campus.create({ data: { schoolId: school.id, name: "Main campus", city: "Lahore", regId: randomUUID() } });
  const owner = await db.user.create({ data: { schoolId: school.id, role: "APP_OWNER", fullName: "Synthetic UX Owner", email: `${randomUUID()}@example.invalid`, password: "unused", onboardingComplete: true, welcomeCompletedAt: new Date(), mfaEnabled: true, tourProgress: { owner: { v: 1, s: "done", at: new Date().toISOString() } } } });
  const token = await new SignJWT({ userId: owner.id, schoolId: school.id, role: owner.role, accessVersion: owner.accessVersion, email: owner.email, fullName: owner.fullName, onboardingComplete: true, schoolStatus: "ACTIVE", mfaVerified: true }).setProtectedHeader({ alg: "HS256" }).setJti(randomUUID()).setIssuedAt().setExpirationTime("2h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  await db.loginSession.create({ data: { schoolId: school.id, userId: owner.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 7200000) } });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 390, height: 1000 } });
  await context.addCookies([{ name: "skoolee_token", value: token, url: base }]);
  const api = async (path: string, method = "GET", data?: unknown) => {
    const response = await context.request.fetch(base + path, { method, data, headers: { origin: base } });
    return { status: response.status(), body: await response.json() };
  };
  const results: { name: string; passed: boolean; error?: string }[] = [];
  const shot = async (page: Page, name: string) => {
    await page.screenshot({ path: `${output}/${name}.png`, mask: [page.locator('input[type="password"]'), page.getByLabel("Temporary password")] });
  };
  const go = async (page: Page, view: string) => {
    await page.goto(`${base}/owner?view=${view}`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.locator(`[data-owner-view="${view}"]`).waitFor();
    await page.locator('div.pointer-events-none.fixed.inset-0[aria-hidden=true]').waitFor({ state: "hidden" });
  };
  const saved = async (page: Page, path: string, method: string, click: () => Promise<unknown>) => {
    const waiting = page.waitForResponse(r => new URL(r.url()).pathname === path && r.request().method() === method);
    await click(); const response = await waiting;
    assert.ok(response.ok(), `${response.status()}: ${await response.text()}`);
    return response.json();
  };
  const check = async (name: string, fn: (page: Page) => Promise<void>) => {
    if (process.env.OWNER_UX_FILTER && !name.includes(process.env.OWNER_UX_FILTER)) return;
    const page = await context.newPage(); page.setDefaultTimeout(20000);
    const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
    try { await fn(page); assert.deepEqual(errors, []); results.push({ name, passed: true }); console.log(`PASS ${name}`); }
    catch (error) { results.push({ name, passed: false, error: String(error) }); console.log(`FAIL ${name}: ${error}`); await shot(page, `failure-${results.length}`).catch(() => {}); }
    finally { await page.close(); }
  };
  try {
    await check("pricing inheritance, decimals, clear override and reload", async page => {
      await go(page, "pricing");
      const picker = page.locator('#field-pricing-school');
      await picker.selectOption(school.id);
      const price = page.locator('#field-school-price-BASIC');
      await expect(price).toHaveValue("");
      await price.fill("3210.50");
      await saved(page, `/api/owner/schools/${school.id}/pricing`, "PUT", () => page.getByRole("button", { name: "Save this school's prices" }).click());
      assert.equal((await api(`/api/owner/schools/${school.id}`)).body.data.planPricing.BASIC.price, 3210.5);
      await price.fill("");
      await saved(page, `/api/owner/schools/${school.id}/pricing`, "PUT", () => page.getByRole("button", { name: "Save this school's prices" }).click());
      await page.reload(); await picker.selectOption(school.id); await expect(price).toHaveValue("");
      await shot(page, "pricing-inherited-390");
    });
    await check("pricing ignores an older school response", async page => {
      await db.school.update({ where: { id: school.id }, data: { planPricing: { BASIC: { price: 111 } } } });
      await db.school.update({ where: { id: other.id }, data: { planPricing: { BASIC: { price: 222 } } } });
      let release!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      await page.route(`**/api/owner/schools/${school.id}`, async route => { const response = await route.fetch(); await gate; await route.fulfill({ response }); });
      await go(page, "pricing");
      const picker = page.locator('#field-pricing-school');
      const first = page.waitForRequest(r => r.url().endsWith(`/api/owner/schools/${school.id}`));
      await picker.selectOption(school.id); await first;
      await picker.selectOption(other.id);
      await expect(page.locator('#field-school-price-BASIC')).toHaveValue("222");
      const late = page.waitForResponse(r => r.url().endsWith(`/api/owner/schools/${school.id}`)); release(); await late;
      await expect(page.locator('#field-school-price-BASIC')).toHaveValue("222");
      await shot(page, "pricing-latest-selection-390");
    });
    await check("default price load failure blocks saving and retry restores null prices", async page => {
      await api("/api/owner/platform-config", "PUT", { pricing: { BASIC: { price: null } } });
      let fail = true;
      await page.route("**/api/owner/platform-config", route => fail && route.request().method() === "GET" ? route.fulfill({ status: 503, json: { error: "Synthetic outage" } }) : route.continue());
      await go(page, "pricing");
      await expect(page.getByText("The saved default prices did not load")).toBeVisible();
      await expect(page.getByRole("button", { name: "Save prices", exact: true })).toBeDisabled();
      await shot(page, "pricing-failure-390"); fail = false;
      await page.getByRole("button", { name: "Try again", exact: true }).click();
      await expect(page.locator('#field-default-price-BASIC')).toHaveValue("");
      await expect(page.getByRole("button", { name: "Save prices", exact: true })).toBeEnabled();
    });
    await check("default prices reject stale edits and support reloading before save", async page => {
      await go(page, "pricing");
      await expect(page.getByRole("button", { name: "Save prices", exact: true })).toBeEnabled();
      await page.locator('#field-default-price-BASIC').fill("4321.50");
      await api("/api/owner/platform-config", "PUT", { pricing: { BASIC: { price: 9876 } } });
      const response = page.waitForResponse(r => r.url().endsWith("/api/owner/platform-config") && r.request().method() === "PUT");
      await page.getByRole("button", { name: "Save prices", exact: true }).click();
      assert.equal((await response).status(), 409);
      assert.equal((await api("/api/owner/platform-config")).body.data.BASIC.price, 9876);
      await page.getByRole("button", { name: "Reload saved prices" }).click();
      await expect(page.locator('#field-default-price-BASIC')).toHaveValue("9876");
      await page.locator('#field-default-price-BASIC').fill("4321.50");
      await saved(page, "/api/owner/platform-config", "PUT", () => page.getByRole("button", { name: "Save prices", exact: true }).click());
      assert.equal((await api("/api/owner/platform-config")).body.data.BASIC.price, 4321.5);
    });
    await check("school list failure has inline retry and disables add user", async page => {
      let fail = true;
      await page.route("**/api/owner/schools?**", route => fail ? route.fulfill({ status: 503, json: { error: "Synthetic outage" } }) : route.continue());
      await go(page, "users");
      await expect(page.getByText("The school list did not load")).toBeVisible();
      await expect(page.getByRole("button", { name: "Add user", exact: true })).toBeDisabled();
      await shot(page, "users-school-list-error-390"); fail = false;
      await page.getByRole("button", { name: "Try again", exact: true }).click();
      await expect(page.getByRole("button", { name: "Add user", exact: true })).toBeEnabled();
    });
    await check("add user preselects school and campus, validates password, preserves failed input, creates and copies", async page => {
      await go(page, "users");
      await page.getByRole("combobox", { name: "Filter by school" }).selectOption(school.id);
      await page.getByRole("button", { name: "Add user", exact: true }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByLabel(/^School\s*\*?$/)).toHaveValue(school.id);
      await expect(dialog.getByLabel(/^Campus\s*\*?$/)).toHaveValue(campus.id);
      await dialog.getByLabel(/^Full name/).fill(`UX Staff ${run}`);
      await dialog.getByLabel(/^Sign-in email/).fill(`ux-staff-${run}@example.invalid`);
      const password = dialog.getByLabel("Temporary password", { exact: true });
      await password.fill("short"); await expect(dialog.getByRole("button", { name: "Create user", exact: true })).toBeDisabled();
      await password.fill("SyntheticPassword123");
      let fail = true;
      await page.route("**/api/owner/users", route => fail && route.request().method() === "POST" ? route.fulfill({ status: 503, json: { error: "Synthetic outage: please retry" } }) : route.continue());
      await dialog.getByRole("button", { name: "Create user", exact: true }).click();
      await expect(dialog.getByText("Synthetic outage: please retry")).toBeVisible();
      await expect(dialog.getByLabel(/^Full name/)).toHaveValue(`UX Staff ${run}`);
      await shot(page, "user-form-retry-390"); fail = false;
      await saved(page, "/api/owner/users", "POST", () => dialog.getByRole("button", { name: "Create user", exact: true }).click());
      await expect(dialog.getByRole("button", { name: "Show password", exact: true })).toBeVisible();
      await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined }));
      await dialog.getByRole("button", { name: "Copy email", exact: true }).click();
      await expect(dialog.getByText("Could not copy. Select the text and copy it manually.")).toBeVisible();
      await shot(page, "user-created-390");
      await dialog.getByRole("button", { name: "Done", exact: true }).click();
      assert.equal(await db.user.count({ where: { schoolId: school.id, email: `ux-staff-${run}@example.invalid` } }), 1);
    });
    await check("capacity validates, preserves failed input, applies and reverts a scoped policy", async page => {
      await go(page, "capacity"); await page.locator('[data-policy-open]').click();
      const dialog = page.getByRole("dialog");
      await dialog.locator('[data-policy-school]').selectOption(school.id);
      await dialog.locator('[data-policy-reason]').fill("Synthetic capacity incident verification");
      await dialog.locator('[data-policy-limit]').fill("");
      await expect(dialog.locator('[data-policy-save]')).toBeDisabled();
      await dialog.locator('[data-policy-limit]').fill("1.5"); await expect(dialog.locator('[data-policy-save]')).toBeDisabled();
      await dialog.locator('[data-policy-limit]').fill("2"); await expect(dialog.locator('[data-policy-save]')).toBeDisabled();
      await dialog.locator('[data-policy-expires]').fill("2020-01-01T12:00"); await expect(dialog.locator('[data-policy-save]')).toBeDisabled();
      await dialog.locator('[data-policy-expires]').fill("2030-01-01T12:00");
      let fail = true;
      await page.route("**/api/owner/capacity", route => fail && route.request().method() === "POST" ? route.fulfill({ status: 503, json: { error: "Synthetic policy outage" } }) : route.continue());
      await dialog.locator('[data-policy-save]').click();
      await expect(dialog.getByText("Synthetic policy outage")).toBeVisible();
      await shot(page, "capacity-policy-retry-390"); fail = false;
      const response = await saved(page, "/api/owner/capacity", "POST", () => dialog.locator('[data-policy-save]').click());
      await shot(page, "capacity-policy-applied-390");
      await dialog.locator('[data-policy-close]').click();
      await page.locator(`[data-policy-revert="${response.data.id}"]`).click();
      await page.getByRole("alertdialog").getByLabel("Why revert this change?").fill("Synthetic test completed");
      await saved(page, "/api/owner/capacity", "POST", () => page.getByRole("alertdialog").getByRole("button", { name: "Revert", exact: true }).click());
      assert.ok((await db.resourcePolicy.findUniqueOrThrow({ where: { id: response.data.id } })).revokedAt);
    });
    await check("pilot creation shows server errors inside dialog and records observation and measure", async page => {
      await go(page, "pilots"); await page.getByRole("button", { name: "New pilot", exact: true }).first().click();
      const dialog = page.getByRole("dialog");
      for (const [label, value] of Object.entries({ "Pilot name": `UX Pilot ${run}`, "Country code": "PK", Curriculum: "Synthetic", "Use case": "Owner browser verification", "Starts on": "2026-10-25", "School champion": "Synthetic champion", "Workflow key": "MARKS_ENTRY", "Workflow definition": "Record synthetic marks", "Success definition": "All records saved correctly" })) await dialog.getByLabel(new RegExp(`^${label}\\s*\\*?$`)).fill(value);
      await dialog.getByLabel("Synthetic demonstration (never reported as a result)").check();
      let fail = true;
      await page.route("**/api/owner/pilots", route => fail && route.request().method() === "POST" ? route.fulfill({ status: 503, json: { error: "Synthetic pilot outage" } }) : route.continue());
      await dialog.getByRole("button", { name: "Save charter" }).click(); await expect(dialog.getByText("Synthetic pilot outage")).toBeVisible();
      await shot(page, "pilot-create-retry-390"); fail = false;
      await saved(page, "/api/owner/pilots", "POST", () => dialog.getByRole("button", { name: "Save charter" }).click());
      await page.getByRole("button", { name: "Add evidence", exact: true }).click();
      for (const [label, value] of Object.entries({ "Participant pseudonym": "T-01", "Observed on": "2026-10-25", Task: "Save synthetic marks", Difficulty: "Normal", "Active minutes": "2", "Review and correction minutes": "1", "Elapsed minutes": "3" })) await dialog.getByLabel(new RegExp(`^${label}\\s*\\*?$`)).fill(value);
      await dialog.getByRole("button", { name: "Record observation", exact: true }).click();
      await expect(dialog).toBeHidden();
      await page.getByRole("button", { name: "Add evidence", exact: true }).click();
      await dialog.getByRole("button", { name: "Measure", exact: true }).click();
      for (const [label, value] of Object.entries({ "Period start": "2026-10-25", "Period end": "2026-10-25", Unit: "records", Value: "9", Denominator: "10", Method: "Synthetic manual verification" })) await dialog.getByLabel(new RegExp(`^${label}\\s*\\*?$`)).fill(value);
      await dialog.getByRole("button", { name: "Record measure", exact: true }).click();
      const referenceError = dialog.getByText("Name the human-reviewed reference the sample was checked against.");
      await expect(referenceError).toBeInViewport();
      await shot(page, "pilot-measure-validation-390");
      await dialog.getByLabel(/^Reference/).fill("Synthetic QA reference sheet");
      await dialog.getByRole("button", { name: "Record measure", exact: true }).click(); await expect(dialog).toBeHidden();
      await shot(page, "pilot-evidence-recorded-390");
    });
    await check("bank details save and reload through the UI", async page => {
      await go(page, "payments");
      for (const [label, value] of Object.entries({ "Bank name": "Synthetic UX Bank", "Account title": "Synthetic platform", "Account number": "123456789", IBAN: "" })) await page.getByLabel(label, { exact: false }).fill(value);
      await saved(page, "/api/owner/payment-settings", "POST", () => page.getByRole("button", { name: "Save bank details" }).click());
      await page.reload(); await expect(page.getByLabel("Bank name", { exact: true })).toHaveValue("Synthetic UX Bank");
      await shot(page, "bank-settings-saved-390");
    });
    await check("subscription approval cancellation and decline are persisted", async page => {
      const req = await db.subscriptionRequest.create({ data: { schoolId: school.id, requestedById: owner.id, idempotencyKey: randomUUID(), kind: "GRACE_EXTENSION", details: { requestedUntil: new Date(Date.now() + 86400000).toISOString() } } });
      await go(page, "subscription-requests");
      const card = page.locator('[data-subscription-request]').filter({ hasText: school.name });
      await card.getByRole("button", { name: "Approve", exact: true }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Keep editing", exact: true }).click();
      assert.equal((await db.subscriptionRequest.findUniqueOrThrow({ where: { id: req.id } })).state, "PENDING_REVIEW");
      await card.getByRole("button", { name: "Decline", exact: true }).click();
      await page.getByRole("alertdialog").getByLabel("Reason recorded in the audit log").fill("Synthetic request declined for testing");
      await shot(page, "subscription-decline-confirmation-390");
      await saved(page, "/api/owner/subscription-requests", "POST", () => page.getByRole("alertdialog").getByRole("button", { name: "Decline", exact: true }).click());
      assert.equal((await db.subscriptionRequest.findUniqueOrThrow({ where: { id: req.id } })).state, "REVIEWED_DECLINED");
    });
    await check("school detail tabs, cancel plan change, save plan, AI live and status restoration", async page => {
      const open = async () => {
        await go(page, "schools"); await page.getByRole("textbox", { name: "Search schools" }).fill(school.name);
        await page.getByRole("button", { name: new RegExp(school.name) }).click();
        await page.getByRole("button", { name: "Details", exact: true }).click();
      };
      await open();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("button", { name: "Campuses", exact: true }).click();
      await expect(dialog.getByText("Main campus", { exact: true })).toBeVisible();
      await dialog.getByRole("button", { name: "Subscription", exact: true }).click();
      await dialog.getByRole("button", { name: /^Pro / }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Keep editing", exact: true }).click();
      assert.equal((await db.school.findUniqueOrThrow({ where: { id: school.id } })).plan, "PRO");
      await dialog.getByRole("button", { name: /^Pro / }).click();
      await shot(page, "school-plan-confirmation-390");
      await saved(page, `/api/owner/schools/${school.id}`, "PATCH", () => page.getByRole("alertdialog").getByRole("button", { name: "Change plan", exact: true }).click());
      await expect(dialog).toBeHidden(); await open();
      await dialog.getByRole("switch").click();
      await saved(page, `/api/owner/schools/${school.id}/ai-workflows-live`, "PUT", () => page.getByRole("alertdialog").getByRole("button", { name: "Turn live", exact: true }).click());
      await expect(page.getByRole("alertdialog")).toBeHidden();
      await expect(dialog.locator('[data-ai-live-state]')).toHaveAttribute("data-ai-live-state", "live");
      await saved(page, `/api/owner/schools/${school.id}/ai-workflows-live`, "PUT", () => dialog.getByRole("switch").click());
      await dialog.getByRole("button", { name: "Suspend school", exact: true }).click();
      await saved(page, `/api/owner/schools/${school.id}`, "PATCH", () => page.getByRole("alertdialog").getByRole("button", { name: "Confirm", exact: true }).click());
      await expect(dialog).toBeHidden(); await open();
      await dialog.getByRole("button", { name: "Restore school", exact: true }).click();
      await saved(page, `/api/owner/schools/${school.id}`, "PATCH", () => page.getByRole("alertdialog").getByRole("button", { name: "Confirm", exact: true }).click());
      assert.equal((await db.school.findUniqueOrThrow({ where: { id: school.id } })).status, "ACTIVE");
    });
    await check("session confirmation cancellation and termination", async page => {
      const target = await db.user.create({ data: { schoolId: school.id, role: "TEACHER", fullName: `UX Device ${run}`, email: `${randomUUID()}@example.invalid`, password: "unused" } });
      const session = await db.loginSession.create({ data: { schoolId: school.id, userId: target.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 3600000) } });
      await go(page, "sessions");
      const card = page.locator('div.rounded-2xl.border.p-4').filter({ hasText: target.fullName });
      await card.getByRole("button", { name: "End session", exact: true }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Keep editing", exact: true }).click();
      assert.equal((await db.loginSession.findUniqueOrThrow({ where: { id: session.id } })).isActive, true);
      await card.getByRole("button", { name: "End session", exact: true }).click();
      await shot(page, "session-end-confirmation-390");
      await saved(page, "/api/owner/sessions", "DELETE", () => page.getByRole("alertdialog").getByRole("button", { name: "End session", exact: true }).click());
      assert.equal((await db.loginSession.findUniqueOrThrow({ where: { id: session.id } })).isActive, false);
    });
    await check("support request validates purpose and records a pending scoped grant", async page => {
      await go(page, "support");
      await page.locator('#field-support-school').selectOption(school.id);
      await expect(page.getByRole("button", { name: "Send school approval request" })).toBeDisabled();
      await page.getByRole("textbox", { name: "Support purpose" }).fill(`Synthetic UX investigation ${run}`);
      await page.getByRole("textbox", { name: "Impact", exact: true }).fill("Synthetic school phone correction");
      const response = await saved(page, "/api/owner/support/grants", "POST", () => page.getByRole("button", { name: "Send school approval request" }).click());
      const card = page.locator('article').filter({ hasText: `Synthetic UX investigation ${run}` });
      await expect(card).toBeVisible();
      assert.equal(response.data.grant.status, "pending");
      assert.equal(await card.getByRole("button", { name: "Start access", exact: true }).count(), 0);
      await shot(page, "support-request-pending-390");
    });
    await check("provider event resolution records a note without changing billing", async page => {
      const eventId = `evt_synthetic_${run}`;
      await db.stripeWebhookReceipt.create({ data: { eventId, eventType: "synthetic.review", eventCreated: Math.floor(Date.now() / 1000), schoolId: school.id, state: "NEEDS_REVIEW", error: "Synthetic verification event" } });
      const before = (await db.school.findUniqueOrThrow({ where: { id: school.id } })).plan;
      await go(page, "subscription-requests");
      const card = page.locator(`[data-provider-event="${eventId}"]`);
      await expect(card.getByRole("button", { name: "Mark handled" })).toBeDisabled();
      await card.getByLabel("How was this handled?").fill("Synthetic event checked; no payment submitted");
      await shot(page, "provider-event-review-390");
      await saved(page, "/api/owner/provider-events", "POST", () => card.getByRole("button", { name: "Mark handled" }).click());
      assert.equal((await db.stripeWebhookReceipt.findUniqueOrThrow({ where: { eventId } })).state, "RESOLVED");
      assert.equal((await db.school.findUniqueOrThrow({ where: { id: school.id } })).plan, before);
    });
    await check("pilot details ignore delayed responses", async page => {
      const create = async (name: string) => (await api("/api/owner/pilots", "POST", { name, country: "PK", curriculum: "Synthetic", language: "en", useCase: "UI race verification", startsOn: "2026-10-25", championName: "Synthetic", measurementOwnerId: owner.id, synthetic: true, workflows: [{ key: "MARKS_ENTRY", definition: "Save synthetic marks", successDefinition: "All synthetic records saved correctly" }] })).body.data;
      const first = await create(`UX Slow ${run}`), second = await create(`UX Fast ${run}`);
      let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
      await page.route(`**/api/owner/pilots/${first.id}`, async route => { const response = await route.fetch(); await gate; await route.fulfill({ response }); });
      await go(page, "pilots");
      const requested = page.waitForRequest(r => r.url().endsWith(`/api/owner/pilots/${first.id}`));
      await page.getByRole("button", { name: new RegExp(first.name) }).click(); await requested;
      await page.getByRole("button", { name: new RegExp(second.name) }).click();
      await expect(page.locator('#pilot-detail-heading')).toHaveText(second.name);
      const late = page.waitForResponse(r => r.url().endsWith(`/api/owner/pilots/${first.id}`)); release(); await late;
      await expect(page.locator('#pilot-detail-heading')).toHaveText(second.name);
      await shot(page, "pilot-latest-selection-390");
    });
    await check("refresh reloads both review queues and surfaces outages with retry", async page => {
      await go(page, "subscription-requests");
      await page.getByRole("button", { name: "Refresh", exact: true }).waitFor();
      let fail = true;
      for (const path of ["subscription-requests", "provider-events"]) await page.route(`**/api/owner/${path}`, route => fail && route.request().method() === "GET" ? route.fulfill({ status: 503, json: { error: "Synthetic refresh outage" } }) : route.continue());
      await page.getByRole("button", { name: "Refresh", exact: true }).click();
      await expect(page.getByText("Subscription requests did not load", { exact: true })).toBeVisible();
      await expect(page.getByText("Provider events did not load", { exact: true })).toBeVisible();
      await shot(page, "review-queues-refresh-error-390"); fail = false;
      await page.getByRole("button", { name: "Refresh", exact: true }).click();
      await expect(page.getByText("Subscription requests did not load", { exact: true })).toBeHidden();
      await expect(page.getByText("Provider events did not load", { exact: true })).toBeHidden();
    });
    await check("additional: group provisioning validates and keeps its submit controls visible", async page => {
      await go(page, "schools"); await page.getByRole("button", { name: "Provision a school", exact: true }).click();
      const dialog = page.getByRole("dialog"), submit = dialog.getByRole("button", { name: "Provision school", exact: true });
      await expect(submit).toBeInViewport(); await expect(submit).toBeDisabled();
      await dialog.getByRole("radio", { name: /^School group/ }).click();
      for (const [label, value] of Object.entries({ "School group name": `UX Group ${run}`, City: "Lahore", "Campus name": "Garden campus", "Full name": "Synthetic group owner", "Sign-in email": `group-${run}@example.invalid` })) await dialog.getByLabel(new RegExp(`^${label}\\s*\\*?$`)).fill(value);
      await dialog.getByLabel("Temporary password").fill("short"); await expect(submit).toBeDisabled();
      await dialog.getByRole("button", { name: "Make a new password" }).click(); await expect(submit).toBeEnabled();
      await dialog.getByRole("radio", { name: "Active", exact: true }).click();
      await shot(page, "provision-group-review-390");
      const response = await saved(page, "/api/owner/schools", "POST", () => submit.click());
      await expect(dialog.getByRole("button", { name: "Show password", exact: true })).toBeVisible();
      assert.equal(response.data.kind, "GROUP"); assert.equal(response.data.ownerRole, "SUPER_ADMIN");
      await shot(page, "provision-group-created-390");
      await dialog.getByRole("button", { name: "Done", exact: true }).click();
    });
    await check("additional: support starts approved access, reads, queues, applies, ends and closes", async page => {
      const created = await api("/api/owner/support/grants", "POST", { schoolId: school.id, purpose: `Synthetic support flow ${run}`, impact: "Synthetic phone correction", scope: ["school_profile"], actions: ["read", "write"], durationMinutes: 30 });
      assert.equal(created.status, 201, JSON.stringify(created.body)); const id = created.body.data.grant.id;
      // The baseline acceptance suite exercises the school's approval endpoint. This UI fixture begins approved.
      await db.supportGrant.update({ where: { id }, data: { status: "approved", approvedById: owner.id } });
      try {
        await go(page, "support");
        await page.locator('article').filter({ hasText: `Synthetic support flow ${run}` }).getByRole("button", { name: "Start access", exact: true }).click();
        await expect(page.getByText("Scoped active session", { exact: true })).toBeVisible();
        await page.getByRole("button", { name: "Open: School profile", exact: true }).click();
        await expect(page.locator('#support-preview-heading')).toBeVisible();
        await page.getByRole("textbox", { name: "New value", exact: true }).fill("000111222");
        const queued = await saved(page, "/api/owner/support/actions", "POST", () => page.getByRole("button", { name: "Queue action", exact: true }).click());
        await saved(page, `/api/owner/support/actions/${queued.data.id}/execute`, "POST", () => page.getByRole("button", { name: "Apply change", exact: true }).click());
        assert.equal((await db.school.findUniqueOrThrow({ where: { id: school.id } })).phone, "000111222");
        await shot(page, "support-applied-390");
        await saved(page, `/api/owner/support/grants/${id}`, "DELETE", () => page.getByRole("button", { name: "End access now", exact: true }).click());
        await expect(page.getByText("Scoped active session", { exact: true })).toBeHidden();
        const card = page.locator('article').filter({ hasText: `Synthetic support flow ${run}` });
        await card.getByRole("textbox", { name: "Closure evidence", exact: true }).fill("Synthetic phone correction checked in database");
        await saved(page, `/api/owner/support/grants/${id}`, "PATCH", () => card.getByRole("button", { name: "Close incident with evidence" }).click());
        await shot(page, "support-closed-390");
      } finally {
        await api(`/api/owner/support/grants/${id}`, "DELETE");
        await context.clearCookies({ name: "skoolee_support_grant" });
      }
    });
    await check("additional: pilot charter lifecycle and unsupported claim review", async page => {
      const response = await api("/api/owner/pilots", "POST", { name: `UX Charter ${run}`, country: "PK", curriculum: "Synthetic", language: "en", useCase: "Charter UI verification", startsOn: "2026-10-25", championName: "Synthetic champion", measurementOwnerId: owner.id, synthetic: true, workflows: [{ key: "MARKS_ENTRY", definition: "Save synthetic marks", successDefinition: "All synthetic records saved" }] });
      assert.equal(response.status, 201, JSON.stringify(response.body)); const pilot = response.body.data;
      await go(page, "pilots"); await page.getByRole("button", { name: new RegExp(pilot.name) }).click();
      await page.getByLabel("Consent reference", { exact: true }).fill("Synthetic consent fixture");
      await page.getByLabel("Case-study permission", { exact: true }).selectOption("AGGREGATE");
      await page.getByLabel("Permission reference", { exact: true }).fill("Synthetic permission fixture");
      await saved(page, `/api/owner/pilots/${pilot.id}`, "POST", () => page.getByRole("button", { name: "Save consent and permission", exact: true }).click());
      await saved(page, `/api/owner/pilots/${pilot.id}`, "POST", () => page.getByRole("button", { name: "Start pilot", exact: true }).click());
      await saved(page, `/api/owner/pilots/${pilot.id}`, "POST", () => page.getByRole("button", { name: "Close pilot", exact: true }).click());
      await page.getByLabel(/^Proposed statement/).fill("Synthetic claim for review; no measured result");
      const claim = await saved(page, `/api/owner/pilots/${pilot.id}`, "POST", () => page.getByRole("button", { name: "Propose claim", exact: true }).click());
      await page.getByLabel("Review note", { exact: true }).fill("Synthetic evidence cannot support a published claim");
      const refused = page.waitForResponse(r => r.url().endsWith(`/api/owner/pilots/${pilot.id}`) && r.request().method() === "POST");
      await page.getByRole("button", { name: "Approve supported wording", exact: true }).click(); assert.equal((await refused).status(), 409);
      await saved(page, `/api/owner/pilots/${pilot.id}`, "POST", () => page.getByRole("button", { name: "Return for revision", exact: true }).click());
      assert.equal((await db.pilotClaim.findUniqueOrThrow({ where: { id: claim.data.id } })).status, "RETURNED");
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.getByRole("button", { name: "Export approved claims", exact: true }).click();
      await expect(page.getByRole("region", { name: "Export of approved claims" })).toBeVisible();
      await shot(page, "pilot-claim-review-1440");
    });
    await check("CSV exports produce real files for schools users audit billing and capacity", async page => {
      for (const view of ["schools", "users", "audit", "billing", "capacity"]) {
        await go(page, view); await page.setViewportSize({ width: 1440, height: 1000 });
        const download = page.waitForEvent("download");
        await page.getByRole("button", { name: "Export", exact: true }).click();
        const file = await download; assert.equal(await file.failure(), null); assert.match(file.suggestedFilename(), /\.csv$/);
        await file.saveAs(`${output}/${view}-export.csv`);
      }
    });
    await check("all 11 views desktop tablet mobile and Arabic Urdu layouts", async page => {
      const views = ["schools", "users", "subscription-requests", "pricing", "payments", "billing", "support", "audit", "sessions", "pilots", "capacity"];
      for (const language of ["en", "ar", "ur"]) {
        await db.user.update({ where: { id: owner.id }, data: { preferredLanguage: language } });
        for (const width of language === "en" ? [1440, 768, 390] : [390]) {
          await page.setViewportSize({ width, height: 1000 });
          for (const view of views) {
            await go(page, view);
            await page.waitForLoadState("networkidle");
            await expect(page.locator('h1')).toBeVisible();
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${language} ${view} overflow ${width}`);
            await shot(page, `${view}-${language}-${width}`);
            if (language === "en" && width === 390) {
              const scroller = page.locator(`[data-owner-view="${view}"] > .custom-scrollbar`).first();
              if (await scroller.count() && await scroller.evaluate(el => el.scrollHeight > el.clientHeight + 10)) {
                await scroller.evaluate(el => el.scrollTo({ top: el.scrollHeight, behavior: "instant" }));
                await shot(page, `${view}-${language}-${width}-bottom`);
              }
            }
            if (view === "users" && width === 768) await expect(page.locator('[data-owner-user-cards]')).toBeVisible();
            console.log(`SNAPSHOT ${view} ${language} ${width}`);
          }
        }
      }
      await db.user.update({ where: { id: owner.id }, data: { preferredLanguage: "en" } });
    });
  } finally {
    await writeFile(`${output}/results${process.env.OWNER_UX_FILTER ? '-focused' : ''}.json`, JSON.stringify(results, null, 2));
    await context.close(); await browser.close(); await db.$disconnect();
  }
  console.log(`${results.filter(r => r.passed).length}/${results.length} UX groups passed`);
  if (results.some(r => !r.passed)) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
