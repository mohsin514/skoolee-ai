import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";
import { createPlanContract } from "../../src/config/commercial-contract";

// SKO-391 browser acceptance against the isolated database and app only.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55470" || url.pathname !== "/sko391") throw Error("Only isolated local DB 55470/sko391 is allowed");
const base = process.env.ONBOARDING_TEST_APP || "http://localhost:3470";
const evidence = process.env.ONBOARDING_EVIDENCE_DIR || "/tmp/sko391-evidence";
const raw = new PrismaClient(), password = "SyntheticSetup391!";
const schools: string[] = [];
const secrets = new Map<string, string>();
let browser: Browser;

type Kind = "STANDALONE" | "GROUP";
async function owner(kind: Kind, plan: "FREE" | "BASIC" | "PRO", language = "en") {
  const schoolId = `setup391-ui-${kind.toLowerCase()}-${randomUUID()}`, userId = randomUUID(), email = `${userId}@example.invalid`;
  schools.push(schoolId);
  await raw.school.create({ data: { id: schoolId, name: kind === "GROUP" ? "Synthetic Horizon Schools" : "Synthetic Crescent School", slug: schoolId, regId: schoolId.slice(0, 40), contactEmail: email, city: "", status: "TRIAL", plan, registrationKind: kind, commercialContract: createPlanContract(plan) } });
  await raw.user.create({ data: { id: userId, email, password: await bcrypt.hash(password, 12), fullName: "Synthetic owner", schoolId, role: kind === "GROUP" ? "SUPER_ADMIN" : "ADMIN", isInstitutionOwner: true, canPurchaseSubscription: true, canManageMemberships: true, onboardingComplete: false, preferredLanguage: language } });
  await raw.localePolicy.create({ data: { schoolId, scopeKey: "school", status: "ACTIVE", effectiveAt: new Date(Date.now() - 60_000), createdBy: userId, settings: { country: "PK", currency: "PKR" } } });
  return { schoolId, email, userId };
}

/** Password + MFA sign-in in a fresh browser context. Enrols MFA on first use, then answers the challenge. */
async function signIn(context: BrowserContext, email: string, pass = password) {
  const login = await context.request.post(base + "/api/auth/login", { data: { email, password: pass } });
  assert.equal(login.status(), 200, await login.text());
  const secret = secrets.get(email);
  if (!secret) {
    const setup = await (await context.request.post(base + "/api/auth/mfa", { data: { action: "setup" } })).json();
    secrets.set(email, setup.secret);
    assert.equal((await context.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(setup.secret) } })).status(), 200);
    assert.equal((await context.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } })).status(), 200);
  } else {
    // A second sign-in inside the same 30 s window must use the next TOTP step.
    const challenge = await context.request.post(base + "/api/auth/mfa", { data: { action: "challenge", code: totp(secret, Math.floor(Date.now() / 30_000) + 1) } });
    assert.equal(challenge.status(), 200, await challenge.text());
  }
}

async function newPage(width: number, email?: string) {
  const context = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 1000 } });
  if (email) await signIn(context, email);
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return { context, page, errors };
}

// Let the 0.6 s panel rise animation settle so evidence shows the final state.
const shot = async (page: Page, name: string) => { await page.locator('[aria-hidden="true"].pointer-events-none.fixed.inset-0').waitFor({ state: "hidden", timeout: 10_000 }); await page.waitForTimeout(800); await page.screenshot({ path: `${evidence}/${name}.png`, fullPage: true }); };
const noOverflow = async (page: Page) => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, "no horizontal overflow");
const button = (page: Page, name: string | RegExp) => page.getByRole("button", { name, exact: typeof name === "string" });
const heading = (page: Page) => page.locator("#step-heading");

async function addCampus(page: Page, name: string, city: string) {
  await page.locator("#field-campusName").fill(name);
  await page.locator("#field-campusCity").fill(city);
  await button(page, "Add campus").click();
  await page.locator("ul[aria-label='Your campuses'] > li", { hasText: name }).first().waitFor();
}

