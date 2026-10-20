import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-387 browser acceptance against the isolated School AI database and app.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.ONBOARDING_TEST_APP || "http://localhost:3107";
const evidence = process.env.ONBOARDING_EVIDENCE_DIR || "/tmp/sko387-evidence";
const raw = new PrismaClient(), password = "SyntheticOnboarding387!";
const schools = new Map<string, { schoolId: string; email: string; userId: string }>();
let browser: Browser;

async function owner(country: "PK" | "SA", language = "en") {
  const schoolId = `onboarding387-${country.toLowerCase()}-${randomUUID()}`, campusId = randomUUID(), userId = randomUUID(), email = `${userId}@example.invalid`;
  await raw.school.create({ data: { id: schoolId, name: `Synthetic ${country} group`, slug: schoolId, regId: schoolId, contactEmail: email, city: "Synthetic", status: "ACTIVE", plan: "BASIC" } });
  await raw.campus.create({ data: { id: campusId, schoolId, name: "Synthetic campus", city: "Synthetic", regId: campusId } });
  await raw.user.create({ data: { id: userId, email, password: await bcrypt.hash(password, 12), fullName: "Synthetic owner", schoolId, campusId, role: "SUPER_ADMIN", isInstitutionOwner: true, onboardingComplete: false, preferredLanguage: language } });
  await raw.localePolicy.create({ data: { schoolId, scopeKey: "school", status: "ACTIVE", effectiveAt: new Date(Date.now() - 60_000), createdBy: userId, settings: { country, currency: country === "PK" ? "PKR" : "SAR" } } });
  return { schoolId, email, userId };
}

type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;
const sessions = new Map<string, StorageState>();
// Sign in and enroll MFA once per owner; later contexts reuse that session instead of facing an MFA challenge.
async function signedIn(account: { email: string }, viewport = { width: 1440, height: 1000 }): Promise<BrowserContext> {
  const saved = sessions.get(account.email);
  if (saved) return browser.newContext({ viewport, storageState: saved });
  const context = await browser.newContext({ viewport });
  assert.equal((await context.request.post(base + "/api/auth/login", { data: { email: account.email, password } })).status(), 200);
  const { secret } = await (await context.request.post(base + "/api/auth/mfa", { data: { action: "setup" } })).json();
  await context.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(secret) } });
  assert.equal((await context.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } })).status(), 200);
  sessions.set(account.email, await context.storageState());
  return context;
}

before(async () => {
  await raw.authAttempt.deleteMany({});
  schools.set("PK", await owner("PK"));
  schools.set("SA", await owner("SA"));
  schools.set("SA-ar", await owner("SA", "ar"));
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser?.close();
  for (const { schoolId } of schools.values()) await raw.school.delete({ where: { id: schoolId } }).catch(() => undefined);
  await raw.$disconnect();
});

test("a Saudi school sees a sales-assisted quote for paid packages and cannot start automated checkout", async () => {
  for (const width of [1440, 390]) {
    const context = await signedIn(schools.get("SA")!, { width, height: 1000 });
    const catalogueResponse = await context.request.get(base + "/api/onboarding/package"), catalogue = await catalogueResponse.json();
    assert.equal(catalogue.country, "SA", `${catalogueResponse.status()} ${JSON.stringify(catalogue).slice(0, 200)}`);
    assert.equal(catalogue.salesAssisted, true);
    assert.deepEqual(catalogue.paymentMethods, []);
    const page = await context.newPage();
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    // The old page link opens the chooser modal inside the wizard.
    await page.goto(base + "/onboarding/package?returnStep=campuses&campuses=2");
    const dialog = page.getByRole("dialog");
    await dialog.getByText("Online payment isn't available for your school yet", { exact: false }).first().waitFor();
    assert.equal(await dialog.getByRole("button", { name: /quote/i }).count(), 0, "no quote buttons: every package is chosen the same way");
    assert.equal(await dialog.getByRole("button", { name: "Checkout unavailable" }).count(), 0);
    if (width > 640) {
      // The synthetic school is on BASIC ("Pro"): its own card keeps it, the others are chosen.
      assert.equal(await dialog.locator('[data-plan="BASIC"]').getByRole("button", { name: "Keep Pro" }).count(), 1);
      for (const [plan, name] of [["PRO", "Enterprise"], ["ENTERPRISE", "Custom"]]) {
        assert.equal(await dialog.locator(`[data-plan="${plan}"]`).getByRole("button", { name: new RegExp(`^Choose ${name}`) }).count(), 1, `${plan} is chosen like any package`);
      }
    } else {
      assert.equal(await dialog.locator("[data-plan] [aria-expanded]").count(), 4, "phones list the packages as accordion rows");
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `no horizontal overflow at ${width}`);
    await page.screenshot({ path: `${evidence}/package-sa-en-${width}.png`, fullPage: true });
    const direct = await context.request.post(base + "/api/onboarding/package", { data: { plan: "BASIC", billingPeriod: "monthly", expectedCampuses: 2, expectedEnrollment: 120, returnStep: "campuses", idempotencyKey: randomUUID() } });
    // No automated checkout in this region: the package is reserved for the team to confirm (nothing charged).
    assert.equal(direct.status(), 200, await direct.text());
    const reserved = await direct.json();
    assert.equal(reserved.reserved, true);
    assert.equal(reserved.status, "PENDING_SETTLEMENT");
    const saved = await raw.onboardingCheckoutIntent.findUnique({ where: { id: reserved.intentId } });
    assert.equal(saved?.provider, "SALES_ASSISTED");
    assert.deepEqual(errors, []);
    await context.close();
  }
});

