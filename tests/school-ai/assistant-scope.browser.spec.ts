import { test, expect, type Page, type Locator, type BrowserContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import { createHash, randomUUID } from "node:crypto";
import { beginSchoolAiRequest, completeSchoolAiRequest, failSchoolAiRequest } from "../../src/lib/school-ai/requests";
import { schoolAiTransaction } from "../../src/lib/school-ai/transaction";
import { prisma } from "../../src/lib/db/prisma";
import { setupTaskCopy } from "../../src/lib/school-ai/setup-task-copy";
import { schoolAICopy } from "../../src/lib/school-ai/copy";
import { conversationCopy } from "../../src/lib/school-ai/conversation-copy";
import type { AuthUser } from "../../src/lib/auth";

const database = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== database || process.env.DIRECT_URL !== database) throw new Error("Use only the isolated School AI test database.");
const db = new PrismaClient();
const schoolId = `ai-scope-browser-${randomUUID()}`, alpha = `${schoolId}-a`, beta = `${schoolId}-b`;
const managerId = `${schoolId}-manager`, teacherId = `${schoolId}-teacher`, classId = `${schoolId}-class`, maths = `${schoolId}-maths`, science = `${schoolId}-science`;
const origin = "http://localhost:3106";
const tokens: Record<string, string> = {};
type AssistantInput = { message: string; campusId: string; subjectId?: string; classId?: string; history?: { role: string; text: string }[]; conversationId: string; expectedConversationVersion: number; language: "en" | "ar" | "ur"; idempotencyKey: string; retryFailed: boolean };