async function seedSetup(schoolId: string, data: { type: Kind; mode: "EXAM_STUDIO" | "FULL_OPERATIONS"; completed: string[]; current: string; campuses?: { key: string; name: string; city: string; regId: string }[]; name: string }) {
  const tag = randomUUID().slice(0, 4).toUpperCase();
  await raw.institutionSetup.create({ data: {
    schoolId, institutionType: data.type, adoptionMode: data.mode, completedSteps: data.completed, currentStep: data.current,
    draft: { school: { name: data.name, city: "Riyadh", email: "", regId: `SKL-${tag}`, primaryCampusRegId: `BR-${tag}`, timezone: "Asia/Riyadh", academicYear: "2026", sessionLabel: "2026-27", weekends: [5, 6] }, campuses: (data.campuses ?? []).map((c) => ({ ...c, address: "", phone: "", email: "", website: "", principalName: "", autoId: true, board: "Cambridge (IGCSE)" })) },
  } });
}

before(async () => {
  await raw.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser?.close();
  await raw.campus.deleteMany({ where: { schoolId: { in: schools } } }).catch(() => undefined);
  await raw.school.deleteMany({ where: { id: { in: schools } } }).catch(() => undefined);
  await raw.$disconnect();
});

test("standalone owner: identity once, package visible, one primary campus, no redirect loop (EN 1440)", async () => {
  const account = await owner("STANDALONE", "FREE");
  const { context, page, errors } = await newPage(1440, account.email);
  await page.goto(base + "/onboarding");
  await heading(page).filter({ hasText: "Let's set up your institution" }).waitFor();
  await shot(page, "01-standalone-structure-en-1440");

  // Validation focuses a linked error summary without clearing input.
  await button(page, "Continue").click();
  const summary = page.getByRole("alert").filter({ hasText: "Choose how you will use Skoolee." });
  await summary.waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-labelledby")), "error-summary-title", "focus moves to the error summary");
  await shot(page, "02-structure-error-summary-en-1440");

  await page.getByLabel("Use Exam Studio with my current systems").check();
  assert.equal(await page.getByLabel("One school").isChecked(), true, "registration choice is kept");
  await button(page, "Continue").click();
  await heading(page).filter({ hasText: "Your school" }).waitFor();
  assert.equal(await page.locator("#field-campusName").count(), 0, "no second campus form for a standalone school");
  await page.getByText("Primary campus created automatically").waitFor();
  await page.locator("#field-name").fill("Synthetic Crescent School");
  await page.locator("#field-city").fill("Lahore");
  await shot(page, "03-standalone-identity-en-1440");
  await button(page, "Continue").click();

  await heading(page).filter({ hasText: "Package" }).waitFor();
  await page.getByRole("link", { name: "Compare packages" }).waitFor();
  await shot(page, "04-standalone-package-en-1440");
  await button(page, /^Continue with/).click();
  await heading(page).filter({ hasText: "Academic defaults" }).waitFor();

  // Refresh mid-journey: the server state resumes at the same step.
  await page.reload();
  await heading(page).filter({ hasText: "Academic defaults" }).waitFor();
  await button(page, "Continue").click();

  await heading(page).filter({ hasText: "Review and activate" }).waitFor();
  const review = await page.locator("main").innerText();
  for (const expected of ["One school", "Exam Studio alongside current systems", "Primary campus — uses the school details", "Fees, payroll, attendance and admissions stay in your current systems", "Add or import your first class roster"]) {
    assert.ok(review.includes(expected), `review shows ${expected}`);
  }
  assert.ok(!review.includes("Configure fees and payroll"), "fees/payroll is not even listed as work for Exam Studio adoption");
  await shot(page, "05-standalone-review-en-1440");
  await button(page, "Activate setup").click();
  await page.waitForURL((u) => !u.pathname.startsWith("/onboarding"), { timeout: 30_000 });

  const campuses = await raw.campus.findMany({ where: { schoolId: account.schoolId } });
  assert.equal(campuses.length, 1);
  assert.equal(campuses[0].name, "Synthetic Crescent School");
  assert.equal(await raw.academicCycle.count({ where: { schoolId: account.schoolId } }), 1);
  const user = await raw.user.findUniqueOrThrow({ where: { id: account.userId } });
  assert.equal(user.campusId, campuses[0].id);
  assert.equal(user.onboardingComplete, true);

  // No onboarding/package redirect loop after completion.
  await page.goto(base + "/onboarding");
  assert.ok(!new URL(page.url()).pathname.startsWith("/onboarding"));
  await page.goto(base + "/onboarding/package");
  assert.ok(!new URL(page.url()).pathname.startsWith("/onboarding"));
  assert.deepEqual(errors, []);
  await context.close();
});

