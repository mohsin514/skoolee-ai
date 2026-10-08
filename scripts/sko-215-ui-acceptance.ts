import { randomUUID, createHash } from "node:crypto";
import { SignJWT } from "jose";
import { chromium, type BrowserContext, type Page } from "playwright";
import { prisma } from "@/lib/db/prisma";
import { JWT_SECRET } from "@/lib/auth/secret";
import { issueSupportCookie } from "@/lib/owner/support-access";
import { runUnscoped } from "@/lib/db/tenant-context";

const base = process.env.SKO_215_TEST_BASE_URL || "http://127.0.0.1:3015";
const localDb = new URL(process.env.DATABASE_URL || "");
const localApp = new URL(base);
if (localDb.hostname !== "127.0.0.1" || localDb.port !== "55415" || localDb.pathname !== "/skoolee215" || !["127.0.0.1", "localhost"].includes(localApp.hostname) || localApp.port !== "3015") {
  throw new Error("SKO-215 UI checks require synthetic DB skoolee215:55415 and local app port 3015");
}

const fixtureSchoolIds: string[] = [];
function check(condition: unknown, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
}

async function actor(schoolId: string, role: "APP_OWNER" | "SUPER_ADMIN", email: string) {
  const user = await prisma.user.create({ data: { schoolId, email, username: email, fullName: `Synthetic ${role}`, role, mfaEnabled: true, isActive: true, preferredLanguage: "ar" } });
  const school = await prisma.school.findUniqueOrThrow({ where: { id: schoolId } });
  const token = await new SignJWT({ userId: user.id, accessVersion: user.accessVersion, email: user.email, fullName: user.fullName, role, schoolId, campusId: null, schoolSlug: school.slug, schoolStatus: school.status, onboardingComplete: true, mfaVerified: true })
    .setJti(randomUUID()).setIssuedAt().setProtectedHeader({ alg: "HS256" }).setExpirationTime("2h").sign(JWT_SECRET);
  await prisma.loginSession.create({ data: { schoolId, userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 2 * 60 * 60_000) } });
  return { user, token };
}

async function context(browser: Awaited<ReturnType<typeof chromium.launch>>, token: string, supportToken?: string): Promise<BrowserContext> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addCookies([
    { name: "skoolee_token", value: token, url: base, httpOnly: true, sameSite: "Lax" },
    ...(supportToken ? [{ name: "skoolee_support_grant", value: supportToken, url: base, httpOnly: true, sameSite: "Lax" as const }] : []),
  ]);
  return ctx;
}

async function responsive(page: Page, width: number, height: number, screenshot: string) {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(250);
  const size = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  check(size.content <= size.viewport + 1, `${width}px layout has no horizontal page overflow`);
  await page.screenshot({ path: `/private/tmp/${screenshot}`, fullPage: true });
}

