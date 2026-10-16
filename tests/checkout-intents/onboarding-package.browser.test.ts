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
    await page.goto(base + "/onboarding/package?returnStep=campuses&campuses=2");
    await page.getByText("Online payment is not available for your region yet", { exact: false }).first().waitFor();
    assert.equal(await page.getByRole("button", { name: "Request a custom quote" }).count(), 3, "BASIC, PRO and ENTERPRISE offer a quote");
    assert.equal(await page.getByRole("button", { name: "Checkout unavailable" }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Continue with free package" }).count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `no horizontal overflow at ${width}`);
    await page.screenshot({ path: `${evidence}/package-sa-en-${width}.png`, fullPage: true });
    const direct = await context.request.post(base + "/api/onboarding/package", { data: { plan: "BASIC", billingPeriod: "monthly", expectedCampuses: 2, expectedEnrollment: 120, returnStep: "campuses", idempotencyKey: randomUUID() } });
    assert.equal(direct.status(), 409, await direct.text());
    assert.match((await direct.json()).error, /not yet available for your school's region/);
    assert.deepEqual(errors, []);
    await context.close();
  }
});

test("Arabic package page explains the regional quote right-to-left", async () => {
  const context = await signedIn(schools.get("SA-ar")!, { width: 390, height: 900 });
  const page = await context.newPage();
  await page.goto(base + "/onboarding/package?returnStep=campuses");
  await page.getByText("الدفع الإلكتروني غير متاح لمنطقتك بعد", { exact: false }).first().waitFor();
  assert.equal(await page.locator("main").getAttribute("dir"), "rtl");
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
  await page.getByRole("button", { name: "Continue with free package" }).waitFor();
  assert.equal(await page.getByText("Online payment is not available for your region yet", { exact: false }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Request a custom quote" }).count(), 1, "only the custom ENTERPRISE quote");
  await page.screenshot({ path: `${evidence}/package-pk-en-1440.png`, fullPage: true });
  await context.close();
});

test("a campus beyond the package is kept as a draft with a route to compare packages", async () => {
  const context = await signedIn(schools.get("PK")!);
  const page = await context.newPage();
  await page.goto(base + "/onboarding?step=campuses");
  for (const name of ["North campus", "South campus"]) {
    await page.getByPlaceholder("e.g. Main Campus, West Branch").fill(name);
    await page.getByPlaceholder("City", { exact: true }).fill("Lahore");
    const campusId = page.getByPlaceholder("BR-XXXX");
    if (!(await campusId.inputValue())) await campusId.fill(`BR-${name.slice(0, 1)}${Date.now() % 10000}`);
    await page.getByRole("button", { name: "Add Campus", exact: true }).click();
    await page.getByText(name, { exact: true }).first().waitFor();
  }
  const notice = page.getByRole("status").filter({ hasText: "Your current package covers 1 campus" });
  await notice.waitFor();
  assert.match(await notice.innerText(), /kept as draft/);
  assert.equal(await notice.getByRole("link", { name: "Compare packages" }).getAttribute("href"), "/onboarding/package?returnStep=campuses&campuses=2");
  await page.screenshot({ path: `${evidence}/onboarding-campus-draft-1440.png`, fullPage: true });
  await context.close();
});
