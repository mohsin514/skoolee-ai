import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { assessmentFixture } from "./assessment-fixture";

const database = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== database || process.env.DIRECT_URL !== database) throw new Error("Use only the isolated School AI test database.");
const db = new PrismaClient();
const actor = "school-ai-browser-a-ADMIN";
const evidence = "test-results/ai-review";

async function screenshot(page: Page, name: string) {
  await expect(page.locator('[aria-hidden="true"][class*="z-[9999]"]')).toHaveCount(0);
  await page.screenshot({ path: `${evidence}/${name}.png`, animations: "disabled" });
}

async function signIn(context: BrowserContext, role = "ADMIN") {
  const tokens = JSON.parse(await readFile("test-results/school-ai/local-tokens.json", "utf8"));
  await context.addCookies([{ name: "skoolee_token", value: tokens[`a-${role}`], url: "http://localhost:3106", httpOnly: true, sameSite: "Lax" }]);
}
test.beforeEach(async ({ context }) => {
  await db.user.update({ where: { id: actor }, data: { preferredLanguage: "en" } });
  await signIn(context);
});
test.afterAll(async () => {
  await db.user.update({ where: { id: actor }, data: { preferredLanguage: "en" } });
  await db.$disconnect();
});

test("sample workflows run, edit and download without calling AI or saving school records", async ({ page }) => {
  const writes: string[] = [];
  page.on("request", request => { if (request.method() === "POST" && request.url().includes("/api/school-ai/")) writes.push(request.url()); });
  await page.goto("/ai");
  const demo = page.locator("[data-ai-sample-workflow]").first();
  await demo.getByRole("button", { name: "Try sample demo", exact: true }).click();
  await expect(demo.locator("[data-ai-sample-result]")).toContainText("sample", { ignoreCase: true });
  await demo.getByRole("textbox", { name: "What would you like to try?", exact: true }).fill("Create a sample exam paper");
  await demo.getByRole("button", { name: "Run sample workflow", exact: true }).click();
  await expect(demo.getByText("Show answer and marking guide", { exact: true }).first()).toBeVisible();
  await demo.getByRole("button", { name: "Curriculum", exact: true }).click();
  await demo.getByRole("button", { name: "Run sample workflow", exact: true }).click();
  await expect(demo.getByRole("heading", { name: "Learning outcomes" })).toBeVisible();
  await demo.getByRole("button", { name: "Exam paper", exact: true }).click();
  await demo.getByRole("button", { name: "Run sample workflow", exact: true }).click();
  await demo.getByText("Show answer and marking guide", { exact: true }).first().click();
  await expect(demo.locator("details[open]")).not.toBeEmpty();
  await demo.getByRole("button", { name: "Edit sample draft", exact: true }).click();
  const editor = demo.getByRole("textbox", { name: "Edit sample draft", exact: true });
  await editor.fill("Edited fictional assessment — 2 questions, 4 marks.");
  const download = page.waitForEvent("download");
  await demo.getByRole("button", { name: "Download sample", exact: true }).click();
  const file = await download;
  expect(await readFile((await file.path())!, "utf8")).toContain("Edited fictional assessment");
  expect(writes).toEqual([]);
  await screenshot(page, "sample-edit-download");
});

test("provider failure preserves the typed prompt and offers a local sample", async ({ page }) => {
  await page.route("**/api/school-ai/assistant", route => route.fulfill({ status: 503, json: { error: "The AI service is unavailable right now. Please try again shortly." } }));
  await page.goto("/ai");
  await page.getByRole("button", { name: "New conversation", exact: true }).click();
  const composer = page.getByRole("textbox", { name: "Message or answer", exact: true });
  await composer.fill("Prepare a synthetic school readiness checklist.");
  await page.getByRole("button", { name: "Prepare a response", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "unavailable" })).toBeVisible();
  await expect(composer).toHaveValue("Prepare a synthetic school readiness checklist.");
  const fallback = page.locator("[data-ai-sample-workflow]").last();
  await fallback.getByRole("button", { name: "Try sample demo", exact: true }).click();
  await expect(fallback.locator("[data-ai-sample-result]")).toBeVisible();
  await expect(composer).toHaveValue("Prepare a synthetic school readiness checklist.");
  await fallback.scrollIntoViewIfNeeded();
  await screenshot(page, "provider-failure-sample");
});

