import { test, expect, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { evaluateExpansionTriggers } from "../../../src/lib/expansion/triggers";

// SKAI-1108 owner expansion-trigger tracker: synthetic observations through the real evaluator, EN/AR/UR, desktop and phone.
const requireTool = createRequire(createRequire(path.join(process.cwd(), "package.json")).resolve("tsx"));
const { build } = requireTool("esbuild"), { compile } = requireTool("@tailwindcss/node"), { Scanner } = requireTool("@tailwindcss/oxide");
const shots = process.env.SCREENSHOT_DIR;
let js: string, css: string;
test.beforeAll(async () => {
  const root = process.cwd();
  const result = await build({ entryPoints: [path.join(root, "tests/design-system/expansion-triggers/fixture.tsx")], outfile: "fixture.js", bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"development"', "process.env": "{}" }, alias: { "@/app/actions/locale": path.join(root, "tests/design-system/component-adoption/locale-mock.ts") } });
  js = result.outputFiles.find((file: { path: string }) => file.path.endsWith(".js")).text;
  const compiler = await compile(await readFile(path.join(root, "src/app/globals.css"), "utf8"), { base: path.join(root, "src/app"), onDependency() {} });
  css = compiler.build(new Scanner({ sources: [{ base: root, pattern: "src/components/**/*.{ts,tsx}", negated: false }, { base: root, pattern: "src/app/owner/expansion/triggers/*.tsx", negated: false }] }).scan());
});

// Synthetic: Rest of UAE met, UK met via any-of, the other two not met (some values not recorded).
const data = { asOf: "2026-10-29", triggers: evaluateExpansionTriggers({ "uae-dubai-go": true, "uae-dubai-paying": 6, "ksa-community-go": true, "gcc-inbound": 2, "uk-gcse-pack": true, "uk-demand": 3, "pk-gcc-arr": false }) };

async function mount(page: Page, language: "en" | "ar" | "ur") {
  page.on("pageerror", (error) => console.log("PAGEERROR", error.message));
  await page.route("**/*", (route) => route.fulfill({ contentType: "text/html", body: `<html lang="${language}" dir="${language === "en" ? "ltr" : "rtl"}"><body><main id="root"></main></body></html>` }));
  await page.route("**/api/owner/expansion-triggers", (route) => route.fulfill({ json: { success: true, data } }));
  await page.goto(`http://expansion-triggers.test/?language=${language}`); await page.addStyleTag({ content: css }); await page.addScriptTag({ content: js });
}

for (const language of ["en", "ar", "ur"] as const) {
  test(`${language}: four markets with metric, threshold and state; phone has no horizontal scroll`, async ({ page }) => {
    await mount(page, language);
    await expect(page.locator("table")).toHaveCount(4);
    await expect(page.locator("tbody tr")).toHaveCount(9);
    expect(data.triggers.map((t) => t.met)).toEqual([true, false, true, false]);
    expect(await page.evaluate(() => document.documentElement.dir)).toBe(language === "en" ? "ltr" : "rtl");
    if (shots) await page.screenshot({ path: `${shots}/SKAI-1108_01_triggers_${language.toUpperCase()}_desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 360, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (shots) await page.screenshot({ path: `${shots}/SKAI-1108_02_triggers_${language.toUpperCase()}_phone.png`, fullPage: true });
  });
}
