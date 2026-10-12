import { test, expect, type Page, type Locator, type BrowserContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import { createHash, randomUUID } from "node:crypto";

const database = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== database || process.env.DIRECT_URL !== database) throw new Error("Use only the isolated School AI test database.");
const db = new PrismaClient();
const schoolId = `ai-scope-browser-${randomUUID()}`, alpha = `${schoolId}-a`, beta = `${schoolId}-b`;
const managerId = `${schoolId}-manager`, teacherId = `${schoolId}-teacher`, classId = `${schoolId}-class`, maths = `${schoolId}-maths`, science = `${schoolId}-science`;
const origin = "http://localhost:3106";
const tokens: Record<string, string> = {};
type AssistantInput = { message: string; campusId: string; subjectId?: string; classId?: string; history: { role: string; text: string }[]; idempotencyKey: string; retryFailed: boolean };

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
test.afterAll(async () => { await db.school.deleteMany({ where: { id: schoolId } }); await db.$disconnect(); });
async function signIn(context: BrowserContext, role = "SUPER_ADMIN") {
  await context.addCookies([{ name: "skoolee_token", value: tokens[role], url: origin, httpOnly: true, sameSite: "Lax" }]);
}
async function enableLocalAssistant(page: Page) {
  await page.route("**/api/school-ai/capabilities", route => route.fulfill({ json: { documentUpload: true, documentExtraction: false, voiceTranscription: false, assistant: true, paperGeneration: false, secureBrowser: false, proctoring: false } }));
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
    if (input.message === "Follow up on that answer" && !failed) { failed = true; return route.fulfill({ status: 503, json: { error: "Synthetic unavailable response" } }); }
    await route.fulfill({ json: { reply: input.campusId === alpha ? `Alpha response: ${input.message}` : `Beta response: ${input.message}` } });
  });
  for (const [campusId, title] of [[alpha, "Alpha private source"], [beta, "Beta private source"]]) {
    const result = await page.request.post("/api/school-ai/workspace", { headers: { Origin: origin }, data: { kind: "SOURCE", title, campusId, idempotencyKey: randomUUID(), data: { documentKind: "other", fileName: `${title}.txt`, mimeType: "text/plain", origin: "manual", extractedText: title, extractionStatus: "manual", uncertainties: [] } } });
    expect(result.ok(), await result.text()).toBeTruthy();
  }
  await page.goto("/ai");
  const picker = page.getByRole("combobox", { name: "Workspace campus", exact: true });
  await expect(picker).toHaveValue("");
  await expect(page.getByRole("textbox", { name: "Message or answer", exact: true })).toBeDisabled();
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
  expect(inputs[0].history).toEqual([]);
  expect(inputs[1].history).toEqual([{ role: "user", text: "First alpha question" }, { role: "assistant", text: "Alpha response: First alpha question" }]);
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
  expect(inputs[3].history).toEqual([]); expect(inputs[3].campusId).toBe(beta);
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
  expect(inputs.at(-1)?.subjectId).toBe(science); expect(inputs.at(-1)?.history).toEqual([]);
});

test("setup help sends its earlier successful pair and guards an unsent message on close", async ({ page, context }) => {
  await signIn(context); await enableLocalAssistant(page);
  const inputs: AssistantInput[] = [];
  await page.route("**/api/school-ai/assistant", async route => { const input = route.request().postDataJSON() as AssistantInput; inputs.push(input); await route.fulfill({ json: { reply: `Setup response ${inputs.length}` } }); });
  await page.goto("/ai");
  await page.getByRole("combobox", { name: "Workspace campus", exact: true }).selectOption(alpha);
  await page.getByRole("button", { name: "Set up with me", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Let’s get to know your school." });
  await dialog.getByRole("button", { name: "Ask a question or add a document", exact: true }).click();
  await send(dialog, "Explain the starting options");
  await expect(dialog.getByRole("log")).toContainText("Setup response 1");
  await send(dialog, "Which one matches scanned records?");
  await expect(dialog.getByRole("log")).toContainText("Setup response 2");
  expect(inputs[1].history).toEqual([{ role: "user", text: inputs[0].message }, { role: "assistant", text: "Setup response 1" }]);
  expect(inputs[1].campusId).toBe(alpha);
  await dialog.getByRole("textbox", { name: "Message or answer", exact: true }).fill("Unsent follow-up");
  await dialog.getByRole("button", { name: "Save & close", exact: true }).click();
  await expect(page.getByRole("alertdialog", { name: "Keep your changes?" })).toBeVisible();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(dialog.getByRole("textbox", { name: "Message or answer", exact: true })).toHaveValue("Unsent follow-up");
});
