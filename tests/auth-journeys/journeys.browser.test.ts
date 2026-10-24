import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { createVerificationToken } from "../../src/lib/auth/verification";
import { JWT_SECRET } from "../../src/lib/auth/secret";

// SKO-457: verification, resend, sign-in and recovery through the real routes and pages.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.AUTH_TEST_APP || "http://localhost:3107";
const evidence = process.env.AUTH_EVIDENCE_DIR || "/tmp/sko457-evidence";
const db = new PrismaClient(), password = "SyntheticJourney457!";
const schoolId = `auth457-${randomUUID()}`;
let browser: Browser, pendingId = "", pendingEmail = "", activeEmail = "", deactivatedId = "";

async function owner(state: "pending" | "active" | "deactivated") {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: {
    id, email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${state} owner`, role: "ADMIN", schoolId, isInstitutionOwner: true,
    isActive: state === "active", emailVerifiedAt: state === "pending" ? null : new Date(), onboardingComplete: true, preferredLanguage: "en",
  } });
  return { id, email };
}
const login = (email: string, pass = password) => fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 200) + 1}` }, body: JSON.stringify({ email, password: pass }) });
const verify = (token: string) => fetch(`${base}/api/auth/verify?token=${encodeURIComponent(token)}`, { redirect: "manual" });
const resend = (email: string, ip = "203.0.113.7") => fetch(`${base}/api/auth/verify/resend`, { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify({ email }) });
const settled = (page: Page) => page.evaluate(() => Promise.all(document.getAnimations().filter(a => Number.isFinite(Number(a.effect?.getComputedTiming().endTime))).map(a => a.finished.catch(() => undefined))));
const shot = async (page: Page, name: string) => { await settled(page); await page.screenshot({ path: `${evidence}/${name}.png` }); };

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Cedar Academy", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "TRIAL", plan: "FREE" } });
  ({ id: pendingId, email: pendingEmail } = await owner("pending"));
  ({ email: activeEmail } = await owner("active"));
  ({ id: deactivatedId } = await owner("deactivated"));
  await db.user.update({ where: { id: deactivatedId }, data: { isActive: false } });
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await db.user.deleteMany({ where: { schoolId } }); await db.school.delete({ where: { id: schoolId } }).catch(() => undefined); await db.$disconnect(); });

test("the legacy unverified registration endpoint is gone", async () => {
  const res = await fetch(`${base}/api/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `${randomUUID()}@example.invalid`, password }) });
  assert.ok([401, 404, 405].includes(res.status), `got ${res.status}`);
  assert.equal(await db.user.count({ where: { email: { endsWith: "@example.invalid" }, schoolId: "" } }), 0);
});

test("sign-in answers unknown and wrong-password alike, in comparable time; only the password holder learns 'verify first'", async () => {
  const unknown = await login(`${randomUUID()}@example.invalid`), wrong = await login(pendingEmail, "Wrong-password-457");
  assert.deepEqual([unknown.status, await unknown.json()], [401, { error: "Invalid email or password" }]);
  assert.deepEqual([wrong.status, await wrong.json()], [401, { error: "Invalid email or password" }]);
  const deactivated = await db.user.findUniqueOrThrow({ where: { id: deactivatedId } });
  assert.equal((await login(deactivated.email)).status, 401, "a deactivated account stays generic");
  const pending = await login(pendingEmail);
  assert.equal(pending.status, 403);
  assert.equal((await pending.json()).code, "EMAIL_NOT_VERIFIED");
  const time = async (email: string, pass: string) => { const start = performance.now(); await login(email, pass); return performance.now() - start; };
  const median = (values: number[]) => values.sort((a, b) => a - b)[1];
  const missing = median([await time(`${randomUUID()}@example.invalid`, "x"), await time(`${randomUUID()}@example.invalid`, "x"), await time(`${randomUUID()}@example.invalid`, "x")]);
  const present = median([await time(activeEmail, "Wrong-1"), await time(activeEmail, "Wrong-2"), await time(activeEmail, "Wrong-3")]);
  assert.ok(missing > present * 0.6, `unknown ${missing.toFixed(0)}ms vs wrong password ${present.toFixed(0)}ms`);
});

test("resend says the same for every address, refuses malformed input and is throttled per address", async () => {
  const bodies = [];
  for (const email of [`${randomUUID()}@example.invalid`, pendingEmail, activeEmail]) {
    const res = await resend(email);
    assert.equal(res.status, 200);
    bodies.push(await res.json());
  }
  assert.equal(new Set(bodies.map(body => JSON.stringify(body))).size, 1, "unknown, pending and active read identically");
  assert.equal((await resend("not-an-email")).status, 400);
  for (let i = 0; i < 4; i++) assert.equal((await resend(pendingEmail, `203.0.113.${20 + i}`)).status, 200, "throttled requests read the same too");
});

test("a verification link activates a pending owner once and never revives a deactivated account", async () => {
  const first = await verify(await createVerificationToken(pendingId));
  assert.equal(new URL(first.headers.get("location")!).pathname, "/verify-success");
  const user = await db.user.findUniqueOrThrow({ where: { id: pendingId } });
  assert.equal(user.isActive, true);
  assert.ok(user.emailVerifiedAt);
  const again = new URL((await verify(await createVerificationToken(pendingId))).headers.get("location")!);
  assert.deepEqual([again.pathname, again.searchParams.get("verified")], ["/login", "true"], "a second click is harmless");
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: pendingId } })).emailVerifiedAt?.getTime(), user.emailVerifiedAt!.getTime());
  const revived = new URL((await verify(await createVerificationToken(deactivatedId))).headers.get("location")!);
  assert.equal(revived.pathname, "/login");
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: deactivatedId } })).isActive, false, "an old link does not undo a deactivation");
  const expired = await new SignJWT({ userId: pendingId, purpose: "email-verification" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt(Math.floor(Date.now() / 1000) - 90_000).setExpirationTime(Math.floor(Date.now() / 1000) - 3_600).sign(JWT_SECRET);
  assert.equal(new URL((await verify(expired)).headers.get("location")!).searchParams.get("error"), "This verification link is invalid or has expired");
});

test("an expired verification link on the sign-in page offers a new link (EN 1440)", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/login?error=${encodeURIComponent("This verification link is invalid or has expired")}`);
  await page.getByRole("button", { name: "Send a new verification link" }).click();
  await page.getByText("Enter your email above, then send a new link.").waitFor();
  await page.getByLabel(/email/i).first().fill(`${randomUUID()}@example.invalid`);
  await page.getByRole("button", { name: "Send a new verification link" }).click();
  await page.locator("#login-resend-status").filter({ hasText: "waiting for verification" }).waitFor();
  assert.equal(await page.locator("#login-error").count(), 0, "the error gives way to a neutral notice");
  await shot(page, "login-expired-link-resend-en-1440");
  assert.deepEqual(errors, []); await ctx.close();
});

