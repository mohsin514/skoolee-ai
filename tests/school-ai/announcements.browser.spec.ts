import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import { createHash, randomUUID } from "node:crypto";
import { schoolAICopy } from "../../src/lib/school-ai/copy";
import { announcementCopy } from "../../src/components/school-ai/announcement-copy";
import type { AnnouncementExecutionReceipt, AnnouncementDelivery } from "../../src/lib/school-ai/announcements";

// Draft saves/approvals use the real local API. Delivery preview, queue and status
// are controlled browser fixtures; these tests never call a mail provider.
const local = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== local || process.env.DIRECT_URL !== local) throw new Error("Use only the isolated announcement browser database.");
const db = new PrismaClient(), schoolId = `ai-announcement-${randomUUID()}`, origin = "http://localhost:3106";
let campusId = "", adminId = "", classId = "";
async function signIn(context: BrowserContext, role: "ADMIN" | "PRINCIPAL") {
  const token = await new SignJWT({ userId: adminId, schoolId, campusId, role, email: `${adminId}@example.test`, accessVersion: 0, mfaVerified: true, onboardingComplete: true, schoolStatus: "ACTIVE" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("2h").sign(new TextEncoder().encode("school-ai-isolated-browser-test-secret-only"));
  await db.loginSession.create({ data: { userId: adminId, schoolId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 7200000), isActive: true } });
  await context.addCookies([{ name: "skoolee_token", value: token, url: origin, httpOnly: true, sameSite: "Lax" }]);
}
test.beforeAll(async () => { await db.school.create({ data: { id: schoolId, name: "Synthetic announcement academy", slug: schoolId, regId: schoolId, city: "Test", contactEmail: `${schoolId}@example.test`, registrationKind: "GROUP", status: "ACTIVE", plan: "PRO" } }); });
test.afterAll(async () => { await db.schoolAiExecution.deleteMany({ where: { schoolId } }); await db.school.deleteMany({ where: { id: schoolId } }); await db.$disconnect(); });
test.beforeEach(async ({ context, page }) => {
  campusId = randomUUID(); adminId = randomUUID(); classId = randomUUID();
  await db.campus.create({ data: { id: campusId, schoolId, name: "Announcement campus", city: "Test", regId: campusId } });
  await db.user.create({ data: { id: adminId, schoolId, campusId, email: `${adminId}@example.test`, role: "ADMIN", fullName: "Announcement reviewer", isActive: true, onboardingComplete: true, mfaEnabled: true } });
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Announcement Grade 8", section: "A", academicYear: 2026 } });
  await signIn(context, "ADMIN");
  await page.route("**/api/school-ai/announcements/options?*", route => route.fulfill({ json: { options: { campusId, classes: [{ id: classId, name: "Announcement Grade 8", section: "A", academicYear: 2026 }], providerReady: true } } }));
});
async function openDraft(page: Page, language: "en" | "ar" | "ur" = "en") {
  const c = schoolAICopy(language), t = announcementCopy(language);
  await page.goto("/ai"); await page.getByRole("button", { name: c.announcements, exact: true }).click();
  await page.getByRole("button", { name: t.newPlan, exact: true }).click();
  await page.getByRole("textbox", { name: new RegExp(`^${t.planName}`) }).fill("Reviewed school update");
  await page.getByRole("checkbox", { name: "Announcement Grade 8 · A · 2026", exact: true }).check();
  await page.getByRole("textbox", { name: new RegExp(`^${t.subject} · ${t[language]}`) }).fill(language === "en" ? "School meeting" : language === "ar" ? "اجتماع المدرسة" : "اسکول کا اجلاس");
  await page.getByRole("textbox", { name: new RegExp(`^${t.body} · ${t[language]}`) }).fill(language === "en" ? "Please attend the reviewed school meeting." : language === "ar" ? "يرجى حضور اجتماع المدرسة." : "براہ کرم اسکول کے اجلاس میں شرکت کریں۔");
}
async function saveAndApprove(page: Page, language: "en" | "ar" | "ur" = "en") {
  const c = schoolAICopy(language), t = announcementCopy(language);
  const response = page.waitForResponse(response => /\/api\/school-ai\/workspace(?:\/[a-zA-Z0-9_-]+)?$/.test(response.url()) && ["POST", "PATCH"].includes(response.request().method()));
  await page.getByRole("button", { name: c.save, exact: true }).click(); const saved = await response;
  expect(saved.ok(), await saved.text()).toBeTruthy(); const { record } = await saved.json();
  await expect(page.getByRole("button", { name: t.approve, exact: true })).toBeDisabled();
  await page.getByRole("checkbox", { name: t.review, exact: true }).check();
  await page.getByRole("button", { name: t.approve, exact: true }).click();
  await expect(page.getByRole("button", { name: t.preview, exact: true })).toBeEnabled(); return record.id as string;
}
async function installDeliveryFixture(page: Page, recordId: string, options: { missingLanguage?: boolean; dropFirst?: boolean } = {}) {
  const receipts: AnnouncementExecutionReceipt[] = [], keys: string[] = [];
  let status: AnnouncementDelivery["status"] = "QUEUED", dropped = false;
  await page.route(`**/api/school-ai/workspace/${recordId}/execute*`, async route => {
    const request = route.request(), url = new URL(request.url());
    if (request.method() === "GET" && url.searchParams.has("history")) return route.fulfill({ json: { executions: receipts } });
    const response = await page.request.get(`/api/school-ai/workspace/${recordId}`), { record } = await response.json(), proposal = record.data.proposal;
    if (request.method() === "GET") return route.fulfill({ json: { preview: { operation: "communications.queue_announcement", recordId, version: record.version, campusId, channel: "EMAIL", classes: [{ id: classId, name: "Announcement Grade 8 · A" }], messages: proposal.messages, fallbackLanguage: proposal.fallbackLanguage, recipients: [{ guardianUserId: "guardian-1", name: "Reviewed guardian", recipient: "guardian@example.test", language: proposal.fallbackLanguage || "en", studentNames: ["Verified learner"] }], skipped: [{ studentId: "excluded-learner", studentName: "Unlinked learner", reason: "NO_VERIFIED_GUARDIAN" }], blockers: options.missingLanguage && !proposal.fallbackLanguage ? ["ANNOUNCEMENT_MISSING_LANGUAGE"] : [], previewHash: `fixture-preview-${record.version}` } } });
    const body = request.postDataJSON(); keys.push(body.idempotencyKey);
    if (!receipts.length) receipts.push({ id: "synthetic-queue-receipt", operation: "communications.queue_announcement", recordId, version: record.version, status: "COMPLETED", queuedCount: 1, communicationIds: ["synthetic-delivery"], completedAt: new Date().toISOString() });
    if (options.dropFirst && !dropped) { dropped = true; return route.abort("failed"); }
    return route.fulfill({ json: { execution: receipts[0] } });
  });
  await page.route(`**/api/school-ai/workspace/${recordId}/announcements?*`, route => route.fulfill({ json: { deliveries: [{ id: "synthetic-delivery", recipient: "guardian@example.test", language: "en", status }], counts: { QUEUED: 0, ACCEPTED: 0, DELIVERED: 0, READ: 0, FAILED: 0, UNCERTAIN: 0, CANCELLED: 0, [status]: 1 } } }));
  return { keys, setStatus: (next: AnnouncementDelivery["status"]) => { status = next; } };
}

test("reviewed audience and exact language text are confirmed before queueing and a lost response retries the same key", async ({ page }) => {
  await openDraft(page); const t = announcementCopy("en");
  await page.getByRole("checkbox", { name: t.ar, exact: true }).check();
  await page.getByRole("textbox", { name: new RegExp(`^${t.subject} · ${t.ar}`) }).fill("اجتماع المدرسة");
  await page.getByRole("textbox", { name: new RegExp(`^${t.body} · ${t.ar}`) }).fill("يرجى حضور اجتماع المدرسة.");
  const recordId = await saveAndApprove(page), fixture = await installDeliveryFixture(page, recordId, { dropFirst: true });
  await page.getByRole("button", { name: t.preview, exact: true }).click();
  const preview = page.getByRole("region", { name: t.previewTitle, exact: true });
  await expect(preview.getByText("guardian@example.test", { exact: true })).toBeVisible();
  await expect(preview.getByText(/Unlinked learner/)).toBeVisible();
  await expect(preview.getByText("يرجى حضور اجتماع المدرسة.", { exact: true })).toBeVisible();
  await preview.screenshot({ path: "test-results/school-ai/announcements/desktop-review.png" });
  await expect(preview.getByRole("button", { name: t.queue, exact: true })).toBeDisabled();
  await preview.getByRole("checkbox", { name: t.queueConfirm, exact: true }).check();
  await preview.getByRole("button", { name: t.queue, exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: schoolAICopy("en").failed })).toBeVisible();
  await preview.getByRole("button", { name: t.queue, exact: true }).click();
  await expect(page.getByRole("heading", { name: t.queued, exact: true })).toBeVisible();
  expect(fixture.keys).toHaveLength(2); expect(fixture.keys[0]).toBe(fixture.keys[1]);
  await expect(page.getByText(t.receiptHint, { exact: true })).toBeVisible();
  await expect(page.getByText(t.QUEUED, { exact: true })).toBeVisible();
  fixture.setStatus("ACCEPTED"); await page.getByRole("button", { name: t.refreshDelivery, exact: true }).click();
  await expect(page.getByText(t.ACCEPTED, { exact: true })).toBeVisible();
  await expect(page.getByText(t.DELIVERED, { exact: true })).toHaveCount(0);
  fixture.setStatus("UNCERTAIN"); await page.getByRole("button", { name: t.refreshDelivery, exact: true }).click();
  await expect(page.getByText(t.UNCERTAIN, { exact: true })).toBeVisible();
  expect(await db.schoolAiExecution.count({ where: { schoolId } })).toBe(0);
});

