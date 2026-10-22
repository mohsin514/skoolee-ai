import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import { createHash, randomUUID } from "node:crypto";
import { schoolAICopy } from "../../src/lib/school-ai/copy";
import { feeInvoiceCopy } from "../../src/components/school-ai/fee-invoice-copy";
import type { Language } from "../../src/lib/locale/package";

const local = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== local || process.env.DIRECT_URL !== local) throw new Error("Use only the isolated fee invoice browser database.");
const db = new PrismaClient(), schoolIds: string[] = [], origin = "http://localhost:3106";
let schoolId = "", campusId = "", adminId = "", classId = "", groupId = "", lineId = "", studentId = "";
async function signIn(context: BrowserContext) {
  const token = await new SignJWT({ userId: adminId, schoolId, campusId, role: "ADMIN", email: `${adminId}@example.invalid`, accessVersion: 0, mfaVerified: true, onboardingComplete: true, schoolStatus: "ACTIVE" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("2h").sign(new TextEncoder().encode("school-ai-isolated-browser-test-secret-only"));
  await db.loginSession.create({ data: { userId: adminId, schoolId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 7200000), isActive: true } });
  await context.addCookies([{ name: "skoolee_token", value: token, url: origin, httpOnly: true, sameSite: "Lax" }]);
}
test.afterAll(async () => { await db.school.deleteMany({ where: { id: { in: schoolIds } } }); await db.$disconnect(); });
test.beforeEach(async ({ context }) => {
  schoolId = `ai-fee-browser-${randomUUID()}`; schoolIds.push(schoolId); campusId = randomUUID(); adminId = randomUUID(); classId = randomUUID(); studentId = randomUUID();
  await db.school.create({ data: { id: schoolId, name: "Synthetic fee academy", slug: schoolId, regId: schoolId, city: "Test", contactEmail: `${schoolId}@example.invalid`, registrationKind: "GROUP", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Fee campus", city: "Test", regId: campusId } });
  await db.user.create({ data: { id: adminId, schoolId, campusId, email: `${adminId}@example.invalid`, role: "ADMIN", fullName: "Fee reviewer", isActive: true, onboardingComplete: true, mfaEnabled: true } });
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Fee Grade 8", section: "A", academicYear: 2026 } });
  await db.academicCycle.create({ data: { schoolId, campusId, label: "2026 cycle", academicYear: 2026, status: "ACTIVE", startDate: new Date("2026-01-01Z"), endDate: new Date("2027-03-31Z") } });
  await db.student.create({ data: { id: studentId, schoolId, campusId, classId, fullName: "Reviewed learner", rollNo: "1", gender: "OTHER", enrollmentDate: new Date("2026-10-13Z") } });
  groupId = (await db.feeGroup.create({ data: { schoolId, campusId, name: "Tuition package", currency: "PKR" } })).id;
  const type = await db.feeType.create({ data: { schoolId, campusId, name: "Tuition", code: "MONTHLY_TUITION" } });
  lineId = (await db.feesMasterLine.create({ data: { schoolId, campusId, feeGroupId: groupId, feeTypeId: type.id, amount: 12345 } })).id;
  await db.feeGroupAssignment.create({ data: { schoolId, campusId, classId, feeGroupId: groupId, academicYear: 2026 } });
  await signIn(context);
});
async function fillDraft(page: Page, language: Language = "en") {
  const c = schoolAICopy(language), t = feeInvoiceCopy(language);
  await page.goto("/ai"); await page.getByRole("button", { name: c.feeInvoices, exact: true }).click(); await page.getByRole("button", { name: t.newPlan, exact: true }).click();
  await page.getByRole("textbox", { name: new RegExp(`^${t.planName}`) }).fill("Reviewed October tuition");
  await page.getByRole("combobox", { name: new RegExp(`^${t.class}`) }).selectOption(classId);
  await page.getByRole("combobox", { name: new RegExp(`^${t.group}`) }).selectOption(groupId);
  await page.getByRole("checkbox", { name: /^Tuition ·/ }).check(); await page.getByRole("checkbox", { name: "Reviewed learner · 1", exact: true }).check();
  await page.locator('input[type="month"]').fill("2026-10"); await page.locator('input[type="date"]').fill("2026-10-31");
}
async function saveApprove(page: Page, language: Language = "en") {
  const c = schoolAICopy(language), t = feeInvoiceCopy(language);
  const saved = page.waitForResponse(response => /\/api\/school-ai\/workspace(?:\/[a-zA-Z0-9_-]+)?$/.test(response.url()) && ["POST", "PATCH"].includes(response.request().method()));
  await page.getByRole("button", { name: c.save, exact: true }).click(); const response = await saved; expect(response.ok(), await response.text()).toBeTruthy(); const { record } = await response.json();
  await expect(page.getByRole("button", { name: t.approve, exact: true })).toBeDisabled();
  await page.getByRole("checkbox", { name: t.review, exact: true }).check(); await page.getByRole("button", { name: t.approve, exact: true }).click(); await expect(page.getByRole("button", { name: t.preview, exact: true })).toBeEnabled();
  return record.id as string;
}
async function createInvoices(page: Page, language: Language = "en") {
  const t = feeInvoiceCopy(language);
  await page.getByRole("button", { name: t.preview, exact: true }).click(); const review = page.getByRole("region", { name: t.previewTitle, exact: true });
  await expect(review.getByText("2026-10-13", { exact: true })).toBeVisible();
  await review.screenshot({ path: test.info().outputPath(`fee-review-${language}.png`) });
  await expect(review.getByRole("button", { name: t.generate, exact: true })).toBeDisabled();
  await review.getByRole("checkbox", { name: t.confirm, exact: true }).check(); await review.getByRole("button", { name: t.generate, exact: true }).click();
  await expect(page.getByRole("heading", { name: t.created, exact: true })).toBeVisible();
}
test("real save, approval, exact invoice review and creation survive reload and remain visible in fee accounts", async ({ page }) => {
  await fillDraft(page); await saveApprove(page); await createInvoices(page);
  const invoice = await db.invoice.findFirstOrThrow({ where: { schoolId } }); expect(invoice.totalAmount).toBe(12345); expect(invoice.invoiceDate.toISOString()).toBe("2026-10-13T00:00:00.000Z"); expect(invoice.status).toBe("PENDING");
  const accounts = await page.request.get("/api/fees/invoices"); expect(accounts.ok(), await accounts.text()).toBeTruthy(); expect(JSON.stringify(await accounts.json())).toContain(invoice.id);
  expect(await db.payment.count({ where: { schoolId } })).toBe(0); expect(await db.ledgerEntry.count({ where: { schoolId } })).toBe(0);
  await page.reload(); await page.getByRole("button", { name: schoolAICopy("en").feeInvoices, exact: true }).click(); await expect(page.getByRole("heading", { name: feeInvoiceCopy("en").created, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: feeInvoiceCopy("en").preview, exact: true })).toHaveCount(0);
});
test("changed fee amounts reject a reviewed preview and unsaved edits require fresh approval", async ({ page }) => {
  const t = feeInvoiceCopy("en"), c = schoolAICopy("en"); await fillDraft(page); await saveApprove(page);
  await page.getByRole("button", { name: t.preview, exact: true }).click(); await page.getByRole("checkbox", { name: t.confirm, exact: true }).check();
  await db.feesMasterLine.update({ where: { id: lineId }, data: { amount: 12500 } }); await page.getByRole("button", { name: t.generate, exact: true }).click(); await expect(page.getByRole("alert")).toBeVisible(); expect(await db.invoice.count({ where: { schoolId } })).toBe(0);
  await page.getByRole("textbox", { name: new RegExp(`^${t.planName}`) }).fill("Revised invoice plan"); await expect(page.getByRole("button", { name: t.preview, exact: true })).toBeDisabled();
  await page.getByRole("button", { name: c.overview, exact: true }).click(); await expect(page.getByRole("alertdialog", { name: c.unsavedTitle, exact: true })).toBeVisible(); await page.getByRole("button", { name: c.keepEditing, exact: true }).click();
  await saveApprove(page); await createInvoices(page); expect((await db.invoice.findFirstOrThrow({ where: { schoolId } })).totalAmount).toBe(12500);
});
for (const language of ["ar", "ur"] as const) test(`${language} mobile fee workflow completes through shared RTL controls`, async ({ page }) => {
  await db.user.update({ where: { id: adminId }, data: { preferredLanguage: language } }); await page.setViewportSize({ width: 360, height: 800 });
  await fillDraft(page, language); await saveApprove(page, language); await createInvoices(page, language);
  const geometry = await page.evaluate(() => ({ width: window.innerWidth, scroll: document.documentElement.scrollWidth, dir: document.documentElement.dir })); expect(geometry.scroll).toBeLessThanOrEqual(geometry.width); expect(geometry.dir).toBe("rtl");
});
// G8: /api/billing is the SaaS subscription only (POST answers 410) and /api/billing/invoices is gone; tuition
// generation and invoice lists live under /api/fees.
test("the legacy generation endpoint respects invoices created through the reviewed workflow", async ({ page }) => {
  await fillDraft(page); await saveApprove(page); await createInvoices(page);
  const generated = await page.request.post("/api/fees/generate-invoices", { data: { classId, generationMonth: "2026-10", includeLateFees: false } }); expect(generated.status(), await generated.text()).toBe(409);
  expect(await db.invoice.count({ where: { schoolId } })).toBe(1);
});
test("revoked fee read access immediately protects both invoice lists and generation validates periods", async ({ page }) => {
  await fillDraft(page); await saveApprove(page); await createInvoices(page);
  const invalid = await page.request.post("/api/fees/generate-invoices", { data: { generationMonth: "2026-13", classId } }); expect(invalid.status()).toBe(400);
  const baseline = await page.request.get("/api/fees/invoices"); expect(baseline.ok(), await baseline.text()).toBeTruthy(); expect((await baseline.json()).invoices).toHaveLength(1); expect(baseline.headers()["cache-control"]).toBe("private, no-store");
  await db.rolePermission.create({ data: { schoolId, role: "ADMIN", module: "fees", canView: false, canAdd: false, canEdit: false, canDelete: false } });
  for (const endpoint of ["/api/fees/invoices", "/api/school-ai/fee-invoices/options"]) expect((await page.request.get(endpoint)).status()).toBe(403);
});
for (const endpoint of ["/api/fees/generate-invoices"] as const) test(`${endpoint} generates an enrollment-compatible bill for a mid-month admission`, async ({ page }) => {
  await db.feeStructure.create({ data: { schoolId, campusId, classId, monthlyFee: 12345, currency: "PKR", activeFrom: new Date("2026-01-01Z") } });
  const response = await page.request.post(endpoint, { data: { action: "generate-invoices", classId, generationMonth: "2026-10", includeLateFees: false } }); expect(response.ok(), await response.text()).toBeTruthy();
  const invoice = await db.invoice.findFirstOrThrow({ where: { schoolId } }); expect(invoice.invoiceDate.toISOString()).toBe("2026-10-13T00:00:00.000Z"); expect(invoice.enrollmentId).toBeTruthy(); expect(invoice.totalAmount).toBe(12345);
  if (endpoint === "/api/fees/generate-invoices") { const january = await page.request.post(endpoint, { data: { classId, generationMonth: "2027-01", includeLateFees: false } }); expect(january.ok(), await january.text()).toBeTruthy(); expect((await january.json()).generated).toBe(1); }
});