test("a still-pending owner signing in reads 'verify first' with a resend action in Arabic at 390px", async () => {
  const { email } = await owner("pending");
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ar" }), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await ctx.addCookies([{ name: "skoolee-lang", value: "ar", url: base }]);
  await page.goto(`${base}/login`);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('form button[type="submit"]').click();
  await page.locator("#login-error").waitFor();
  const resendButton = page.locator("#login-error button");
  await resendButton.waitFor();
  const label = await resendButton.textContent();
  await resendButton.click();
  await page.locator("#login-resend-status").waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await shot(page, "login-pending-owner-resend-ar-390");
  assert.ok(label && label.trim().length > 0);
  assert.deepEqual(errors, []); await ctx.close();
});

test("a reset link works once, its stored form is a digest, and a reused link is refused with guidance", async () => {
  const { id, email } = await owner("active");
  const token = randomUUID() + randomUUID();
  await db.passwordReset.create({ data: { email, userId: id, token: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 600_000) } });
  assert.equal(await db.passwordReset.count({ where: { token } }), 0, "the raw token is never stored");
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), page = await ctx.newPage();
  const fresh = "Fresh-Synthetic-457!";
  await page.goto(`${base}/forgot-password?token=${token}`);
  await page.locator("#new-password").fill(fresh);
  await page.locator("#confirm-password").fill(fresh);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(/\/login/);
  assert.equal(await bcrypt.compare(fresh, (await db.user.findUniqueOrThrow({ where: { id } })).password!), true);
  await page.goto(`${base}/forgot-password?token=${token}`);
  await page.getByRole("button", { name: /Request new link/ }).waitFor();
  await shot(page, "reset-reused-link-en-1440");
  await ctx.close();
});

test("sign-in returns to the requested page in the user's own area and ignores an outside redirect", async () => {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: "Synthetic returning teacher", role: "TEACHER", schoolId, isActive: true, emailVerifiedAt: new Date(), onboardingComplete: true, preferredLanguage: "en" } });
  for (const [redirect, expected] of [["/teacher/classes", "/teacher/classes"], ["//evil.example/teacher", "/teacher"], ["/admin", "/teacher"]] as const) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), page = await ctx.newPage();
    await page.goto(`${base}/login?redirect=${encodeURIComponent(redirect)}`);
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(target => target.pathname !== "/login", { timeout: 20_000 });
    assert.equal(new URL(page.url()).origin, new URL(base).origin);
    assert.equal(new URL(page.url()).pathname, expected, `redirect ${redirect}`);
    await ctx.close();
  }
});