test.beforeAll(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic multi-campus school", slug: schoolId, regId: schoolId, city: "Test", contactEmail: `${schoolId}@example.test`, registrationKind: "GROUP", status: "ACTIVE", plan: "PRO" } });
  await db.campus.createMany({ data: [{ id: alpha, schoolId, name: "Alpha campus", regId: alpha, city: "Test" }, { id: beta, schoolId, name: "Beta campus", regId: beta, city: "Test" }] });
  for (const [id, role, campusId] of [[managerId, "SUPER_ADMIN", null], [teacherId, "TEACHER", alpha]] as const) {
    await db.user.create({ data: { id, role, campusId, schoolId, email: `${id}@example.test`, fullName: `Synthetic ${role}`, mfaEnabled: true, isActive: true, onboardingComplete: true } });
    tokens[role] = await new SignJWT({ userId: id, schoolId, campusId, role, email: `${id}@example.test`, accessVersion: 0, mfaVerified: true, onboardingComplete: true, schoolStatus: "ACTIVE" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("2h").sign(new TextEncoder().encode("school-ai-isolated-browser-test-secret-only"));
    await db.loginSession.create({ data: { userId: id, schoolId, tokenHash: createHash("sha256").update(tokens[role]).digest("hex"), expiresAt: new Date(Date.now() + 7200000), isActive: true } });
  }
  await db.class.create({ data: { id: classId, schoolId, campusId: alpha, name: "Grade 8", academicYear: 2026, classTeacherId: teacherId } });
  await db.subject.createMany({ data: [{ id: maths, schoolId, campusId: alpha, classId, name: "Mathematics", teacherId }, { id: science, schoolId, campusId: alpha, classId, name: "Science", teacherId }] });
});
test.afterAll(async () => { await db.school.deleteMany({ where: { id: schoolId } }); await db.$disconnect(); await prisma.$disconnect(); });
async function signIn(context: BrowserContext, role = "SUPER_ADMIN") {
  await context.addCookies([{ name: "skoolee_token", value: tokens[role], url: origin, httpOnly: true, sameSite: "Lax" }]);
}
async function enableLocalAssistant(page: Page) {
  await page.route("**/api/school-ai/capabilities", route => route.fulfill({ json: { documentUpload: true, documentExtraction: false, voiceTranscription: false, assistant: true, paperGeneration: false, secureBrowser: false, proctoring: false } }));
}
// Only the provider is simulated; conversations, claims, versions, recovery and
// history use the production database services and the real authenticated APIs.
async function saveProviderReply(input: AssistantInput, reply: string, fail = false) {
  const teacher = Boolean(input.subjectId);
  const user: AuthUser = { userId: teacher ? teacherId : managerId, schoolId, campusId: teacher ? alpha : null, role: teacher ? "TEACHER" : "SUPER_ADMIN", email: `${teacher ? teacherId : managerId}@example.test`, accessVersion: 0 };
  const started = await beginSchoolAiRequest(user, { key: input.idempotencyKey, fingerprint: createHash("sha256").update(JSON.stringify([input.message, input.language, input.conversationId])).digest("hex"), campusId: input.campusId, subjectId: input.subjectId, classId: input.classId, conversationId: input.conversationId, expectedConversationVersion: input.expectedConversationVersion, userMessage: input.message, requestLanguage: input.language, retryFailed: input.retryFailed });
  if (started.state === "CLAIMED") {
    if (fail) await failSchoolAiRequest(user, started.claim);
    else await schoolAiTransaction(user, tx => completeSchoolAiRequest(user, started.claim, { reply, contextRecordIds: [], contextVersions: {} }, tx));
  }
}
async function send(page: Page | Locator, message: string) {
  await page.getByRole("textbox", { name: "Message or answer", exact: true }).fill(message);
  await page.getByRole("button", { name: "Prepare a response", exact: true }).click();
}

test("a multi-campus manager chooses a campus, receives real conversational context, retries safely and resets scope without exposing old replies", async ({ page, context }) => {
  await signIn(context); await enableLocalAssistant(page);
  const inputs: AssistantInput[] = [];
  let failed = false;
  await page.route("**/api/school-ai/assistant", async route => {
    const input = route.request().postDataJSON() as AssistantInput; inputs.push(input);
    if (input.message === "Follow up on that answer" && !failed) { failed = true; await saveProviderReply(input, "", true); return route.fulfill({ status: 503, json: { error: "Synthetic unavailable response" } }); }
    const reply = input.campusId === alpha ? `Alpha response: ${input.message}` : `Beta response: ${input.message}`; await saveProviderReply(input, reply);
    await route.fulfill({ json: { reply } });
  });
  for (const [campusId, title] of [[alpha, "Alpha private source"], [beta, "Beta private source"]]) {
    const result = await page.request.post("/api/school-ai/workspace", { headers: { Origin: origin }, data: { kind: "SOURCE", title, campusId, idempotencyKey: randomUUID(), data: { documentKind: "other", fileName: `${title}.txt`, mimeType: "text/plain", origin: "manual", extractedText: title, extractionStatus: "manual", uncertainties: [] } } });
    expect(result.ok(), await result.text()).toBeTruthy();
  }
  await page.goto("/ai");
  const picker = page.getByRole("combobox", { name: "Workspace campus", exact: true });
  await expect(picker).toHaveValue("");
  await expect(page.getByRole("textbox", { name: "Message or answer", exact: true })).toHaveCount(0);
  await picker.selectOption(alpha);
  await page.getByRole("button", { name: "Source library", exact: true }).click();
  await expect(page.getByRole("button", { name: /Alpha private source/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Beta private source/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await send(page, "First alpha question");
  await expect(page.getByRole("log")).toContainText("Alpha response: First alpha question");
  await send(page, "Follow up on that answer");
  await expect(page.getByRole("textbox", { name: "Message or answer", exact: true })).toHaveValue("Follow up on that answer");
  await expect(page.getByRole("button", { name: "Prepare a response", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Prepare a response", exact: true }).click();
  await expect(page.getByRole("log")).toContainText("Alpha response: Follow up on that answer");
  expect(inputs[0].history).toBeUndefined();
  expect(inputs[1].history).toBeUndefined(); expect(inputs[1].conversationId).toBe(inputs[0].conversationId);
  expect(inputs[2].history).toEqual(inputs[1].history); expect(inputs[2].idempotencyKey).toBe(inputs[1].idempotencyKey);
  expect(inputs[1].retryFailed).toBe(false); expect(inputs[2].retryFailed).toBe(true);
  await page.getByRole("textbox", { name: "Message or answer", exact: true }).fill("Unsaved alpha message");
  await picker.selectOption(beta);
  await expect(page.getByRole("alertdialog", { name: "Keep your changes?" })).toBeVisible();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(picker).toHaveValue(alpha);
  await expect(page.getByRole("textbox", { name: "Message or answer", exact: true })).toHaveValue("Unsaved alpha message");
  await picker.selectOption(beta);
  await page.getByRole("button", { name: "Discard changes", exact: true }).click();
  await expect(picker).toHaveValue(beta);
  await expect(page.getByRole("log")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Message or answer", exact: true })).toHaveValue("");
  await send(page, "Fresh beta question");
  await expect(page.getByRole("log")).toContainText("Beta response: Fresh beta question");
  expect(inputs[3].history).toBeUndefined(); expect(inputs[3].campusId).toBe(beta);
  await page.getByRole("button", { name: "Source library", exact: true }).click();
  await expect(page.getByRole("button", { name: /Beta private source/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Alpha private source/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Set up with me", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Let’s get to know your school." });
  await dialog.getByRole("button", { name: "Save & close", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect((await db.schoolAiRecord.findFirstOrThrow({ where: { schoolId, kind: "ONBOARDING" } })).campusId).toBe(beta);
});

test("teacher subject changes clear assistant context and a late prior-scope reply cannot reappear", async ({ page, context }) => {
  await signIn(context, "TEACHER"); await enableLocalAssistant(page);
  const inputs: AssistantInput[] = [];
  let finishSlow: (() => void) | undefined;
  await page.route("**/api/school-ai/assistant", async route => {
    const input = route.request().postDataJSON() as AssistantInput; inputs.push(input);
    if (input.message === "Slow maths reply") await new Promise<void>(resolve => { finishSlow = resolve; });
    await saveProviderReply(input, `Reply for ${input.subjectId}`);
    await route.fulfill({ json: { reply: `Reply for ${input.subjectId}` } }).catch(() => {});
  });
  await page.goto("/ai");
  const picker = page.getByRole("combobox", { name: "Teaching subject", exact: true });
  await picker.selectOption(maths);
  await send(page, "Maths question");
  await expect(page.getByRole("log")).toContainText(`Reply for ${maths}`);
  await send(page, "Slow maths reply");
  await expect.poll(() => inputs.some(input => input.message === "Slow maths reply")).toBe(true);
  await picker.selectOption(science);
  await page.getByRole("button", { name: "Discard changes", exact: true }).click();
  finishSlow?.();
  await expect(picker).toHaveValue(science);
  await expect(page.getByRole("log")).toHaveCount(0);
  await send(page, "Science question");
  await expect(page.getByRole("log")).toContainText(`Reply for ${science}`);
  await expect(page.getByRole("log")).not.toContainText(`Reply for ${maths}`);
  expect(inputs.at(-1)?.subjectId).toBe(science); expect(inputs.at(-1)?.history).toBeUndefined();
});

test("setup help reloads its saved exchanges and guards an unsent message on close", async ({ page, context }) => {
  await signIn(context); await enableLocalAssistant(page);
  const inputs: AssistantInput[] = [];
  await page.route("**/api/school-ai/assistant", async route => { const input = route.request().postDataJSON() as AssistantInput; inputs.push(input); await saveProviderReply(input, `Setup response ${inputs.length}`); await route.fulfill({ json: { reply: `Setup response ${inputs.length}` } }); });
  await page.goto("/ai");
  await page.getByRole("combobox", { name: "Workspace campus", exact: true }).selectOption(alpha);
  await page.getByRole("button", { name: "Set up with me", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Let’s get to know your school." });
  await dialog.getByRole("button", { name: "Ask a question or add a document", exact: true }).click();
  await send(dialog, "Explain the starting options");
  await expect(dialog.getByRole("log")).toContainText("Setup response 1");
  await send(dialog, "Which one matches scanned records?");
  await expect(dialog.getByRole("log")).toContainText("Setup response 2");
  expect(inputs[1].history).toBeUndefined(); expect(inputs[1].conversationId).toBe(inputs[0].conversationId);
  expect(inputs[1].campusId).toBe(alpha);
  await dialog.getByRole("textbox", { name: "Message or answer", exact: true }).fill("Unsent follow-up");
  await dialog.getByRole("button", { name: "Save & close", exact: true }).click();
  await expect(page.getByRole("alertdialog", { name: "Keep your changes?" })).toBeVisible();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(dialog.getByRole("textbox", { name: "Message or answer", exact: true })).toHaveValue("Unsent follow-up");
});

test("private conversation survives reload, archive and resume; a failed reply restores its exact retry after reload", async ({ page, context }) => {
  await signIn(context); await enableLocalAssistant(page);
  const inputs: AssistantInput[] = [];
  let fail = true;
  await page.route("**/api/school-ai/assistant", async route => {
    const input = route.request().postDataJSON() as AssistantInput; inputs.push(input);
    await saveProviderReply(input, "Durable restored answer", fail);
    if (fail) { fail = false; return route.fulfill({ status: 503, json: { error: "Synthetic interruption" } }); }
    await route.fulfill({ json: { reply: "Durable restored answer" } });
  });
  await page.goto("/ai"); await page.getByRole("combobox", { name: "Workspace campus", exact: true }).selectOption(beta);
  await page.getByRole("button", { name: "New conversation", exact: true }).click();
  await send(page, "Recover this exact private request");
  await expect(page.getByText(conversationCopy("en").recovery, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Prepare a response", exact: true })).toBeEnabled();
  await page.reload(); await page.getByRole("combobox", { name: "Workspace campus", exact: true }).selectOption(beta);
  await expect(page.getByRole("textbox", { name: "Message or answer", exact: true })).toHaveValue("Recover this exact private request");
  await page.getByRole("button", { name: "Prepare a response", exact: true }).click();
  await expect(page.getByRole("log")).toContainText("Durable restored answer");
  expect(inputs[1].idempotencyKey).toBe(inputs[0].idempotencyKey); expect(inputs[1].retryFailed).toBe(true);
  await page.getByRole("button", { name: "Archive conversation", exact: true }).click();
  await expect(page.getByText("This conversation is archived. Resume it to send another message.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Resume conversation", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Message or answer", exact: true })).toBeEnabled();
  await expect(page.getByRole("log")).toContainText("Durable restored answer");
});

test("manager delegates one question, teacher submits privately and manager compares and accepts a new unconfirmed draft", async ({ page, context }) => {
  await signIn(context);
  const created = await page.request.post("/api/school-ai/workspace", { headers: { Origin: origin }, data: { kind: "ONBOARDING", title: "Delegated setup fixture", campusId: alpha, idempotencyKey: randomUUID(), data: { path: "new", answers: { schoolName: "Previous school name", country: "Unrelated hidden setup information" }, confirmedKeys: ["schoolName"], step: "profile" } } });
  expect(created.ok(), await created.text()).toBeTruthy(); const record = (await created.json()).record;
  await page.goto("/ai"); await page.getByRole("combobox", { name: "Workspace campus", exact: true }).selectOption(alpha);
  await page.getByRole("button", { name: "Setup follow-ups", exact: true }).click();
  const region = page.getByRole("region", { name: "Setup questions", exact: true });
  await region.getByRole("combobox", { name: "Setup draft", exact: true }).selectOption(record.id);
  await region.getByRole("combobox", { name: "Assigned colleague", exact: true }).selectOption(teacherId);
  await region.getByRole("textbox", { name: "Context for this question", exact: true }).fill("Confirm the school name from the current register.");
  await region.getByRole("button", { name: "Assign question", exact: true }).click();
  await expect(region.getByText("Saved successfully", { exact: true })).toBeVisible();
  const task = await db.schoolAiSetupTask.findFirstOrThrow({ where: { schoolId, recordId: record.id } });
  await signIn(context, "TEACHER"); await page.goto("/ai"); await page.getByRole("button", { name: "Setup follow-ups", exact: true }).click();
  await region.getByRole("button", { name: /What is your school called.*Awaiting answer/ }).click();
  await expect(region).not.toContainText("Unrelated hidden setup information");
  await expect(region.getByRole("combobox", { name: "Setup draft", exact: true })).toHaveCount(0);
  await region.getByRole("textbox", { name: "Proposed answer", exact: true }).fill("Reviewed school name");
  await region.getByRole("button", { name: "Submit answer for review", exact: true }).click();
  await expect(region.getByText("Saved successfully", { exact: true })).toBeVisible();
  expect((await db.schoolAiRecord.findUniqueOrThrow({ where: { id: record.id } })).version).toBe(1);
  const privateResponse = await page.request.get(`/api/school-ai/setup-tasks/${task.id}`); expect(await privateResponse.text()).not.toContain("Unrelated hidden setup information");
  await signIn(context); await page.goto("/ai"); await page.getByRole("combobox", { name: "Workspace campus", exact: true }).selectOption(alpha); await page.getByRole("button", { name: "Setup follow-ups", exact: true }).click();
  await region.getByRole("button", { name: /What is your school called.*Ready for review/ }).click();
  await expect(region.getByText("Previous school name", { exact: true })).toBeVisible();
  await region.getByRole("button", { name: "Accept into setup draft", exact: true }).click();
  await expect(region.getByText("Saved successfully", { exact: true })).toBeVisible();
  const updated = await db.schoolAiRecord.findUniqueOrThrow({ where: { id: record.id } }); expect(updated.version).toBe(2); expect(updated.status).toBe("DRAFT"); expect((updated.data as { confirmedKeys: string[] }).confirmedKeys).toEqual([]);
  await expect(region.getByText("Answer accepted", { exact: false })).toBeVisible();
});

for (const language of ["ar", "ur"] as const) test(`${language} setup question panel and durable assistant use RTL shared controls on mobile`, async ({ page, context }) => {
  await db.user.update({ where: { id: managerId }, data: { preferredLanguage: language } });
  try {
    await signIn(context);
    const created = await page.request.post("/api/school-ai/workspace", { headers: { Origin: origin }, data: { kind: "ONBOARDING", title: `RTL setup ${language}`, campusId: alpha, idempotencyKey: randomUUID(), data: { path: "new", answers: {}, confirmedKeys: [], step: "profile" } } }); expect(created.ok(), await created.text()).toBeTruthy();
    await page.setViewportSize({ width: 360, height: 800 }); await page.goto("/ai");
    const c = schoolAICopy(language), t = setupTaskCopy(language), conversation = conversationCopy(language);
    await page.getByRole("combobox", { name: c.workspaceCampus, exact: true }).selectOption(alpha);
    await expect(page.getByRole("region", { name: conversation.title, exact: true })).toHaveAttribute("dir", "rtl");
    await page.getByRole("navigation").getByRole("button", { name: c.setupTasks, exact: true }).click();
    const region = page.getByRole("region", { name: t.title, exact: true }); await expect(region).toHaveAttribute("dir", "rtl");
    await expect(region.getByRole("combobox", { name: t.record, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
    await region.getByRole("combobox", { name: t.field, exact: true }).selectOption("timezone");
    await region.getByRole("textbox", { name: t.instructions, exact: true }).fill(language === "ar" ? "تحقق من المنطقة الزمنية" : "ٹائم زون کی تصدیق کریں");
    await page.getByRole("button", { name: c.overview, exact: true }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
  } finally { await db.user.update({ where: { id: managerId }, data: { preferredLanguage: "en" } }); }
});

test("editing the first question after a lost create response binds a new creation key", async ({ page, context }) => {
  await signIn(context); await enableLocalAssistant(page);
  const creates: { title: string; idempotencyKey: string }[] = [];
  let loseFirst = true;
  await page.route("**/api/school-ai/conversations", async route => {
    if (route.request().method() !== "POST") return route.continue();
    creates.push(route.request().postDataJSON());
    const saved = await route.fetch();
    expect(saved.ok()).toBeTruthy();
    if (loseFirst) { loseFirst = false; return route.fulfill({ status: 503, json: { error: "Synthetic lost create response" } }); }
    await route.fulfill({ response: saved });
  });
  await page.route("**/api/school-ai/assistant", async route => { const input = route.request().postDataJSON() as AssistantInput; await saveProviderReply(input, "Changed first question answered"); await route.fulfill({ json: { reply: "Changed first question answered" } }); });
  await page.goto("/ai"); await page.getByRole("combobox", { name: "Workspace campus", exact: true }).selectOption(beta); await page.getByRole("button", { name: "New conversation", exact: true }).click();
  await send(page, "Original first question");
  await expect(page.getByRole("region", { name: "Private assistant", exact: true }).getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: "Prepare a response", exact: true })).toBeEnabled();
  await send(page, "Changed first question");
  await expect(page.getByRole("log")).toContainText("Changed first question answered");
  expect(creates).toHaveLength(2); expect(creates[0].idempotencyKey).not.toBe(creates[1].idempotencyKey);
  expect(await db.schoolAiConversation.count({ where: { schoolId, actorId: managerId, title: { in: ["Original first question", "Changed first question"] } } })).toBe(2);
});