test("a missing language blocks queueing until an explicit fallback is saved and approved again", async ({ page }) => {
  await openDraft(page); const recordId = await saveAndApprove(page), t = announcementCopy("en"); await installDeliveryFixture(page, recordId, { missingLanguage: true });
  await page.getByRole("button", { name: t.preview, exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: t.ANNOUNCEMENT_MISSING_LANGUAGE })).toBeVisible();
  await expect(page.getByRole("button", { name: t.queue, exact: true })).toBeDisabled();
  await page.getByRole("combobox", { name: t.fallback, exact: true }).selectOption("en");
  await expect(page.getByRole("button", { name: t.preview, exact: true })).toBeDisabled();
  await page.getByRole("button", { name: schoolAICopy("en").overview, exact: true }).click();
  await expect(page.getByRole("alertdialog", { name: schoolAICopy("en").unsavedTitle, exact: true })).toBeVisible();
  await page.getByRole("button", { name: schoolAICopy("en").keepEditing, exact: true }).click();
  await saveAndApprove(page);
  await page.getByRole("button", { name: t.preview, exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: t.ANNOUNCEMENT_MISSING_LANGUAGE })).toHaveCount(0);
  await page.getByRole("checkbox", { name: t.queueConfirm, exact: true }).check();
  await expect(page.getByRole("button", { name: t.queue, exact: true })).toBeEnabled();
});