test("an invitation cancelled while the page is open is refused with translated guidance (UR 390)", async () => {
  const campusId = randomUUID(), token = randomUUID();
  await db.campus.create({ data: { id: campusId, schoolId, name: "Cedar North", regId: campusId, city: "Lahore" } });
  await db.staffInvitation.create({ data: { schoolId, email: `${randomUUID()}@example.invalid`, role: "TEACHER", campusId, token, expiresAt: new Date(Date.now() + 86_400_000), status: "pending" } });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await ctx.newPage(), errors: string[] = [];
  await ctx.addCookies([{ name: "skoolee-lang", value: "ur", url: base }]);
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/accept-invite?token=${token}`);
  await page.locator("#fullName").fill("Synthetic Invitee");
  await page.locator("#password").fill(password);
  await page.locator("#confirmPassword").fill(password);
  // Finish the initial status/locale requests before cancelling an already-open invitation.
  await page.waitForLoadState("networkidle");
  await db.staffInvitation.update({ where: { token }, data: { status: "cancelled" } });
  await page.locator('button[type="submit"]').click();
  await page.getByText("اسکول نے یہ دعوت منسوخ کر دی ہے۔").first().waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await shot(page, "invite-cancelled-while-open-ur-390");
  assert.equal(await db.user.count({ where: { schoolId, role: "TEACHER", fullName: "Synthetic Invitee" } }), 0);
  assert.deepEqual(errors, []); await ctx.close();
});

test("signing up with an address that already owns a school reads exactly like a new signup", async () => {
  const email = `${randomUUID()}@example.invalid`;
  const signup = async (name: string) => {
    // A fresh synthetic client address per run keeps the per-IP signup throttle out of the comparison.
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce", extraHTTPHeaders: { "x-forwarded-for": `198.18.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}` } }), page = await ctx.newPage();
    const replies: Array<{ status: number; body: string }> = [];
    page.on("response", async response => { if (response.url().endsWith("/api/auth/signup-step2")) replies.push({ status: response.status(), body: await response.text() }); });
    await page.goto(`${base}/register`);
    // §8.2: Continue stays disabled until an institution type is chosen.
    await page.getByRole("radio", { name: /Multi-Campus School Group/ }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.locator("#name").fill("Synthetic Founder");
    await page.locator("#email").fill(email);
    await page.locator("#phone").fill("+92 300 0000000");
    await page.locator("#schoolName").fill(name);
    await page.locator("#password").fill(password);
    await page.locator("#confirmPassword").fill(password);
    await page.getByRole("checkbox", { name: /I agree to/ }).focus();
    await page.keyboard.press("Space");
    await page.getByRole("button", { name: "Create Account", exact: true }).click();
    await page.waitForFunction(() => !document.querySelector("#schoolName"), undefined, { timeout: 20_000 });
    await settled(page);
    const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");
    return { ctx, page, replies, text };
  };
  try {
    const first = await signup("Synthetic Willow School");
    assert.equal(await db.school.count({ where: { contactEmail: email } }), 1);
    const second = await signup("Synthetic Willow School Two");
    await shot(second.page, "signup-existing-address-en-1440");
    assert.deepEqual(second.replies, first.replies, "same status and body for a new and an existing address");
    assert.deepEqual(first.replies.map(reply => [reply.status, JSON.parse(reply.body).user]), [[200, undefined]], "no account id is returned");
    // Only what the applicant typed (address and school name) may differ between the two screens.
    assert.equal(second.text.replace(email, "").replace("Synthetic Willow School Two", "{school}"), first.text.replace(email, "").replace("Synthetic Willow School", "{school}"), "the confirmation screen is identical");
    assert.equal(await db.school.count({ where: { contactEmail: email } }), 1, "no second school");
    assert.equal(await db.pendingRegistration.count({ where: { email } }), 0, "the step-one draft is consumed either way");
    await first.ctx.close(); await second.ctx.close();
  } finally {
    const schools = await db.school.findMany({ where: { contactEmail: email }, select: { id: true } });
    for (const school of schools) { await db.user.deleteMany({ where: { schoolId: school.id } }); await db.school.delete({ where: { id: school.id } }).catch(() => undefined); }
  }
});

for (const language of ["ar", "ur"] as const) {
  test(`signup saves ${language} for initial verification and later security emails`, async () => {
    const email = `${randomUUID()}@example.invalid`;
    const headers = { "Content-Type": "application/json", "x-forwarded-for": `198.18.77.${language === "ar" ? 11 : 12}` };
    try {
      const first = await fetch(base + "/api/auth/signup-step1", { method: "POST", headers, body: JSON.stringify({ email, registrationType: "school_group" }) });
      assert.equal(first.status, 200);
      const second = await fetch(base + "/api/auth/signup-step2", { method: "POST", headers, body: JSON.stringify({ email, fullName: "Synthetic localized owner", password, schoolName: "Synthetic localized school", regId: randomUUID(), country: "PK", language }) });
      assert.equal(second.status, 200);
      assert.equal((await second.json()).success, true);
      const account = await db.user.findFirstOrThrow({ where: { email } });
      assert.equal(account.preferredLanguage, language);
      assert.equal(account.isActive, false, "verification is still required");
    } finally {
      const institutions = await db.school.findMany({ where: { contactEmail: email }, select: { id: true } });
      for (const institution of institutions) {
        await db.user.deleteMany({ where: { schoolId: institution.id } });
        await db.school.delete({ where: { id: institution.id } });
      }
    }
  });
}