async function main() {
  const schoolId = randomUUID(); fixtureSchoolIds.push(schoolId);
  const school = await prisma.school.create({ data: { id: schoolId, name: "Synthetic RTL Support School", slug: schoolId, status: "ACTIVE", plan: "PRO", city: "Synthetic", regId: `TEST-${schoolId}`, contactEmail: `${schoolId}@example.test` } });
  const owner = await actor(school.id, "APP_OWNER", "ui-owner@example.test");
  const superAdmin = await actor(school.id, "SUPER_ADMIN", "ui-admin@example.test");
  const incident = await prisma.supportIncident.create({ data: { schoolId: school.id, reference: `INC-UI-${schoolId.slice(0, 8)}`, purpose: "Review a synthetic support request", impact: "School support request has no impact on live operations", ownerActorId: owner.user.id } });
  const pendingGrant = await prisma.supportGrant.create({ data: { schoolId: school.id, incidentId: incident.id, requestedById: owner.user.id, purpose: incident.purpose, scope: ["school_profile"], actions: ["read"], status: "pending", expiresAt: new Date(Date.now() + 30 * 60_000) } });
  const activeGrant = await prisma.supportGrant.create({ data: { schoolId: school.id, incidentId: incident.id, requestedById: owner.user.id, approvedById: superAdmin.user.id, purpose: "Review synthetic school profile rendering", scope: ["school_profile"], actions: ["read"], status: "active", startedAt: new Date(), expiresAt: new Date(Date.now() + 30 * 60_000) } });
  const activeCookie = await issueSupportCookie(activeGrant);
  const browser = await chromium.launch({ headless: true });
  const managementContext = await context(browser, owner.token);
  try {
    const page = await managementContext.newPage();
    await page.goto(`${base}/owner`, { waitUntil: "domcontentloaded" });
    await page.getByText("موافقات الدعم", { exact: true }).count();
    await page.getByText("الوصول للدعم", { exact: true }).click();
    await page.getByRole("heading", { name: "وصول الدعم المسجّل" }).waitFor();
    check(await page.evaluate(() => document.documentElement.dir) === "rtl", "Arabic locale sets RTL document direction");
    check(await page.getByText("طلب وصول محدود النطاق", { exact: true }).count() === 1, "support form displays Arabic labels");
    const scopeCheckbox = page.locator("fieldset").first().locator('input[type="checkbox"]').first();
    const initiallyChecked = await scopeCheckbox.isChecked();
    await scopeCheckbox.focus(); await page.keyboard.press("Space");
    check(await scopeCheckbox.isChecked() !== initiallyChecked, "support scope checkbox works from the keyboard");
    await page.keyboard.press("Space");
    await responsive(page, 1440, 1000, "sko-215-owner-desktop.png");
    await responsive(page, 768, 1024, "sko-215-owner-tablet.png");
    await responsive(page, 390, 844, "sko-215-owner-mobile.png");
  } finally { await managementContext.close(); }

  const activeContext = await context(browser, owner.token, activeCookie);
  try {
    const page = await activeContext.newPage();
    await page.goto(`${base}/owner`, { waitUntil: "domcontentloaded" });
    await page.getByRole("status").filter({ hasText: activeGrant.id }).waitFor();
    check(await page.getByText("وصول الدعم نشط · للقراءة فقط").count() === 1, "active support page shows a persistent Arabic read-only banner");
    await page.getByText("الوصول للدعم", { exact: true }).click();
    await page.getByRole("heading", { name: "وصول الدعم المسجّل" }).waitFor();
    check(await page.getByText("جلسة وصول محدودة نشطة").count() === 1, "active grant opens its scoped support view");
    await page.getByRole("button", { name: /فتح: ملف المدرسة/ }).click();
    await page.getByRole("heading", { name: /مساحة دعم مسجّلة/ }).waitFor();
    await responsive(page, 390, 844, "sko-215-active-mobile.png");
  } finally { await activeContext.close(); }

  const schoolContext = await context(browser, superAdmin.token);
  try {
    const page = await schoolContext.newPage();
    await page.goto(`${base}/super`, { waitUntil: "domcontentloaded" });
    await page.getByText("موافقات الدعم", { exact: true }).click();
    await page.getByRole("heading", { name: "موافقات وصول الدعم" }).waitFor();
    check(await page.getByText(pendingGrant.purpose).count() > 0, "school SUPER_ADMIN sees the request in the existing school console");
    check(await page.getByRole("button", { name: "الموافقة على الطلب" }).count() > 0, "school approver has a labeled approval control");
    await responsive(page, 390, 844, "sko-215-approval-mobile.png");
  } finally { await schoolContext.close(); await browser.close(); }
  console.log("SKO-215 responsive and Arabic RTL checks complete");
}

runUnscoped("creating synthetic UI fixtures for local SKO-215 browser checks", main)
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(async () => {
    if (fixtureSchoolIds.length) await prisma.school.deleteMany({ where: { id: { in: fixtureSchoolIds } } });
    await prisma.$disconnect();
  });