test("group owner: three campus drafts survive a failed checkout and sign-out, resume on a phone, and only eligible campuses activate", async () => {
  const account = await owner("GROUP", "FREE");
  const { context, page } = await newPage(1440, account.email);
  await page.goto(base + "/onboarding");
  await page.getByLabel("Set up school operations").check();
  await button(page, "Continue").click();
  await page.locator("#field-city").fill("Karachi");
  await button(page, "Continue").click();
  await button(page, /^Continue with/).click();
  await heading(page).filter({ hasText: "Campuses" }).waitFor();
  await addCampus(page, "North campus", "Karachi");
  await addCampus(page, "South campus", "Karachi");
  await addCampus(page, "East campus", "Hyderabad");
  const notice = page.getByRole("status").filter({ hasText: "campus drafts are beyond this package" });
  await notice.waitFor();
  const cards = page.locator("ul[aria-label='Your campuses'] > li");
  assert.equal(await cards.filter({ hasText: "East campus" }).getByText("Draft", { exact: true }).count(), 1);
  assert.equal(await cards.filter({ hasText: "North campus" }).getByText("Activate", { exact: true }).count(), 1);
  await shot(page, "06-group-campus-drafts-en-1440");

  // Change package: the isolated app has no payment provider, so paid checkout is shown as unavailable.
  await page.getByRole("link", { name: "Compare packages", exact: true }).click();
  await page.waitForURL(/\/onboarding\/package\?returnStep=campuses&campuses=3/);
  await page.getByText("Paid checkout is not currently available.").first().waitFor({ timeout: 20_000 });
  await shot(page, "07a-package-compare-checkout-unavailable-en-1440");
  // A provider-cancelled checkout returns to the exact saved step with drafts intact.
  const intent = await raw.onboardingCheckoutIntent.create({ data: { schoolId: account.schoolId, userId: account.userId, idempotencyKey: randomUUID(), plan: "PRO", catalogueVersion: "test", contractSnapshot: {}, expectedCampuses: 3, expectedEnrollment: 300, returnStep: "campuses", provider: "STRIPE", status: "CANCELLED" } });
  await page.goto(base + `/onboarding/package/status?intentId=${intent.id}`);
  await page.getByText("Checkout cancelled").first().waitFor();
  await shot(page, "07b-checkout-cancelled-en-1440");
  await page.getByRole("link", { name: "Resume saved setup" }).click();
  await page.waitForURL(/\/onboarding\?step=campuses/);
  await heading(page).filter({ hasText: "Campuses" }).waitFor();
  await page.locator("ul[aria-label='Your campuses'] > li", { hasText: "East campus" }).first().waitFor();
  assert.equal(await page.locator("ul[aria-label='Your campuses'] > li").count(), 3, "all drafts preserved after the cancelled checkout");

  await button(page, "Save and exit").click();
  await page.waitForURL(/\/login/);
  await context.close();

  // Another browser, phone size, fresh sign-in.
  const phone = await newPage(390);
  await signIn(phone.context, account.email);
  await phone.page.goto(base + "/onboarding");
  await heading(phone.page).filter({ hasText: "Campuses" }).waitFor();
  assert.equal(await phone.page.locator("ul[aria-label='Your campuses'] > li").count(), 3);
  await noOverflow(phone.page);
  await shot(phone.page, "08-group-resumed-other-browser-en-390");
  await button(phone.page, "Continue").click();
  await heading(phone.page).filter({ hasText: "Academic defaults" }).waitFor();
  await noOverflow(phone.page);
  await button(phone.page, "Continue").click();
  await heading(phone.page).filter({ hasText: "Review and activate" }).waitFor();
  await phone.page.getByText("Activated now: 1. Kept as drafts until you change package: 2.").waitFor();
  await noOverflow(phone.page);
  await shot(phone.page, "09-group-review-eligible-en-390");
  await button(phone.page, /Activate eligible setup/).click();
  await phone.page.waitForURL((u) => !u.pathname.startsWith("/onboarding"), { timeout: 30_000 });

  const campuses = await raw.campus.findMany({ where: { schoolId: account.schoolId } });
  assert.deepEqual(campuses.map((c) => c.name), ["North campus"]);
  const setup = await raw.institutionSetup.findUniqueOrThrow({ where: { schoolId: account.schoolId } });
  assert.equal((setup.draft as { campuses: unknown[] }).campuses.length, 3, "over-limit drafts kept after activation");
  assert.equal((await raw.school.findUniqueOrThrow({ where: { id: account.schoolId } })).registrationKind, "GROUP");
  await phone.context.close();
});

