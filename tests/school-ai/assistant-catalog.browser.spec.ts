import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { schoolAICopy } from "../../src/lib/school-ai/copy";
import { assistantCatalogCopy } from "../../src/components/school-ai/assistant-catalog-copy";
import { conversationCopy } from "../../src/lib/school-ai/conversation-copy";
import { beginSchoolAiRequest, completeSchoolAiRequest } from "../../src/lib/school-ai/requests";
import { schoolAiTransaction } from "../../src/lib/school-ai/transaction";
import { resolveAssistantCatalog } from "../../src/lib/school-ai/assistant-catalog-service";
import type { AuthUser } from "../../src/lib/auth";
const local = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== local || process.env.DIRECT_URL !== local) throw new Error("Use isolated catalog fixtures only.");
process.env.EMAIL_DEV_MODE = "true"; process.env.DISABLE_OUTBOUND_MESSAGES = "true";
const db = new PrismaClient(), schoolId = `catalog-browser-${randomUUID()}`;
let campusId = "", classId = "", user: AuthUser;
async function login(context: BrowserContext) {
  const token = await new SignJWT({ ...user, mfaVerified: true, onboardingComplete: true, schoolStatus: "ACTIVE" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("2h").sign(new TextEncoder().encode("school-ai-isolated-browser-test-secret-only"));
  await db.loginSession.create({ data: { schoolId, userId: user.userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 7200000), isActive: true } });
  await context.addCookies([{ name: "skoolee_token", value: token, url: "http://localhost:3106", httpOnly: true, sameSite: "Lax" }]);
}
test.beforeAll(async () => { await db.school.create({ data: { id: schoolId, name: "Synthetic grounded assistant school", slug: schoolId, regId: schoolId, city: "Test", contactEmail: `${schoolId}@example.invalid`, status: "ACTIVE", plan: "PRO", registrationKind: "GROUP" } }); });
test.afterAll(async () => { await db.school.delete({ where: { id: schoolId } }); await db.$disconnect(); });
test.beforeEach(async ({ context, page }) => {
  campusId = randomUUID(); classId = randomUUID(); user = { userId: randomUUID(), schoolId, campusId, email: `${randomUUID()}@example.invalid`, role: "ADMIN", accessVersion: 0 };
  await db.campus.create({ data: { id: campusId, schoolId, name: "Catalog campus", city: "Test", regId: campusId } });
  await db.user.create({ data: { id: user.userId, schoolId, campusId, email: user.email, role: user.role, fullName: "Catalog manager", onboardingComplete: true, mfaEnabled: true } });
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Selected Grade Eight", section: "A", academicYear: 2026 } });
  await login(context); await page.route("**/api/school-ai/capabilities", route => route.fulfill({ json: { documentUpload: true, documentExtraction: false, voiceTranscription: false, assistant: true, paperGeneration: false, liveVoice: false } }));
});
async function open(page: Page, language: "en" | "ar" | "ur") {
  await db.user.update({ where: { id: user.userId }, data: { preferredLanguage: language } });
  await page.goto("/ai"); await page.getByRole("button", { name: schoolAICopy(language).announcements, exact: true }).click();
  const label = language === "en" ? "Ask about this workflow" : language === "ar" ? "اسأل عن سير العمل هذا" : "اس کام کے بارے میں پوچھیں";
  await page.getByRole("button", { name: new RegExp(label) }).click();
  const picker = page.getByRole("region", { name: assistantCatalogCopy(language).title }); await expect(picker.getByRole("checkbox", { name: "Selected Grade Eight · A · 2026", exact: true })).toBeVisible(); return picker;
}
for (const language of ["en", "ar", "ur"] as const) test(`${language} named choices bind the private turn and fit a small screen`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); const picker = await open(page, language), c = assistantCatalogCopy(language), general = schoolAICopy(language);
  await picker.getByRole("textbox", { name: c.search, exact: true }).fill("Eight"); await picker.getByRole("checkbox", { name: "Selected Grade Eight · A · 2026", exact: true }).check();
  let submitted: unknown;
  await page.route("**/api/school-ai/assistant", async route => {
    const input = route.request().postDataJSON(); submitted = input.catalog;
    await resolveAssistantCatalog(user, campusId, input.catalog);
    const fingerprint = createHash("sha256").update(JSON.stringify([input.message, input.language, campusId, {}, input.conversationId, [], input.focus, input.catalog])).digest("hex");
    const result = await beginSchoolAiRequest(user, { key: input.idempotencyKey, fingerprint, campusId, conversationId: input.conversationId, expectedConversationVersion: input.expectedConversationVersion, userMessage: input.message, requestLanguage: input.language, catalogContext: input.catalog, retryFailed: input.retryFailed });
    const reply = language === "en" ? "The selected class is ready for your reviewed message." : language === "ar" ? "الصف المحدد جاهز لرسالتك المراجعة." : "منتخب جماعت آپ کے جائزہ شدہ پیغام کے لیے تیار ہے۔";
    if (result.state === "CLAIMED") await schoolAiTransaction(user, tx => completeSchoolAiRequest(user, result.claim, { reply }, tx));
    await route.fulfill({ json: { reply } });
  });
  const assistant = picker.locator(".."); await assistant.getByRole("textbox", { name: general.textLabel, exact: true }).fill("Prepare an announcement for this selected class; ask for the missing text.");
  await assistant.getByRole("button", { name: general.send, exact: true }).click(); await expect(assistant.getByRole("log", { name: conversationCopy(language).title })).toContainText(language === "en" ? "ready for your reviewed message" : language === "ar" ? "الصف المحدد" : "منتخب جماعت");
  expect(submitted).toMatchObject({ query: { operation: "communications.queue_announcement" }, selected: [{ kind: "class", id: classId }] });
  expect(await picker.innerText()).not.toContain(classId);
  const bounds = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth })); expect(bounds.scroll).toBeLessThanOrEqual(bounds.width + 1);
  await picker.screenshot({ path: `test-results/school-ai/catalog-${language}.png` });
});
test("API rejects a catalog outside the focused domain and stale current choices before any provider call", async ({ page }) => {
  const picker = await open(page, "en"), query = encodeURIComponent(JSON.stringify({ operation: "communications.queue_announcement" }));
  const forbidden = await page.request.get(`/api/school-ai/assistant/catalog?campusId=${campusId}&domain=work&query=${query}`); expect(forbidden.status()).toBe(403);
  const catalog = await (await page.request.get(`/api/school-ai/assistant/catalog?campusId=${campusId}&domain=announcements&query=${query}`)).json();
  await db.class.update({ where: { id: classId }, data: { name: "Renamed Grade Eight" } });
  const stale = await page.request.post("/api/school-ai/assistant", { headers: { Origin: "http://localhost:3106" }, data: { message: "Prepare a message", language: "en", campusId, focus: { domain: "announcements" }, catalog: { query: catalog.query, snapshot: catalog.snapshot, selected: [{ kind: "class", id: classId }] }, idempotencyKey: randomUUID() } }); expect(stale.status()).toBe(409);
  await picker.getByRole("button", { name: assistantCatalogCopy("en").refresh, exact: true }).click(); await expect(picker.getByRole("checkbox", { name: "Renamed Grade Eight · A · 2026", exact: true })).toBeVisible();
});
test("failed server generation restores the exact named selection on reload and changing it starts a new request", async ({ page }) => {
  const picker = await open(page, "en"), assistant = picker.locator(".."), c = schoolAICopy("en");
  await picker.getByRole("checkbox", { name: "Selected Grade Eight · A · 2026", exact: true }).check();
  await assistant.getByRole("textbox", { name: c.textLabel, exact: true }).fill("Draft a notice for this class after asking for the content.");
  const failed = page.waitForResponse(response => response.url().endsWith("/api/school-ai/assistant") && response.request().method() === "POST");
  await assistant.getByRole("button", { name: c.send, exact: true }).click(); const first = await failed; expect(first.status()).toBe(503); const firstBody = first.request().postDataJSON();
  const receipt = await db.schoolAiRequest.findFirstOrThrow({ where: { schoolId, actorId: user.userId, idempotencyKey: firstBody.idempotencyKey } }); expect(receipt.status).toBe("FAILED");
  await page.reload(); await page.getByRole("button", { name: c.announcements, exact: true }).click(); await page.getByRole("button", { name: /Ask about this workflow/ }).click();
  const restored = page.getByRole("region", { name: assistantCatalogCopy("en").title }); await expect(restored.getByRole("checkbox", { name: "Selected Grade Eight · A · 2026", exact: true })).toBeChecked(); await expect(restored.locator("..").getByRole("textbox", { name: c.textLabel, exact: true })).toHaveValue(firstBody.message);
  await restored.getByRole("button", { name: assistantCatalogCopy("en").clear, exact: true }).click();
  let nextKey = ""; await page.route("**/api/school-ai/assistant", route => { nextKey = route.request().postDataJSON().idempotencyKey; return route.fulfill({ status: 503, json: { error: "Synthetic provider disabled" } }); });
  await restored.locator("..").getByRole("button", { name: c.send, exact: true }).click(); await expect.poll(() => nextKey).not.toBe(""); expect(nextKey).not.toBe(firstBody.idempotencyKey);
});