test("sample is available when workspace data cannot load", async ({ page }) => {
  await page.route(/\/api\/school-ai\/workspace(?:\?.*)?$/, route => route.fulfill({ status: 503, json: { error: "Temporarily unavailable" } }));
  await page.goto("/ai");
  await page.getByRole("button", { name: "Try sample demo", exact: true }).click();
  await expect(page.locator("[data-ai-sample-result]")).toBeVisible();
});

test("paper generation can be cancelled while its editor is disabled", async ({ page }) => {
  const fixture = assessmentFixture("school-ai-browser-a-subject", "school-ai-browser-a-class");
  const headers = { Origin: "http://localhost:3106" };
  const created = await page.request.post("/api/school-ai/workspace", { headers, data: { kind: "CURRICULUM", campusId: "school-ai-browser-a-campus", title: "Synthetic cancellation check", data: fixture.curriculum, idempotencyKey: randomUUID() } });
  expect(created.ok()).toBe(true);
  const curriculum = (await created.json()).record;
  const approved = await page.request.patch(`/api/school-ai/workspace/${curriculum.id}`, { headers, data: { version: curriculum.version, action: "approve" } });
  expect(approved.ok()).toBe(true);
  const current = (await approved.json()).record;
  const saved = await page.request.post("/api/school-ai/workspace", { headers, data: { kind: "PAPER", campusId: "school-ai-browser-a-campus", title: "Synthetic cancellable paper", data: { ...fixture.paper, curriculumId: current.id, curriculumVersion: current.version }, idempotencyKey: randomUUID() } });
  expect(saved.ok()).toBe(true);
  const paper = (await saved.json()).record;
  let release!: () => void;
  const paused = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/school-ai/generate-paper/stream", async route => { await paused; await route.abort().catch(() => undefined); });
  await page.goto("/ai");
  await page.getByRole("button", { name: "Curriculum & papers", exact: true }).click();
  await page.getByRole("combobox", { name: "Choose…", exact: true }).selectOption(paper.id);
  await page.getByRole("button", { name: "Generate proposed questions", exact: true }).click();
  const cancel = page.getByRole("button", { name: "Cancel generation", exact: true });
  await expect(cancel).toBeEnabled();
  expect(await cancel.evaluate(element => element.closest("fieldset[disabled]"))).toBeNull();
  await cancel.click();
  release();
  await expect(page.getByRole("status").filter({ hasText: "Generation cancelled" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate proposed questions", exact: true })).toBeEnabled();
});

test("desktop navigation has a visible active state and each workflow opens", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/ai");
  const overview = page.getByRole("button", { name: "Overview", exact: true });
  await expect(overview).toHaveAttribute("aria-pressed", "true");
  expect(await overview.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
  await overview.scrollIntoViewIfNeeded();
  await screenshot(page, "after-navigation-desktop");
  for (const name of ["People & resources", "School operations", "Finance operations", "Workflow runs", "Source library", "Curriculum & papers", "Academic setup", "Timetable setup", "Announcements", "Exam planning", "Fee invoices", "Setup follow-ups", "Work & review", "School policies", "School knowledge", "History & comparison"]) {
    const button = page.getByRole("button", { name, exact: true });
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
  }
  expect(errors).toEqual([]);
});

test("EN AR UR mobile tools and samples fit the screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [language, open, toolLabel] of [["en", "Try sample demo", "Choose a workspace tool"], ["ar", "جرّب العرض النموذجي", "اختر أداة في مساحة العمل"], ["ur", "نمونہ ڈیمو آزمائیں", "ورک اسپیس ٹول منتخب کریں"]] as const) {
    await db.user.update({ where: { id: actor }, data: { preferredLanguage: language } });
    await page.goto("/ai");
    const navigation = page.getByRole("combobox", { name: toolLabel, exact: true });
    await expect(navigation).toBeVisible();
    await navigation.selectOption("sources");
    await expect(navigation).toHaveValue("sources");
    const demo = page.locator("[data-ai-sample-workflow]").first();
    await demo.getByRole("button", { name: open, exact: true }).click();
    await expect(demo.locator("[data-ai-sample-result]")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await demo.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await demo.scrollIntoViewIfNeeded();
    await screenshot(page, `sample-${language}-mobile`);
  }
});