test("a failed completion shows the failing step, keeps drafts, and recovers without duplicates", async () => {
  const other = await owner("STANDALONE", "FREE");
  const taken = `BR-T${randomUUID().slice(0, 5)}`.toUpperCase();
  await raw.campus.create({ data: { schoolId: other.schoolId, name: "Another institution campus", city: "Multan", regId: taken } });
  const account = await owner("GROUP", "PRO");
  await seedSetup(account.schoolId, { type: "GROUP", mode: "FULL_OPERATIONS", completed: ["structure", "identity", "package", "campuses", "academic"], current: "review", name: "Synthetic Horizon Schools",
    campuses: [{ key: "a", name: "Alpha campus", city: "Lahore", regId: `BR-A${randomUUID().slice(0, 5)}`.toUpperCase() }, { key: "b", name: "Beta campus", city: "Lahore", regId: taken }] });
  const { context, page, errors } = await newPage(1440, account.email);
  await page.goto(base + "/onboarding");
  await heading(page).filter({ hasText: "Review and activate" }).waitFor();
  await button(page, "Activate setup").click();
  const failure = page.getByTestId("setup-failure");
  await failure.waitFor();
  assert.match(await failure.innerText(), /Beta campus is already registered to another institution/);
  assert.match(await failure.innerText(), /Nothing was activated/);
  assert.equal(await raw.campus.count({ where: { schoolId: account.schoolId } }), 0, "no partial campus");
  await shot(page, "10-group-failed-completion-en-1440");

  await failure.getByRole("button", { name: "Go to Campuses" }).click();
  await heading(page).filter({ hasText: "Campuses" }).waitFor();
  await page.getByRole("button", { name: "Edit campus: Beta campus" }).click();
  await page.getByRole("group", { name: "Campus ID" }).getByRole("button", { name: "Manual" }).click();
  await page.locator("#field-campusRegId").fill(`BR-B${randomUUID().slice(0, 5)}`.toUpperCase());
  await button(page, "Update campus").click();
  await page.getByText("Beta campus saved.").waitFor();
  await button(page, "Continue").click();
  await button(page, "Continue").click();
  await heading(page).filter({ hasText: "Review and activate" }).waitFor();
  await button(page, "Activate setup").click();
  await page.waitForURL((u) => !u.pathname.startsWith("/onboarding"), { timeout: 30_000 });
  assert.equal(await raw.campus.count({ where: { schoolId: account.schoolId } }), 2);
  assert.equal(await raw.academicCycle.count({ where: { schoolId: account.schoolId } }), 2);
  assert.deepEqual(errors, []);
  await context.close();
});