for (const language of ["ar", "ur"] as const) test(`${language} announcement editor remains readable and usable at 360px`, async ({ page }) => {
  await db.user.update({ where: { id: adminId }, data: { preferredLanguage: language } });
  await page.setViewportSize({ width: 360, height: 800 });
  await openDraft(page, language);
  const t = announcementCopy(language);
  await expect(page.getByRole("combobox", { name: t.fallback, exact: true })).toBeVisible();
  if (language === "ar") { await page.getByRole("combobox", { name: t.fallback, exact: true }).scrollIntoViewIfNeeded(); await page.screenshot({ path: "test-results/school-ai/announcements/rtl-mobile.png" }); }
  const geometry = await page.evaluate(() => ({ width: window.innerWidth, scroll: document.documentElement.scrollWidth, dir: document.documentElement.dir }));
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.width); expect(geometry.dir).toBe("rtl");
});

test("legacy communication history and counts immediately hide announcement payloads after grants are revoked", async ({ page }) => {
  // Real HTTP and database fixture only; no queue or provider is invoked.
  const announcementId = randomUUID(), legacyIds = [randomUUID(), randomUUID()];
  await db.parentCommunication.createMany({ data: [
    { id: announcementId, schoolId, campusId, createdById: adminId, channel: "EMAIL", templateKey: "SCHOOL_AI_ANNOUNCEMENT", relatedType: "SCHOOL_AI_ANNOUNCEMENT", recipient: "restricted-guardian@example.test", body: "Restricted approved announcement", status: "PENDING", metadata: { proofs: [{ relationshipId: "restricted-guardian-proof" }] } },
    ...legacyIds.map((id, index) => ({ id, schoolId, campusId, createdById: adminId, channel: "EMAIL", templateKey: "LEGACY_TEST", relatedType: index ? "INVOICE" : null, recipient: "legacy@example.test", body: "Existing communication history", status: "PENDING" })),
  ] });
  const readHistory = async () => {
    const response = await page.request.get("/api/communications?status=PENDING&channel=EMAIL");
    expect(response.ok(), await response.text()).toBeTruthy();
    expect(response.headers()["cache-control"]).toBe("private, no-store");
    return response.json() as Promise<{ communications: Array<{ id: string }>; summary: Record<string, number> }>;
  };
  expect((await readHistory()).communications.map(item => item.id).sort()).toEqual([announcementId, ...legacyIds].sort());
  try {
    for (const denial of [{ module: "students", canView: false, canEdit: true }, { module: "students", canView: true, canEdit: false }, { module: "ai", canView: true, canEdit: false }]) {
      await db.rolePermission.deleteMany({ where: { schoolId, role: "ADMIN" } });
      await db.rolePermission.create({ data: { schoolId, role: "ADMIN", canAdd: true, canDelete: true, ...denial } });
      const denied = await page.request.get("/api/school-ai/workspace/synthetic-record/announcements?executionId=synthetic-receipt");
      expect(denied.status()).toBe(403);
      const history = await readHistory();
      expect(history.communications.map(item => item.id).sort()).toEqual([...legacyIds].sort());
      expect(history.summary).toEqual({ PENDING: 2 });
      expect(JSON.stringify(history)).not.toContain("restricted-guardian");
      expect(JSON.stringify(history)).not.toContain("Restricted approved announcement");
    }
  } finally {
    await db.rolePermission.deleteMany({ where: { schoolId, role: "ADMIN" } });
  }
  const restored = await readHistory();
  expect(restored.communications.map(item => item.id).sort()).toEqual([announcementId, ...legacyIds].sort());
  expect(restored.summary).toEqual({ PENDING: 3 });
});

