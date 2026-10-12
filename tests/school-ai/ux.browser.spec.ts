import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.beforeEach(async ({ context }) => {
  const tokens = JSON.parse(await readFile("test-results/school-ai/local-tokens.json", "utf8"));
  await context.addCookies([{ name: "skoolee_token", value: tokens["b-ADMIN"], url: "http://localhost:3106", httpOnly: true, sameSite: "Lax" }]);
});

test("switching workspace tabs protects an unsaved source draft", async ({ page }) => {
  await page.goto("/ai");
  await page.getByRole("button", { name: "Source library", exact: true }).click();
  await page.getByRole("button", { name: "Add text manually", exact: true }).click();
  await page.getByRole("textbox", { name: /^Source title/ }).fill("Unsaved synthetic source");
  await page.getByLabel("Extracted or transcribed text", { exact: true }).fill("Keep this draft while I decide where to go.");
  await page.getByRole("button", { name: "Work & review", exact: true }).click();
  await expect(page.getByRole("alertdialog", { name: "Keep your changes?" })).toBeVisible();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(page.getByRole("textbox", { name: /^Source title/ })).toHaveValue("Unsaved synthetic source");
  await page.getByRole("button", { name: "Work & review", exact: true }).click();
  await page.getByRole("button", { name: "Discard changes", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Saved plans", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Source library", exact: true }).click();
  await page.getByRole("button", { name: "Add text manually", exact: true }).click();
  await expect(page.getByRole("textbox", { name: /^Source title/ })).toHaveValue("");
});

test("denied microphone permission preserves the typed draft and provides a usable fallback", async ({ page }) => {
  await page.route("**/api/school-ai/capabilities", route => route.fulfill({ json: { documentUpload: true, documentExtraction: false, voiceTranscription: true, assistant: false, paperGeneration: false, secureBrowser: false, proctoring: false } }));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: () => Promise.reject(new DOMException("Denied for this test", "NotAllowedError")) } });
  });
  await page.goto("/ai");
  const composer = page.getByRole("textbox", { name: "Message or answer", exact: true });
  await composer.fill("Keep my typed question.");
  await page.getByRole("button", { name: "Record a voice message", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "The microphone is unavailable or permission was declined." })).toBeVisible();
  await expect(composer).toHaveValue("Keep my typed question.");
  await expect(composer).toBeEnabled();
});

test("a scanned image loads from the authenticated original route into the review viewer", async ({ page }) => {
  await page.goto("/ai");
  const response = await page.request.post("/api/school-ai/intake", { headers: { Origin: "http://localhost:3106" }, multipart: {
    file: { name: "Synthetic scan.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1cAAAAASUVORK5CYII=", "base64") },
    documentKind: "syllabus", language: "en", campusId: "school-ai-browser-b-campus", origin: "camera",
  } });
  expect(response.ok(), await response.text()).toBeTruthy();
  const { record } = await response.json();
  await page.reload();
  await page.getByRole("button", { name: "Source library", exact: true }).click();
  await page.getByRole("button", { name: new RegExp(record.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).click();
  await expect(page.getByRole("img", { name: "Original image", exact: true })).toBeVisible();
  expect(await page.getByRole("img", { name: "Original image", exact: true }).getAttribute("src")).toMatch(/^blob:/);
  await expect(page.getByRole("link", { name: "Open original file", exact: true })).toHaveAttribute("href", `/api/school-ai/sources/${record.id}/file`);
});

test("a manual planning brief can gain real steps and reach reviewed approval", async ({ page }) => {
  await page.goto("/ai");
  await page.getByRole("button", { name: "Work & review", exact: true }).click();
  await page.getByRole("button", { name: "Create planning brief", exact: true }).click();
  await page.getByRole("textbox", { name: /^Title/ }).fill(`Synthetic reviewable brief ${Date.now()}`);
  await page.getByRole("textbox", { name: /^Desired outcome/ }).fill("Prepare the term review without publishing it.");
  await page.getByRole("button", { name: "Add a proposed step", exact: true }).click();
  await page.getByRole("textbox", { name: "1. Title", exact: true }).fill("Collect the approved teaching coverage.");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("button", { name: "Approve reviewed record", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Approve reviewed record", exact: true }).click();
  await expect(page.getByRole("button", { name: "Approve reviewed record", exact: true })).toBeDisabled();
});

test("closing an unchanged approved setup preserves its approval and version", async ({ page }) => {
  await page.goto("/ai");
  const answers = { schoolName: "Synthetic approved setup", country: "Pakistan", timezone: "Asia/Karachi", campuses: "Learning campus", grades: "Grade 8", academicYear: "2026", startDate: "2026-01-01", endDate: "2026-12-31", workingDays: "Monday to Friday", firstOutcome: "exams", curriculum: "Approved synthetic syllabus", assessmentPolicy: "Teacher review before publication", communications: "Review updates before sending" };
  const created = await page.request.post("/api/school-ai/workspace", { headers: { Origin: "http://localhost:3106" }, data: { kind: "ONBOARDING", title: "Synthetic approved setup", campusId: "school-ai-browser-b-campus", idempotencyKey: crypto.randomUUID(), data: { path: "new", answers, confirmedKeys: Object.keys(answers), step: "review", currentQuestion: "communications" } } });
  expect(created.ok(), await created.text()).toBeTruthy();
  const { record } = await created.json();
  await page.reload();
  await page.getByRole("button", { name: "Continue setup", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Let’s get to know your school." });
  await dialog.getByRole("button", { name: "Approve reviewed record", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Approved", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Save & close", exact: true }).first().click();
  await expect(dialog).not.toBeVisible();
  const current = await page.request.get("/api/school-ai/workspace");
  const saved = (await current.json()).records.find((item: { id: string }) => item.id === record.id);
  expect(saved.status).toBe("APPROVED");
  expect(saved.version).toBe(record.version + 1);
});