test("handover: the delegate resumes the exact saved step without purchase prompts, and revocation signs them out", async () => {
  const account = await owner("GROUP", "FREE");
  await seedSetup(account.schoolId, { type: "GROUP", mode: "EXAM_STUDIO", completed: ["structure", "identity"], current: "package", name: "Synthetic Horizon Schools" });
  const ownerPage = await newPage(1440, account.email);
  await ownerPage.page.goto(base + "/onboarding");
  await heading(ownerPage.page).filter({ hasText: "Package" }).waitFor();
  await ownerPage.page.getByTestId("handover-panel").getByRole("button", { name: "Hand over setup" }).click();
  const delegateEmail = `delegate-${randomUUID()}@example.invalid`;
  await ownerPage.page.locator("#field-delegateName").fill("Synthetic Delegate");
  await ownerPage.page.locator("#field-delegateEmail").fill(delegateEmail);
  await button(ownerPage.page, "Create delegate access").click();
  const temporary = (await ownerPage.page.getByTestId("temporary-password").innerText()).trim();
  assert.ok(temporary.length >= 12);
  await ownerPage.page.getByTestId("temporary-password").evaluate((el) => { el.textContent = "•••••••• (redacted for evidence)"; });
  await shot(ownerPage.page, "11-handover-issued-en-1440");
  await button(ownerPage.page, "Done").click();

  const delegate = await newPage(390);
  const login = await delegate.context.request.post(base + "/api/auth/login", { data: { email: delegateEmail, password: temporary } });
  assert.equal(login.status(), 200, await login.text());
  const setup = await (await delegate.context.request.post(base + "/api/auth/mfa", { data: { action: "setup" } })).json();
  await delegate.context.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(setup.secret) } });
  assert.equal((await delegate.context.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } })).status(), 200);
  const changed = await delegate.context.request.put(base + "/api/auth/first-password", { data: { newPassword: "DelegatePass391" } });
  assert.equal(changed.status(), 200, await changed.text());
  await delegate.page.goto(base + "/onboarding");
  await heading(delegate.page).filter({ hasText: "Package" }).waitFor();
  await delegate.page.getByText("You are completing this setup for the institution owner.").waitFor();
  assert.equal(await delegate.page.getByRole("link", { name: "Compare packages" }).count(), 0, "no purchase prompt without delegation");
  assert.equal((await delegate.context.request.get(base + "/api/onboarding/package")).status(), 403);
  assert.equal(await delegate.page.getByTestId("handover-panel").count(), 0, "a delegate cannot re-delegate");
  await noOverflow(delegate.page);
  await shot(delegate.page, "12-delegate-resumes-en-390");

  await ownerPage.page.reload();
  await ownerPage.page.getByTestId("handover-panel").getByRole("button", { name: "Revoke access" }).click();
  await ownerPage.page.getByRole("dialog").getByRole("button", { name: "Revoke access" }).click();
  await ownerPage.page.getByText("Delegate access revoked.").waitFor();
  await delegate.page.goto(base + "/onboarding");
  await delegate.page.waitForURL(/\/login/, { timeout: 20_000 });
  await ownerPage.context.close();
  await delegate.context.close();
});

