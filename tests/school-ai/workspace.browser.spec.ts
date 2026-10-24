import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

const localDatabase = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== localDatabase || process.env.DIRECT_URL !== localDatabase) throw new Error("Use only the isolated School AI test database.");
const db = new PrismaClient();
const school = "school-ai-browser-a";
async function signIn(context: BrowserContext, role = "ADMIN", suffix = "a") {
  const tokens = JSON.parse(await readFile("test-results/school-ai/local-tokens.json", "utf8"));
  await context.addCookies([{ name: "skoolee_token", value: tokens[`${suffix}-${role}`], url: "http://localhost:3106", httpOnly: true, sameSite: "Lax" }]);
}
async function overview(page: Page) {
  await page.goto("/ai");
  await expect(page.getByRole("heading", { name: "Less administration. More education." })).toBeVisible();
}
test.beforeEach(async ({ context }) => {
  await db.user.update({ where: { id: `${school}-ADMIN` }, data: { preferredLanguage: "en" } });
  await signIn(context);
});
test.afterAll(async () => { await db.user.update({ where: { id: `${school}-ADMIN` }, data: { preferredLanguage: "en" } }); await db.$disconnect(); });

test("workspace renders shared UI and a true fullscreen, saved setup", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await overview(page);
  await page.screenshot({ path: "test-results/school-ai/overview-en.png", fullPage: true });
  await page.getByRole("button", { name: /Set up with me|Continue setup/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "Let’s get to know your school." });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box?.width).toBe(1440); expect(box?.height).toBe(1000); expect(box?.x).toBe(0); expect(box?.y).toBe(0);
  await page.screenshot({ path: "test-results/school-ai/setup-en.png", fullPage: true });
  if (await dialog.getByRole("heading", { name: "Where are you starting from?" }).isVisible()) await dialog.getByRole("button", { name: "Save & continue" }).click();
  await expect(dialog.getByRole("heading", { name: "What is your school called?" })).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Your answer" })).toHaveValue("Synthetic Academy a");
  await dialog.getByRole("button", { name: "Save & close" }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Continue setup" }).first().click();
  await expect(dialog.getByRole("textbox", { name: "Your answer" })).toHaveValue("Synthetic Academy a");
  await dialog.getByRole("textbox", { name: "Your answer" }).fill("Unsaved synthetic change");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("alertdialog")).toBeVisible();
  expect(errors).toEqual([]);
});

test("manual source stays editable, persists, then requires explicit review", async ({ page }) => {
  await overview(page);
  await page.getByRole("button", { name: "Source library", exact: true }).click();
  await page.getByRole("button", { name: "Add text manually", exact: true }).click();
  const title = `Synthetic source ${Date.now()}`;
  await page.getByRole("textbox", { name: /^Source title/ }).fill(title);
  await page.getByLabel("Extracted or transcribed text", { exact: true }).fill("Compare and order positive and negative integers.");
  await page.getByRole("checkbox", { name: "I compared this text with its" }).check();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("button", { name: "Approve reviewed record", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Approve reviewed record", exact: true }).click();
  await expect(page.getByRole("button", { name: "Approve reviewed record", exact: true })).toBeDisabled();
  await page.reload();
  await page.getByRole("button", { name: "Source library", exact: true }).click();
  await page.getByRole("button", { name: new RegExp(title) }).click();
  await expect(page.getByLabel("Extracted or transcribed text", { exact: true })).toHaveValue("Compare and order positive and negative integers.");
});

test("Arabic and Urdu layouts fit mobile and retain real translated controls", async ({ page }) => {
  for (const [language, headline, setup] of [["ar", "إدارة أقل. تعليم أكثر.", /لنُعدّ المدرسة معًا|متابعة الإعداد/], ["ur", "انتظامی کام کم۔ تعلیم پر توجہ زیادہ۔", /میرے ساتھ ترتیب دیں|ترتیب جاری رکھیں/]] as const) {
    await db.user.update({ where: { id: `${school}-ADMIN` }, data: { preferredLanguage: language } });
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/ai");
    await expect(page.getByRole("heading", { name: headline })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: `test-results/school-ai/overview-${language}.png`, fullPage: true });
    await page.getByRole("button", { name: setup }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(await page.getByRole("dialog").evaluate(element => getComputedStyle(element.firstElementChild!).direction)).toBe("rtl");
    await page.screenshot({ path: `test-results/school-ai/setup-${language}.png`, fullPage: true });
    expect(await page.getByRole("dialog").evaluate(element => element.scrollWidth <= element.clientWidth)).toBeTruthy();
  }
});

test("real upload is private, replay-safe, scoped and remains pending review", async ({ page, browser }) => {
  await overview(page);
  const upload = () => page.request.post("/api/school-ai/intake", { headers: { Origin: "http://localhost:3106" }, multipart: { file: { name: "Synthetic curriculum.txt", mimeType: "text/plain", buffer: Buffer.from("Integers: compare positive and negative numbers.") }, documentKind: "syllabus", language: "en", campusId: `${school}-campus`, origin: "upload" } });
  const response = await upload();
  expect(response.ok(), await response.text()).toBeTruthy();
  const { record } = await response.json();
  expect(record.status).toBe("DRAFT"); expect(record.data.extractionStatus).toBe("needs_review");
  const replay = await upload(); expect(replay.ok()).toBeTruthy(); expect((await replay.json()).record.id).toBe(record.id);
  const original = await page.request.get(`/api/school-ai/sources/${record.id}/file`);
  expect(original.ok()).toBeTruthy(); expect(original.headers()["content-disposition"]).toContain("attachment;");
  expect(await original.text()).toBe("Integers: compare positive and negative numbers.");
  const other = await browser.newContext({ baseURL: "http://localhost:3106" });
  await signIn(other, "ADMIN", "b");
  expect((await other.request.get(`/api/school-ai/sources/${record.id}/file`)).status()).toBe(404);
  await other.close();
});
