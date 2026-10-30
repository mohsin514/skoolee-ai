import { test, expect, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { evaluateGoNoGo } from "../../../src/lib/pilots/go-no-go";
import { papersPerTeacher } from "../../../src/lib/pilots/papers-per-teacher";

// SKAI-1102 owner go/no-go board: GO, HOLD and NO_GO pilots, EN/AR/UR, desktop and phone. Synthetic schools only.
const requireTool = createRequire(createRequire(path.join(process.cwd(), "package.json")).resolve("tsx"));
const { build } = requireTool("esbuild"), { compile } = requireTool("@tailwindcss/node"), { Scanner } = requireTool("@tailwindcss/oxide");
const shots = process.env.SCREENSHOT_DIR, key = process.env.SHOT_KEY ?? "SKAI-1102";
let js: string, css: string;
test.beforeAll(async () => {
  const root = process.cwd();
  const result = await build({ entryPoints: [path.join(root, "tests/design-system/pilot-go-no-go/fixture.tsx")], outfile: "fixture.js", bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"development"', "process.env": "{}" }, alias: { "@/app/actions/locale": path.join(root, "tests/design-system/component-adoption/locale-mock.ts") } });
  js = result.outputFiles.find((file: { path: string }) => file.path.endsWith(".js")).text;
  const compiler = await compile(await readFile(path.join(root, "src/app/globals.css"), "utf8"), { base: path.join(root, "src/app"), onDependency() {} });
  css = compiler.build(new Scanner({ sources: [{ base: root, pattern: "src/components/**/*.{ts,tsx}", negated: false }] }).scan());
});

const m = (value: number | null, withheld: string | null = null) => ({ value, withheld });
// SKAI-1174: teacher usage is the papers-per-teacher metric (8 teachers, 5 with ≥ 2 papers; 1 of 8).
const window = { start: new Date("2026-09-01"), end: new Date("2026-09-29") };
const paper = (id: string, n: number) => Array.from({ length: n }, (_, i) => ({ createdById: id, createdAt: new Date(`2026-09-0${i + 2}`) }));
const teachers = ["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8"];
const busy = papersPerTeacher(teachers, ["t1", "t2", "t3", "t4", "t5"].flatMap((id) => paper(id, 2)), window);
const quiet = papersPerTeacher(teachers, [...paper("t1", 3), ...paper("t2", 1)], window);
const rows = [
  { pilotId: "p1", pilotName: "QA Alpha marks pilot", status: "ACTIVE", synthetic: true, schoolId: "s1", schoolName: "QA Alpha School", result: evaluateGoNoGo({ gate: { allowed: true }, decision: "GO", commercialStage: "PAID_COMMITMENT", teacherUsage: busy, paperAcceptance: m(71.4), taskTimeChange: m(-34.2) }) },
  { pilotId: "p2", pilotName: "QA Beta exam pilot", status: "PLANNED", synthetic: true, schoolId: "s2", schoolName: "QA Beta School", result: evaluateGoNoGo({ gate: { allowed: false, blockers: [{ item: "AI05_STATUS", reason: "AI-05 evidence is missing." }] }, decision: "DEFER", commercialStage: "DEMO_INTEREST", teacherUsage: m(null, "No measured value yet."), paperAcceptance: m(45), taskTimeChange: m(null, "Too few paired observations for a percentage (2 of 5 needed).") }) },
  { pilotId: "p3", pilotName: "QA Solo papers pilot", status: "CLOSED", synthetic: true, schoolId: "s3", schoolName: "QA Solo School", result: evaluateGoNoGo({ gate: { allowed: true }, decision: "STOP", commercialStage: "DECLINED_PAYMENT", teacherUsage: quiet, paperAcceptance: m(25), taskTimeChange: m(4.1) }) },
];

async function mount(page: Page, language: "en" | "ar" | "ur", data: unknown = rows) {
  page.on("pageerror", (error) => console.log("PAGEERROR", error.message));
  await page.route("**/*", (route) => route.fulfill({ contentType: "text/html", body: `<html lang="${language}" dir="${language === "en" ? "ltr" : "rtl"}"><body><main id="root"></main></body></html>` }));
  await page.route("**/api/owner/pilot-go-no-go", (route) => route.fulfill({ json: { success: true, data } }));
  await page.goto(`http://pilot-go-no-go.test/?language=${language}`); await page.addStyleTag({ content: css }); await page.addScriptTag({ content: js });
}

for (const language of ["en", "ar", "ur"] as const) {
  test(`${language}: each pilot shows six criteria and its verdict, phone has no horizontal scroll`, async ({ page }) => {
    await mount(page, language);
    await expect(page.locator("table")).toHaveCount(3);
    await expect(page.locator("tbody tr")).toHaveCount(18);
    expect(rows.map((r) => r.result.verdict)).toEqual(["GO", "HOLD", "NO_GO"]);
    expect([busy.value, quiet.value]).toEqual([62.5, 12.5]);
    expect(await page.evaluate(() => document.documentElement.dir)).toBe(language === "en" ? "ltr" : "rtl");
    if (shots) await page.screenshot({ path: `${shots}/${key}_01_board_${language.toUpperCase()}_desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 360, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (shots) await page.screenshot({ path: `${shots}/${key}_02_board_${language.toUpperCase()}_phone.png`, fullPage: true });
  });
}

test("en: empty board", async ({ page }) => {
  await mount(page, "en", []);
  await expect(page.getByText("No pilot is linked to a school yet.")).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/${key}_03_empty_EN.png`, fullPage: true });
});