test("Arabic package page explains the regional quote right-to-left", async () => {
  const context = await signedIn(schools.get("SA-ar")!, { width: 390, height: 900 });
  const page = await context.newPage();
  await page.goto(base + "/onboarding/package?returnStep=campuses");
  await page.getByRole("dialog").getByText("الدفع الإلكتروني غير متاح لمدرستك بعد", { exact: false }).first().waitFor();
  assert.equal(await page.locator("main").getAttribute("dir"), "rtl");
  assert.equal(await page.getByRole("dialog").evaluate((el) => getComputedStyle(el).direction), "rtl", "the portaled dialog keeps the page direction");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.screenshot({ path: `${evidence}/package-sa-ar-390.png`, fullPage: true });
  await context.close();
});

test("a Pakistani school is not routed to the regional quote", async () => {
  const context = await signedIn(schools.get("PK")!);
  const catalogue = await (await context.request.get(base + "/api/onboarding/package")).json();
  assert.equal(catalogue.country, "PK");
  assert.equal(catalogue.salesAssisted, false);
  const page = await context.newPage();
  await page.goto(base + "/onboarding/package?returnStep=campuses");
  const dialog = page.getByRole("dialog");
  await dialog.locator('[data-plan="ENTERPRISE"]').getByRole("button", { name: /^Choose Custom/ }).waitFor();
  assert.equal(await dialog.getByRole("button", { name: /quote/i }).count(), 0, "no quote buttons");
  await page.screenshot({ path: `${evidence}/package-pk-en-1440.png`, fullPage: true });
  await context.close();
});

test("a campus beyond the package is kept as a draft with a route to compare packages", async () => {
  // SKO-477: walk the current wizard (structure → identity → package → campuses) instead of jumping to a
  // step its guards no longer open, then prove the over-limit draft, the comparison route and persistence.
  const account = schools.get("PK")!;
  const context = await signedIn(account);
  const page = await context.newPage();
  const shot = (name: string) => page.screenshot({ path: `${evidence}/onboarding-${name}-1440.png`, fullPage: true });
  await page.goto(base + "/onboarding");
  await page.getByText("Set up school operations", { exact: true }).click({ timeout: 60_000 });
  await page.getByText("A school group", { exact: true }).click();
  await shot("1-structure");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.locator("#field-name").fill("Synthetic Horizon Schools");
  await page.locator("#field-city").fill("Lahore");
  const groupId = page.locator("#field-regId");
  if (await groupId.count() && !(await groupId.inputValue())) await page.getByRole("button", { name: "Auto", exact: true }).first().click();
  await shot("2-identity");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const keep = page.getByRole("button", { name: /^Continue with / });
  await keep.waitFor({ timeout: 30_000 });
  await shot("3-package");
  await keep.click();
  for (const name of ["North campus", "South campus"]) {
    await page.locator("#field-campusName").fill(name);
    await page.locator("#field-campusCity").fill("Lahore");
    const campusId = page.locator("#field-campusRegId");
    if (await campusId.count() && !(await campusId.inputValue())) await page.getByRole("button", { name: "Auto", exact: true }).last().click();
    await page.getByRole("button", { name: "Add campus", exact: true }).click();
    await page.getByText(name, { exact: true }).first().waitFor({ timeout: 30_000 });
  }
  const notice = page.getByRole("status").filter({ hasText: "are beyond this package" });
  await notice.waitFor({ timeout: 30_000 });
  assert.match(await notice.innerText(), /^1 campus drafts? (is|are) beyond this package\. They stay saved as drafts/u);
  const compare = notice.getByRole("button", { name: "Compare packages" });
  await shot("4-campus-draft");
  await compare.click();
  const dialog = page.getByRole("dialog");
  await dialog.locator('[data-plan="FREE"]').waitFor({ timeout: 30_000 });
  await shot("5-compare-packages");
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached", timeout: 30_000 });
  for (const name of ["North campus", "South campus"]) await page.getByText(name, { exact: true }).first().waitFor({ timeout: 30_000 });
  await page.reload();
  for (const name of ["North campus", "South campus"]) await page.getByText(name, { exact: true }).first().waitFor({ timeout: 30_000 });
  await page.getByRole("status").filter({ hasText: "are beyond this package" }).waitFor();
  await shot("6-after-back-and-refresh");
  const owner = await raw.user.findUniqueOrThrow({ where: { id: account.userId }, select: { onboardingComplete: true } });
  assert.equal(owner.onboardingComplete, false, "nothing was activated");
  assert.equal(await raw.campus.count({ where: { schoolId: account.schoolId } }), 1, "the drafts did not create live campuses");
  await context.close();
});
