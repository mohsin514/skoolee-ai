import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { assessmentFixture } from "./assessment-fixture";
const database = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== database || process.env.DIRECT_URL !== database) throw new Error("Use only the isolated local school AI test database.");
const db = new PrismaClient();
const tokens = JSON.parse(readFileSync("test-results/school-ai/local-tokens.json", "utf8")) as Record<string, string>;
const school = "school-ai-browser-a", campusId = `${school}-campus`, subjectId = `${school}-subject`, classId = `${school}-class`;
const signIn = (context: BrowserContext, role = "a-ADMIN") => context.addCookies([{ name: "skoolee_token", value: tokens[role], url: "http://localhost:3106", httpOnly: true, sameSite: "Lax" }]);
async function createFixture(page: Page) {
  const fixture = assessmentFixture(subjectId, classId), suffix = crypto.randomUUID().slice(0, 8);
  const create = async (kind: string, title: string, data: unknown, approve: boolean) => {
    const response = await page.request.post("/api/school-ai/workspace", { data: { kind, title, campusId, data, idempotencyKey: crypto.randomUUID() } });
    expect(response.ok(), await response.text()).toBeTruthy(); let record = (await response.json()).record;
    if (approve) { const review = await page.request.patch(`/api/school-ai/workspace/${record.id}`, { data: { version: record.version, action: "approve" } }); expect(review.ok(), await review.text()).toBeTruthy(); record = (await review.json()).record; }
    return record;
  };
  const curriculum = await create("CURRICULUM", `Bank curriculum ${suffix}`, fixture.curriculum, true);
  fixture.paper.curriculumId = curriculum.id; fixture.paper.curriculumVersion = curriculum.version;
  fixture.paper.questions[0].bankMetadata = { tags: [`bank-${suffix}`, "addition"], difficulty: "EASY" };
  const source = await create("PAPER", `Bank source ${suffix}`, fixture.paper, true);
  const target = await create("PAPER", `Bank target ${suffix}`, { ...fixture.paper, blueprint: { ...fixture.paper.blueprint, title: `Bank target ${suffix}` }, questions: [fixture.paper.questions[2]].map((question) => ({ ...question, locked: true })) }, false);
  return { source, target, tag: `bank-${suffix}` };
}
async function openDraft(page: Page, id: string, tab = "Curriculum & papers") {
  await page.goto("/ai"); await page.getByRole("button", { name: tab, exact: true }).click(); await page.locator("select#field-assessment-record").selectOption(id);
}
test.beforeEach(async ({ context }) => { await db.user.update({ where: { id: `${school}-ADMIN` }, data: { preferredLanguage: "en" } }); await signIn(context); });
test.afterAll(async () => { await db.user.update({ where: { id: `${school}-ADMIN` }, data: { preferredLanguage: "en" } }); await db.$disconnect(); });

test("staff filters the approved bank, maps evidence, saves a pinned copy and preserves an existing pinned question", async ({ page, context }) => {
  const fixture = await createFixture(page);
  await openDraft(page, fixture.target.id);
  await page.getByLabel("Tag", { exact: true }).fill(fixture.tag);
  await page.locator("select#field-bank-filter-difficulty").selectOption("EASY");
  await page.getByLabel("Minimum marks", { exact: true }).fill("2"); await page.getByLabel("Maximum marks", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Search bank", exact: true }).click();
  await expect(page.getByRole("button", { name: "Review and reuse", exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Review and reuse", exact: true }).click();
  await expect(page.getByText(/Matching text alone does not establish/)).toHaveCount(0);
  await page.getByLabel("Target section", { exact: true }).selectOption("a");
  await expect(page.getByText(/Matching text alone does not establish/)).toBeVisible();
  const insert = page.getByRole("button", { name: "Insert reviewed copy into draft", exact: true }); await expect(insert).toBeDisabled();
  await page.getByLabel("Map to a current outcome: Add whole numbers", { exact: true }).selectOption("outcome-1");
  await page.getByRole("checkbox", { name: "I reviewed the question, answer, rubric, quoted evidence and outcome mappings against the current curriculum." }).check();
  await insert.click(); await expect(page.getByText("A pinned copy was inserted into your draft. Save and submit it for paper review before use.", { exact: true })).toBeVisible();
  const pinned = page.getByRole("checkbox", { name: "Keep this question fixed during generation", exact: true }); await expect(pinned).toHaveCount(2); await expect(pinned.nth(0)).toBeChecked(); await expect(pinned.nth(1)).toBeChecked();
  const tags = page.getByLabel("Question tags (comma-separated)", { exact: true }); await tags.nth(1).fill("reused, current-unit");
  await page.getByRole("button", { name: "Save draft", exact: true }).click(); await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
  const saved = (await (await page.request.get(`/api/school-ai/workspace/${fixture.target.id}`)).json()).record;
  expect(saved.status).toBe("DRAFT"); expect(saved.data.questions[0]).toEqual(fixture.target.data.questions[0]);
  expect(saved.data.questions[1].reusedFrom).toEqual({ paperId: fixture.source.id, paperVersion: fixture.source.version, questionId: "q1", curriculumId: fixture.source.data.curriculumId, curriculumVersion: fixture.source.data.curriculumVersion });
  expect(saved.data.questions[1].bankMetadata.tags).toEqual(["reused", "current-unit"]);
  await context.clearCookies(); await signIn(context, "a-STUDENT");
  expect((await page.request.get(`/api/school-ai/question-bank?campusId=${campusId}&subjectId=${subjectId}&classId=${classId}`)).status()).toBe(403);
  expect((await page.request.post("/api/school-ai/question-bank/reuse", { data: {} })).status()).toBe(403);
});

test("Arabic and Urdu question-bank controls remain translated and fit a mobile screen", async ({ page }) => {
  const fixture = await createFixture(page);
  for (const [locale, tab, title, find] of [["ar", "المناهج والأوراق", "بنك الأسئلة القابلة لإعادة الاستخدام", "البحث في البنك"], ["ur", "نصاب اور پرچے", "دوبارہ استعمال کے قابل سوالات کا بینک", "بینک میں تلاش کریں"]] as const) {
    await db.user.update({ where: { id: `${school}-ADMIN` }, data: { preferredLanguage: locale } });
    await page.setViewportSize({ width: 390, height: 844 });
    await openDraft(page, fixture.target.id, tab);
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: find, exact: true })).toBeVisible();
    expect(await page.locator("#question-bank-title").evaluate((node) => getComputedStyle(node).direction)).toBe("rtl");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  }
});