test("non-owner staff land on a no-access explanation instead of a spinner or purchase prompt", async () => {
  const account = await owner("GROUP", "FREE");
  const staffEmail = `staff-${randomUUID()}@example.invalid`;
  await raw.user.create({ data: { email: staffEmail, password: await bcrypt.hash(password, 12), fullName: "Synthetic staff", schoolId: account.schoolId, role: "SUPER_ADMIN", isInstitutionOwner: false, onboardingComplete: false } });
  const { context, page } = await newPage(390, staffEmail);
  await page.goto(base + "/onboarding");
  await page.getByText("Setup is managed by your institution owner").waitFor();
  assert.equal(await page.getByRole("link", { name: "Compare packages" }).count(), 0);
  assert.equal((await context.request.get(base + "/api/onboarding/package")).status(), 403);
  await shot(page, "13-non-owner-no-access-en-390");
  await context.close();
});

for (const [language, kind, title, reviewTitle] of [["ar", "GROUP", "لنُعدّ مؤسستك", "المراجعة والتفعيل"], ["ur", "STANDALONE", "آئیے آپ کا ادارہ ترتیب دیں", "جائزہ لیں اور فعال کریں"]] as const) {
  test(`${language.toUpperCase()} setup renders right-to-left at 390 and 1440`, async () => {
    const account = await owner(kind, "FREE", language);
    await seedSetup(account.schoolId, { type: kind, mode: "EXAM_STUDIO", completed: ["structure", "identity", "package", ...(kind === "GROUP" ? ["campuses"] : []), "academic"], current: "review", name: language === "ar" ? "مدارس الأفق التجريبية" : "تجرباتی کریسنٹ اسکول",
      campuses: kind === "GROUP" ? [{ key: "n", name: "الفرع الشمالي", city: "الرياض", regId: `BR-N${randomUUID().slice(0, 4)}`.toUpperCase() }, { key: "s", name: "الفرع الجنوبي", city: "جدة", regId: `BR-S${randomUUID().slice(0, 4)}`.toUpperCase() }] : [] });
    for (const width of [390, 1440]) {
      const { context, page, errors } = await newPage(width);
      if (secrets.has(account.email)) await signIn(context, account.email); else await signIn(context, account.email);
      await page.goto(base + "/onboarding?step=structure");
      await heading(page).filter({ hasText: title }).waitFor();
      assert.equal(await page.locator("[dir=rtl]").first().getAttribute("lang"), language);
      await noOverflow(page);
      await shot(page, `14-${language}-structure-${width}`);
      await page.goto(base + "/onboarding");
      await heading(page).filter({ hasText: reviewTitle }).waitFor();
      await noOverflow(page);
      await shot(page, `15-${language}-review-${width}`);
      assert.deepEqual(errors, []);
      await context.close();
      if (width === 390) await new Promise((r) => setTimeout(r, 31_000)); // next TOTP step for the second sign-in
    }
  });
}

for (const kind of ["STANDALONE", "GROUP"] as const) {
  test(`${kind}: deferred MFA survives activation and rotation without granting verified-MFA access`, async () => {
    const account = await owner(kind, "FREE");
    await seedSetup(account.schoolId, {
      type: kind, mode: "EXAM_STUDIO", current: "review", name: "Synthetic deferred owner",
      completed: kind === "GROUP" ? ["structure", "identity", "package", "campuses", "academic"] : ["structure", "identity", "package", "academic"],
      campuses: kind === "GROUP" ? [{ key: randomUUID(), name: "Synthetic primary campus", city: "Riyadh", regId: randomUUID() }] : [],
    });
    const { context, page } = await newPage(1440);
    assert.equal((await context.request.post(base + "/api/auth/login", { data: { email: account.email, password } })).status(), 200);
    assert.equal((await context.request.post(base + "/api/auth/mfa", { data: { action: "defer" } })).status(), 200);
    const oldCookies = await context.cookies();
    assert.equal((await context.request.get(base + "/api/auth/session")).status(), 200);
    await page.goto(base + "/onboarding");
    await button(page, "Activate setup").click();
    await page.waitForURL(/\/setup\/readiness/, { timeout: 30_000 });
    await page.waitForLoadState("networkidle");
    assert.equal(new URL(page.url()).pathname, "/setup/readiness");
    assert.equal((await context.request.get(base + "/api/auth/session")).status(), 200, "fresh session remains usable");
    assert.equal((await raw.user.findUniqueOrThrow({ where: { id: account.userId } })).onboardingComplete, true);
    if (kind === "GROUP") assert.equal((await context.request.patch(base + "/api/super/support-grants", { data: {} })).status(), 403, "deferred does not authorize privileged support access");
    const oldContext = await browser.newContext();
    await oldContext.addCookies(oldCookies);
    assert.equal((await oldContext.request.get(base + "/api/auth/session")).status(), 401, "rotation revokes the previous bearer credential");
    await oldContext.close();
    await shot(page, `fixed-deferred-mfa-${kind.toLowerCase()}`);
    // Once a factor is enrolled, a deferred session must immediately stop working.
    await raw.user.update({ where: { id: account.userId }, data: { mfaEnabled: true } });
    assert.equal((await context.request.get(base + "/api/auth/session")).status(), 401, "enrolled MFA cannot be bypassed by a deferred session");
    await context.close();
  });
}

