import { test, expect, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { RouteFixtureConfig } from "./remaining-routes.fixture";
const requireTooling = createRequire(createRequire(path.join(process.cwd(), "package.json")).resolve("tsx"));
const { build } = requireTooling("esbuild");
const { compile } = requireTooling("@tailwindcss/node");
const { Scanner } = requireTooling("@tailwindcss/oxide");
let script: string, styles: string;
test.beforeAll(async () => {
  const root = process.cwd();
  const result = await build({ entryPoints: [path.join(root, "tests/design-system/remaining-routes.fixture.tsx")], bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"test"' }, plugins: [{ name: "synthetic-route-boundaries", setup(builder: { onResolve: (options: { filter: RegExp }, callback: (args: { path: string }) => unknown) => void; onLoad: (options: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => unknown) => void }) {
    builder.onResolve({ filter: /^(next\/(navigation|link)|@\/components\/locale\/LocaleProvider)$/ }, args => ({ path: args.path, namespace: "route-stub" }));
    builder.onLoad({ filter: /.*/, namespace: "route-stub" }, args => ({ loader: "jsx", resolveDir: root, contents: args.path === "next/navigation"
      ? 'const router={push:p=>window.__routeNavigation.push(p),replace:p=>window.__routeNavigation.push(p)};export const useRouter=()=>router;export const useSearchParams=()=>new URLSearchParams(location.search);'
      : args.path === "next/link" ? 'import React from "react";export default function Link({children,...props}){return <a {...props}>{children}</a>}'
        : 'export const useLocale=()=>({language:window.__routeFixture.language||"en",timezone:"UTC",weekStartsOn:1});export const useUiText=()=> (text,args=[])=>text.replace(/\\{(\\d+)\\}/g,(_,i)=>String(args[Number(i)]));',
    }));
  } }] });
  script = result.outputFiles[0].text;
  const compiler = await compile(await readFile(path.join(root, "src/app/globals.css"), "utf8"), { base: path.join(root, "src/app"), onDependency() {} });
  styles = compiler.build(new Scanner({ sources: [{ base: root, pattern: "src/components/ui/*.tsx", negated: false }, { base: root, pattern: "src/app/{corrections,onboarding,teacher,dashboard}/**/*.tsx", negated: false }] }).scan());
});
async function mount(page: Page, config: RouteFixtureConfig, width = 390, query = "") {
  const language = config.language || "en";
  await page.setViewportSize({ width, height: 900 });
  await page.route("**/*", route => route.request().isNavigationRequest() ? route.fulfill({ contentType: "text/html", body: `<html lang="${language}" dir="${language === "en" ? "ltr" : "rtl"}"><body><div id="fixture-root"></div></body></html>` }) : route.abort());
  await page.goto(`https://remaining-routes.test/fixture${query}`);
  await page.evaluate(value => { window.__routeFixture = value; }, config);
  await page.addStyleTag({ content: styles }); await page.addScriptTag({ content: script });
}
const record = { id: "fixture-mark", label: "Synthetic student · Mathematics", version: "fixture-version", original: { marksObtained: 40, maximum: 100, isAbsent: false } };
const records = { records: [record], history: [] };
const preview = { hash: "fixture-review", before: record.original, after: { ...record.original, marksObtained: 50 }, separateApprover: true };
async function requests(page: Page) { return page.evaluate(() => window.__routeRequests.filter(r => r.method !== "GET").map(r => ({ ...r, body: JSON.parse(r.body || "null") }))); }
async function noOverflow(page: Page) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true); }