test("principal dashboard server responses omit restricted announcement payloads and counts", async ({ page, context }) => {
  test.setTimeout(90000);
  await db.user.update({ where: { id: adminId }, data: { role: "PRINCIPAL" } });
  await signIn(context, "PRINCIPAL");
  const announcementId = randomUUID(), legacyId = randomUUID();
  await db.parentCommunication.createMany({ data: [
    { id: announcementId, schoolId, campusId, createdById: adminId, channel: "EMAIL", templateKey: "SCHOOL_AI_ANNOUNCEMENT", relatedType: "SCHOOL_AI_ANNOUNCEMENT", recipient: "restricted-principal-guardian@example.test", body: "Restricted principal announcement", status: "PENDING", metadata: { proofs: [{ relationshipId: "restricted-principal-proof" }] } },
    { id: legacyId, schoolId, campusId, createdById: adminId, channel: "EMAIL", templateKey: "LEGACY_TEST", relatedType: null, recipient: "legacy@example.test", body: "Existing principal communication", status: "PENDING" },
  ] });
  const loadDashboardResponse = async () => {
    const pending = page.waitForResponse(async response => new URL(response.url()).pathname === "/principal" && response.request().method() === "POST" && response.ok() && (await response.text()).includes('"recentCommunications"'));
    await page.goto("/principal");
    return (await pending).text();
  };
  const allowed = await loadDashboardResponse();
  expect(allowed).toContain(announcementId);
  expect(allowed).toContain(legacyId);
  expect(allowed).toContain('"communicationSummary":{"PENDING":2}');
  await db.rolePermission.create({ data: { schoolId, role: "PRINCIPAL", module: "ai", canView: true, canAdd: true, canEdit: false, canDelete: true } });
  const denied = await loadDashboardResponse();
  expect(denied).toContain(legacyId);
  expect(denied).toContain('"communicationSummary":{"PENDING":1}');
  expect(denied).not.toContain(announcementId);
  expect(denied).not.toContain("restricted-principal");
  expect(denied).not.toContain("Restricted principal announcement");
});
