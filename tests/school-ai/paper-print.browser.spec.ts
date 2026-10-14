import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { assessmentFixture } from "./assessment-fixture";
import type { AssessmentLocale } from "../../src/lib/school-ai/assessment";

const database = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== database || process.env.DIRECT_URL !== database) throw new Error("Use only the isolated School AI test database.");
const db = new PrismaClient();
const tokens = JSON.parse(readFileSync("test-results/school-ai/local-tokens.json", "utf8")) as Record<string, string>;
const school = "school-ai-browser-a", campusId = `${school}-campus`;
const signIn = (context: BrowserContext, role = "a-ADMIN") => context.addCookies([{ name: "skoolee_token", value: tokens[role], url: "http://localhost:3106", httpOnly: true, sameSite: "Lax" }]);
async function createPaper(page: Page, language: AssessmentLocale = "en", long = false) {
  const fixture = assessmentFixture(`${school}-subject`, `${school}-class`);
  const create = async (kind: string, data: unknown) => {
    const response = await page.request.post("/api/school-ai/workspace", { data: { kind, title: `Print QA ${kind} ${crypto.randomUUID().slice(0, 8)}`, campusId, data, idempotencyKey: crypto.randomUUID() } });
    expect(response.ok(), await response.text()).toBeTruthy();
    let record = (await response.json()).record;
    const approval = await page.request.patch(`/api/school-ai/workspace/${record.id}`, { data: { version: record.version, action: "approve" } });
    expect(approval.ok(), await approval.text()).toBeTruthy(); record = (await approval.json()).record; return record;
  };
  const curriculum = await create("CURRICULUM", fixture.curriculum);
  fixture.paper.curriculumId = curriculum.id; fixture.paper.curriculumVersion = curriculum.version; fixture.paper.language = language;
  fixture.paper.blueprint.title = { en: "Mathematics - candidate paper", ar: "الرياضيات - ورقة الطالب", ur: "ریاضی - طالب علم کا پرچہ" }[language];
  fixture.paper.blueprint.instructions = { en: "Read carefully. Explain your method in the space provided.", ar: "اقرأ الأسئلة بعناية. اشرح طريقتك في المساحة المخصصة.", ur: "سوالات غور سے پڑھیں۔ دی گئی جگہ میں اپنا طریقہ واضح کریں۔" }[language];
  if (long) {
    const prompt = { en: "Explain how addition combines quantities. Show your working and describe each step clearly.", ar: "اشرح كيف يجمع الجمع بين الكميات. وضح خطوات الحل واشرح كل خطوة بوضوح.", ur: "وضاحت کریں کہ جمع مقداروں کو کیسے ملاتی ہے۔ اپنا حل لکھیں اور ہر قدم کی وضاحت کریں۔" }[language];
    fixture.paper.blueprint.totalMarks = 18;
    fixture.paper.blueprint.sections = [{ ...fixture.paper.blueprint.sections[1], questionCount: 6, answerCount: 6 }];
    fixture.paper.questions = Array.from({ length: 6 }, (_, index) => ({ ...fixture.paper.questions[2], id: `print-${index}`, prompt: `${index + 1}. ${Array.from({ length: index === 2 ? 52 : 4 }, () => prompt).join("\n")}` }));
  }
  for (const question of fixture.paper.questions) { question.modelAnswer = "SECRET_MODEL_ANSWER"; question.rubric[0].criterion = "SECRET_RUBRIC"; }
  return create("PAPER", fixture.paper);
}
test.beforeEach(async ({ context }) => { await db.user.update({ where: { id: `${school}-ADMIN` }, data: { preferredLanguage: "en" } }); await signIn(context); });
test.afterAll(async () => { await db.user.update({ where: { id: `${school}-ADMIN` }, data: { preferredLanguage: "en" } }); await db.$disconnect(); });

test("approved candidate HTML enforces current version, tenant and role without exposing keys", async ({ page, context }) => {
  const record = await createPaper(page);
  const url = `/api/school-ai/workspace/${record.id}/print?version=${record.version}`;
  const response = await page.request.get(url);
  expect(response.ok()).toBeTruthy(); expect(response.headers()["cache-control"]).toContain("no-store"); expect(response.headers()["content-security-policy"]).toContain("default-src 'none'");
  const html = await response.text(); expect(html).not.toMatch(/SECRET_|correctOptionId|sourceRefs/);
  expect((await page.request.get(url.replace(`version=${record.version}`, "version=1"))).status()).toBe(409);
  expect((await page.request.get(url.replace(`version=${record.version}`, "version=no"))).status()).toBe(400);
  for (const role of ["b-ADMIN", "a-STUDENT", "a-TEACHER"]) { await context.clearCookies(); await signIn(context, role); expect([403, 404]).toContain((await page.request.get(url)).status()); }
  await context.clearCookies(); await signIn(context);
  const edited = await page.request.patch(`/api/school-ai/workspace/${record.id}`, { data: { version: record.version, action: "save", title: "Changed approved paper" } }); expect(edited.ok()).toBeTruthy();
  expect((await page.request.get(url)).status()).toBe(409);
});

test("the print button fetches the approved server projection and closes a stale preview", async ({ page, context }) => {
  const record = await createPaper(page);
  await context.addInitScript(() => { window.print = () => { document.body.dataset.printRequested = "yes"; }; });
  await page.goto("/ai"); await page.getByRole("button", { name: "Curriculum & papers", exact: true }).click(); await page.locator("select#field-assessment-record").selectOption(record.id);
  const popupPromise = context.waitForEvent("page"); await page.getByRole("button", { name: "Print candidate paper", exact: true }).click(); const popup = await popupPromise;
  await expect(popup.getByRole("heading", { name: "Mathematics - candidate paper", exact: true })).toBeVisible();
  await expect(popup.locator("body")).toHaveAttribute("data-print-requested", "yes"); expect(await popup.content()).not.toContain("SECRET_"); await popup.close();
  await page.request.patch(`/api/school-ai/workspace/${record.id}`, { data: { version: record.version, action: "save", title: "New revision" } });
  const stalePromise = context.waitForEvent("page"); await page.getByRole("button", { name: "Print candidate paper", exact: true }).click(); const stale = await stalePromise;
  await expect(page.getByText("This paper changed. Reload and select the current approved version before printing.", { exact: true })).toBeVisible(); await expect.poll(() => stale.isClosed()).toBeTruthy();
});

test("long English, Arabic and Urdu candidate papers remain printable and fit mobile widths", async ({ page }) => {
  mkdirSync("test-results/school-ai/print", { recursive: true });
  for (const language of ["en", "ar", "ur"] as const) {
    const record = await createPaper(page, language, true);
    await page.goto(`/api/school-ai/workspace/${record.id}/print?version=${record.version}`);
    await expect(page.locator("article.question")).toHaveCount(6);
    expect(await page.locator("html").getAttribute("dir")).toBe(language === "en" ? "ltr" : "rtl");
    expect(await page.content()).not.toContain("SECRET_");
    await page.setViewportSize({ width: 360, height: 800 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.pdf({ path: `test-results/school-ai/print/candidate-${language}.pdf`, format: "A4", preferCSSPageSize: true, printBackground: true });
  }
});
