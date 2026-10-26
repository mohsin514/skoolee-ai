/** Run only with the isolated local audit server; no real users or provider deliveries. */
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import { chromium } from "playwright";
import { expect } from "@playwright/test";

async function main() {
  assert.equal(process.env.DATABASE_URL, "postgresql://angular_dev_15@127.0.0.1:55438/postgres");
  assert.equal(process.env.AUTH_SECRET, "synthetic-owner-audit-only-20261024");
  const base = "http://localhost:3107", db = new PrismaClient();
  const school = await db.school.create({ data: { name: "Synthetic standalone audit", slug: randomUUID(), regId: randomUUID(), city: "Karachi", contactEmail: `${randomUUID()}@example.invalid`, status: "ACTIVE", plan: "PRO", registrationKind: "STANDALONE", aiWorkflowsLiveAt: new Date() } });
  const browser = await chromium.launch({ headless: true });
  try {
    const campus = await db.campus.create({ data: { schoolId: school.id, name: "Main school", regId: randomUUID(), city: "Karachi" } });
    await db.academicCycle.create({ data: { schoolId: school.id, campusId: campus.id, label: "2026", academicYear: 2026, status: "ACTIVE" } });
    const user = await db.user.create({ data: { schoolId: school.id, campusId: campus.id, role: "ADMIN", isInstitutionOwner: true, canPurchaseSubscription: true, canManageMemberships: true, fullName: "Synthetic school owner", email: `${randomUUID()}@example.invalid`, password: "unused", onboardingComplete: true, welcomeCompletedAt: new Date(), mfaEnabled: true, tourProgress: { "admin-school": { v: 1, s: "done", at: new Date().toISOString() } } } });
    const cls = await db.class.create({ data: { schoolId: school.id, campusId: campus.id, name: "Grade 1", academicYear: 2026 } });
    const student = await db.student.create({ data: { schoolId: school.id, campusId: campus.id, classId: cls.id, fullName: "Synthetic learner", gender: "FEMALE", rollNo: "QA1" } });
    await db.invoice.create({ data: { schoolId: school.id, campusId: campus.id, studentId: student.id, currency: "PKR", invoiceDate: new Date(), dueDate: new Date(), monthlyFee: 10000, subtotal: 10000, totalAmount: 10000, totalAmountPaid: 2500, balanceDue: 7500, status: "PARTIAL" } });
    const token = await new SignJWT({ userId: user.id, schoolId: school.id, campusId: campus.id, role: user.role, accessVersion: user.accessVersion, email: user.email, fullName: user.fullName, onboardingComplete: true, schoolStatus: "ACTIVE", mfaVerified: true }).setProtectedHeader({ alg: "HS256" }).setJti(randomUUID()).setIssuedAt().setExpirationTime("2h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
    await db.loginSession.create({ data: { schoolId: school.id, userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 7200000) } });
    const context = await browser.newContext({ reducedMotion: "reduce" });
    await context.addCookies([{ name: "skoolee_token", value: token, url: base }]);
    const page = await context.newPage(); page.setDefaultTimeout(60000);
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    await mkdir("test-results/standalone-admin", { recursive: true });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const view of ["overview", "students", "classes", "fees", "access", "school-settings", "billing"]) {
        await page.goto(`${base}/admin?view=${view}`, { timeout: 120000 });
        await page.screenshot({ path: `test-results/standalone-admin/loading-${view}-${width}.png` });
        console.log(`LOADED ${view} ${width}: ${await page.title()}`);
        await page.locator("[data-admin-workspace]").waitFor();
        await page.locator('div.pointer-events-none.fixed.inset-0[aria-hidden=true]').waitFor({ state: "hidden" });
        const skip = page.getByRole("button", { name: "Skip tour", exact: true });
        if (await skip.isVisible()) await skip.click();
        if (view === "overview") {
          await expect(page.getByText("25%", { exact: true })).toBeVisible({ timeout: 30000 });
          await expect(page.getByText("100%", { exact: true })).toHaveCount(0);
        }
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${view} overflows ${width}`);
        await page.screenshot({ path: `test-results/standalone-admin/${view}-${width}.png`, fullPage: true });
        console.log(`PASS standalone ${view} ${width}`);
      }
    }
    assert.deepEqual(errors, []);
    const ownerOnly = await context.request.get(`${base}/api/owner/schools`);
    assert.equal(ownerOnly.status(), 403);
    console.log("PASS school owner cannot access platform owner API");
  } finally { await browser.close(); await db.invoice.deleteMany({ where: { schoolId: school.id } }); await db.school.delete({ where: { id: school.id } }); await db.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