test("correction shared fields retain preview and separate-reviewer request gates and payloads", async ({ page }) => {
  await mount(page, { surface: "corrections", replies: { "GET /api/corrections?kind=MARK": [{ body: records }, { body: records }], "POST /api/corrections": [{ body: preview }, { body: {}, pending: true }] } });
  await page.getByRole("combobox", { name: "Record", exact: true }).selectOption("fixture-mark");
  await page.getByRole("spinbutton", { name: "Value", exact: true }).fill("50");
  await page.getByRole("textbox", { name: "Reason for reviewers" }).fill("Synthetic correction reason");
  await page.getByRole("textbox", { name: "Public explanation" }).fill("Synthetic public explanation");
  await page.getByRole("button", { name: "Review correction", exact: true }).click();
  const submit = page.getByRole("button", { name: "Request correction", exact: true });
  await expect(submit).toBeDisabled();
  await page.getByRole("checkbox", { name: "I reviewed the original, proposed values and consequences" }).check();
  await expect(submit).toBeEnabled(); await submit.click(); await expect(submit).toBeDisabled();
  const captured = await requests(page);
  expect(captured.map(r => r.body)).toEqual([{ action: "preview", proposal: { kind: "MARK", sourceId: "fixture-mark", expectedVersion: "fixture-version", marksObtained: 50, isAbsent: false } }, { action: "request", proposal: { kind: "MARK", sourceId: "fixture-mark", expectedVersion: "fixture-version", marksObtained: 50, isAbsent: false }, reviewHash: "fixture-review", reason: "Synthetic correction reason", publicExplanation: "Synthetic public explanation", privateNote: "" }]);
  await noOverflow(page); await page.screenshot({ path: test.info().outputPath("correction-review-phone.png"), fullPage: true });
});
for (const language of ["ar", "ur"]) test(`correction ${language} remains RTL and standard controls fit a phone`, async ({ page }) => {
  await mount(page, { surface: "corrections", language: "en", replies: { "GET /api/corrections?kind=MARK": [{ body: records }] } });
  await page.getByRole("combobox", { name: "Language" }).selectOption(language);
  await expect(page.locator("main")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("combobox", { name: "Language" })).toHaveClass(/sk-select/);
  await page.locator("select").nth(1).selectOption("fixture-mark");
  await expect(page.getByRole("spinbutton")).toHaveAttribute("max", "100");
  await page.getByRole("button", { name: language === "ar" ? "اختر من تاريخ" : "تاریخ سے منتخب کریں" }).click();
  await expect(page.getByRole("dialog").locator('[dir="rtl"]').first()).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveAccessibleName(language === "ar" ? "اختيار التاريخ" : "تاریخ کا انتخاب");
  await page.keyboard.press("Escape");
  await noOverflow(page);
});
const plan = (type: string, price: number | null) => ({ type, name: type, price, priceLabel: "", features: [], maxStudents: 1000, maxTeachers: 100, maxCampuses: 10, aiCredits: 500, isCustom: type === "ENTERPRISE" });
const catalogue = { plans: { FREE: plan("FREE", 0), BASIC: plan("BASIC", 1000), PRO: plan("PRO", 2000), ENTERPRISE: plan("ENTERPRISE", null) }, currentPlan: "FREE", regionalCurrency: "PKR", priceCurrency: "PKR", catalogueVersion: "fixture-catalogue", commercialTermsVersion: "fixture-terms", regionalPriceDisclosure: "Synthetic prices", paymentMethods: ["SAFEPAY"], bank: null, language: "en" };
for (const width of [390, 1440]) test(`package choices preserve sizing, period and saved-step payload at ${width}px`, async ({ page }) => {
  await mount(page, { surface: "package", replies: { "GET /api/onboarding/package": [{ body: catalogue }], "POST /api/onboarding/package": [{ body: { intentId: "fixture-intent" }, pending: true }] } }, width, "?returnStep=review&campuses=2&enrollment=75");
  await page.getByRole("spinbutton", { name: "Expected campuses" }).fill("3");
  await page.getByRole("button", { name: /Annual/ }).click();
  await expect(page.getByRole("button", { name: /Annual/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Continue with free package" }).click();
  expect((await requests(page))[0].body).toMatchObject({ plan: "FREE", billingPeriod: "annual", expectedCampuses: 3, expectedEnrollment: 75, returnStep: "review" });
  expect((await requests(page))[0].body.idempotencyKey).toEqual(expect.any(String));
  await expect(page.getByRole("button", { name: /Continue with free package/ })).toBeDisabled();
  await noOverflow(page); await page.screenshot({ path: test.info().outputPath(`package-${width}.png`), fullPage: true });
});
for (const width of [390, 1440]) test(`recovery actions keep reset and home contracts at ${width}px`, async ({ page }) => {
  await mount(page, { surface: "error" }, width);
  const retry = page.getByRole("button", { name: "Retry", exact: true });
  await retry.focus(); await expect(retry).toBeFocused();
  expect((await retry.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await retry.press("Enter"); expect(await page.evaluate(() => window.__routeRetries)).toBe(1);
  await expect(page.getByRole("link", { name: "Home", exact: true })).toHaveAttribute("href", "/login");
  await noOverflow(page);
});
const batch = { id: "fixture-batch", campusId: "fixture-campus", kind: "STUDENT_ROSTER", state: "STAGED", expiresAt: "2030-01-01T00:00:00Z", summary: { total: 2, accepted: 1, rejected: 0, skipped: 0, unresolved: 1 }, rows: [
  { rowNumber: 1, source: {}, proposal: { fullName: "Synthetic Accepted", rollNo: "F-1", classId: "fixture-class" }, state: "ACCEPTED", selected: true, matchKey: "fixture-campus:fixture-class:F-1", errors: [] },
  { rowNumber: 2, source: {}, proposal: { fullName: "Synthetic Unresolved", rollNo: "F-2", classId: "fixture-class" }, state: "UNRESOLVED", selected: false, matchKey: null, errors: ["Synthetic review required"] },
] };
for (const width of [390, 1440]) test(`import review table and shared controls retain row decisions at ${width}px`, async ({ page }) => {
  await mount(page, { surface: "import", replies: { "POST /api/import-batches": [{ body: { success: true, data: batch } }], "PATCH /api/import-batches/fixture-batch?campusId=fixture-campus": [{ body: { success: true, data: { ...batch, rows: batch.rows.map(row => ({ ...row, selected: false })) } } }, { body: { success: true, data: batch } }] } }, width);
  await page.getByRole("button", { name: "Open synthetic import" }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "synthetic.csv", mimeType: "text/csv", buffer: Buffer.from("fullName,rollNo\nSynthetic,F-1") });
  const table = page.getByRole("table"); await expect(table).toHaveClass(/sk-data-table/);
  await expect(page.getByRole("combobox", { name: "Class for row 2" })).toHaveClass(/sk-select/);
  await page.getByRole("checkbox", { name: "Include row 1" }).click();
  await expect(page.getByRole("checkbox", { name: "Include row 1" })).not.toBeChecked();
  await page.getByRole("textbox", { name: "Roll number for row 2" }).fill("F-NEW");
  await page.getByRole("textbox", { name: "Roll number for row 2" }).press("Tab");
  await expect.poll(async () => (await requests(page)).length).toBe(3);
  expect((await requests(page)).slice(1).map(r => r.body)).toEqual([{ rows: [{ rowNumber: 1, selected: false }] }, { rows: [{ rowNumber: 2, proposal: { rollNo: "F-NEW" } }] }]);
  expect(await table.evaluate(el => getComputedStyle(el.parentElement!).maxHeight)).toBe("320px");
  await noOverflow(page); await page.screenshot({ path: test.info().outputPath(`import-review-${width}.png`), fullPage: true });
  await page.getByRole("button", { name: "Cancel", exact: true }).click(); await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await requests(page)).some(r => r.url.startsWith("/api/students"))).toBe(false);
});