test("campus deletion failure stays open, reports failure, and retries successfully", async () => {
  const account = await owner("GROUP", "FREE");
  await seedSetup(account.schoolId, { type: "GROUP", mode: "EXAM_STUDIO", current: "campuses", completed: ["structure", "identity", "package"], name: "Synthetic retry school", campuses: [{ key: randomUUID(), name: "Synthetic retry campus", city: "Riyadh", regId: randomUUID() }] });
  const { context, page } = await newPage(390, account.email);
  await page.goto(base + "/onboarding");
  await button(page, "Delete campus: Synthetic retry campus").click();
  const dialog = page.getByRole("dialog");
  await page.route("**/onboarding", async (route) => route.request().method() === "POST" ? route.abort("failed") : route.continue());
  await dialog.getByRole("button", { name: "Delete campus", exact: true }).click();
  await dialog.getByRole("alert").filter({ hasText: "The campus could not be deleted" }).waitFor();
  assert.equal(await dialog.isVisible(), true);
  assert.equal(await page.locator(".sk-save-state").getAttribute("data-state"), "failed");
  assert.equal(await page.locator("ul[aria-label='Your campuses'] > li").count(), 1);
  await noOverflow(page);
  await shot(page, "fixed-campus-delete-error-390");
  await page.unroute("**/onboarding");
  await dialog.getByRole("button", { name: "Delete campus", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(await page.locator("ul[aria-label='Your campuses'] > li").count(), 0);
  const saved = await raw.institutionSetup.findUniqueOrThrow({ where: { schoolId: account.schoolId } });
  assert.deepEqual((saved.draft as { campuses: unknown[] }).campuses, []);
  await context.close();
});

test("invalid website is rejected visibly and correction allows the owner to continue", async () => {
  const account = await owner("GROUP", "FREE");
  await seedSetup(account.schoolId, { type: "GROUP", mode: "EXAM_STUDIO", current: "identity", completed: ["structure"], name: "Synthetic website school" });
  const { context, page } = await newPage(1440, account.email);
  await page.goto(base + "/onboarding");
  await page.locator("#field-website").fill("not a valid website");
  await button(page, "Continue").click();
  await page.locator("#field-website-error").waitFor();
  assert.equal(await page.locator("#field-website").getAttribute("aria-invalid"), "true");
  await shot(page, "fixed-website-validation-1440");
  await page.locator("#field-website").fill("www.school.edu.pk");
  await button(page, "Continue").click();
  await page.getByRole("link", { name: "Compare packages" }).waitFor();
  const saved = await raw.institutionSetup.findUniqueOrThrow({ where: { schoolId: account.schoolId } });
  assert.equal((saved.draft as { school: { website: string } }).school.website, "www.school.edu.pk");
  await context.close();
});
