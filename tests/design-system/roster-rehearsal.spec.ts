import { test, expect, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { RosterFixtureConfig } from "./roster-rehearsal.fixture";

const requireTooling = createRequire(createRequire(path.join(process.cwd(), "package.json")).resolve("tsx"));
const { build } = requireTooling("esbuild");
const { compile } = requireTooling("@tailwindcss/node");
const { Scanner } = requireTooling("@tailwindcss/oxide");
const shots = process.env.ROSTER_SHOTS_DIR;
let script: string;
let styles: string;

// Synthetic QA-01 rows shaped as staging classifies them (SKAI-913 fixture: duplicate names, repeated IDs,
// a missing class, Arabic/Urdu names and mixed dates). Contact fields exist only to prove they are not exported.
const source = (fullname: string, rollno: string, extra: Record<string, string> = {}) => ({ fullname, rollno, guardianphone: "+92 3000000009", medicalnotes: "synthetic-medical", ...extra });
const rows = [
  { rowNumber: 2, source: source("عائشة أحمد", "QA-001"), proposal: { fullName: "عائشة أحمد", rollNo: "QA-001", classId: "c1" }, state: "ACCEPTED", selected: true, matchKey: "class:c1/roll:QA-001", matchLabel: "Grade 4 · A", errors: [] },
  { rowNumber: 3, source: source("محمد علی", "QA-002"), proposal: { fullName: "محمد علی", rollNo: "QA-002", classId: "c1" }, state: "ACCEPTED", selected: true, matchKey: "class:c1/roll:QA-002", matchLabel: "Grade 4 · A", errors: [], notes: ["The same name also appears in row 4. Confirm these are different pupils."] },
  { rowNumber: 4, source: source("مُحمد علی", "QA-003"), proposal: { fullName: "مُحمد علی", rollNo: "QA-003", classId: "c1" }, state: "ACCEPTED", selected: true, matchKey: "class:c1/roll:QA-003", matchLabel: "Grade 4 · A", errors: [], notes: ["The same name also appears in row 3. Confirm these are different pupils."] },
  { rowNumber: 5, source: source("Sample Pupil", "QA-010"), proposal: { fullName: "Sample Pupil", rollNo: "QA-010", classId: "c1" }, state: "SKIPPED", selected: false, matchKey: "class:c1/roll:QA-010", matchLabel: "Existing pupil: Sample Pupil", errors: ["This stable class and roll-number key already exists. Review the existing record; it will not be overwritten."] },
  { rowNumber: 6, source: source("Repeat Pupil", "QA-001"), proposal: { fullName: "Repeat Pupil", rollNo: "QA-001", classId: "c1" }, state: "REJECTED", selected: false, matchKey: "class:c1/roll:QA-001", errors: ["rollNo: This file repeats the same class and roll number; choose a corrected file row"] },
  { rowNumber: 7, source: source("Missing Class", "QA-020", { classname: "Grade 9" }), proposal: { fullName: "Missing Class", rollNo: "QA-020", classId: "" }, state: "REJECTED", selected: false, matchKey: null, errors: ['className: No single active class "Grade 9" exists at this campus; create it or correct the file'] },
  { rowNumber: 8, source: source("Date Pupil", "QA-030"), proposal: { fullName: "Date Pupil", rollNo: "QA-030", classId: "c1", dateOfBirth: "03/04/2015" }, state: "REJECTED", selected: false, matchKey: null, errors: ['dateOfBirth: "03/04/2015" could be day/month or month/day; write it as YYYY-MM-DD'] },
  { rowNumber: 9, source: source("Other Class", "QA-040"), proposal: { fullName: "Other Class", rollNo: "QA-040", classId: "c1" }, state: "UNRESOLVED", selected: false, matchKey: "class:c1/roll:QA-040", errors: ["rollNo: This roll number exists in another class at the selected campus; resolve the identity before importing"] },
];
const staged = { id: "00000000-0000-4000-8000-000000000913", campusId: "campus-qa", kind: "STUDENT_ROSTER", state: "STAGED", sourceName: "qa01-roster.csv", createdAt: "2026-10-30T09:00:00.000Z", expiresAt: "2026-11-06T09:00:00.000Z", reviewToken: "synthetic", summary: { total: 8, accepted: 3, rejected: 3, skipped: 1, unresolved: 1 }, rows };

test.beforeAll(async () => {
  const root = process.cwd();
  const result = await build({
    entryPoints: [path.join(root, "tests/design-system/roster-rehearsal.fixture.tsx")], bundle: true, write: false,
    platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"test"', "process.env": "{}" }, tsconfig: path.join(root, "tsconfig.json"),
    plugins: [{ name: "roster-fixture-boundaries", setup(builder: {
      onResolve: (options: { filter: RegExp }, callback: (args: { path: string }) => unknown) => void;
      onLoad: (options: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => unknown) => void;
    }) {
      builder.onResolve({ filter: /^(next\/link|@\/components\/locale\/LocaleProvider)$/ }, args => ({ path: args.path, namespace: "roster-stub" }));
      builder.onLoad({ filter: /.*/, namespace: "roster-stub" }, args => ({ loader: "jsx", resolveDir: root, contents:
        args.path === "next/link" ? 'import React from "react";export default function Link({children,...props}){return <a {...props}>{children}</a>}'
          // The served <html lang> stands in for the server-seeded locale; interface copy uses the real catalog.
          : 'import{translateUi}from"./src/lib/locale/ui-messages";const lang=()=>["ar","ur"].includes(document.documentElement.lang)?document.documentElement.lang:"en";export const useLocale=()=>({language:lang(),timezone:"UTC"});export const useLocaleFormat=()=>({dateTime:(v)=>new Date(v).toISOString().slice(0,16).replace("T"," "),date:(v)=>String(v).slice(0,10),number:(v)=>String(v)});export const useUiText=()=>(text,values=[])=>translateUi(text,lang()).replace(/\\{(\\d+)\\}/g,(m,i)=>i in values?String(values[i]):m);export const LocaleProvider=({children})=>children;export const UiText=({children})=>children;',
      }));
    } }],
  });
  script = result.outputFiles[0].text;
  const compiler = await compile(await readFile(path.join(root, "src/app/globals.css"), "utf8"), { base: path.join(root, "src/app"), onDependency() {} });
  const scanner = new Scanner({ sources: [
    { base: root, pattern: "src/components/ui/*.tsx", negated: false },
    { base: root, pattern: "src/components/students/bulk-import-dialog.tsx", negated: false },
  ] });
  styles = compiler.build(scanner.scan());
});

async function mount(page: Page, config: RosterFixtureConfig, language = "en", width = 1280) {
  await page.setViewportSize({ width, height: width <= 390 ? 844 : 1000 });
  await page.route("**/*", route => route.request().isNavigationRequest()
    ? route.fulfill({ contentType: "text/html", body: `<html lang="${language}" dir="${language === "en" ? "ltr" : "rtl"}"><body><div id="fixture-root"></div></body></html>` })
    : route.abort());
  await page.goto("http://roster-fixture.test/admin");
  await page.evaluate(value => { window.__rosterFixture = value; }, config);
  await page.addStyleTag({ content: styles });
  await page.addScriptTag({ content: script });
}
async function stage(page: Page) {
  await page.locator("input[type=file]").setInputFiles({ name: "qa01-roster.csv", mimeType: "text/csv", buffer: Buffer.from("fullName,rollNo\nSample,QA-1\n") });
}
const snap = (page: Page, name: string) => shots ? page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: true }) : Promise.resolve();

test("rehearsal shows named, reconciling outcome groups and row reasons before any commit", async ({ page }) => {
  await mount(page, { list: [], stage: staged });
  await stage(page);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Rehearsal only")).toBeVisible();
  for (const [label, value] of [["Additions", "3"], ["Existing, unchanged", "1"], ["Excluded", "0"], ["Errors", "3"], ["Unresolved", "1"], ["Total rows", "8"]]) {
    await expect(dialog.locator("dl > div").filter({ hasText: label }).locator("dd")).toHaveText(value);
  }
  await expect(dialog.getByText('No single active class "Grade 9"')).toBeVisible();
  await expect(dialog.getByText("could be day/month or month/day")).toBeVisible();
  await expect(dialog.getByText("The same name also appears in row 4.")).toBeVisible();
  const posts = await page.evaluate(() => window.__rosterRequests.filter(r => r.method !== "GET").map(r => r.url));
  expect(posts).toEqual(["/api/import-batches"]);
  await snap(page, "en-desktop-rehearsal");
});

test("the reconciliation sheet covers every row and leaves out contact and medical data", async ({ page }) => {
  await mount(page, { list: [], stage: staged });
  await stage(page);
  await page.getByRole("button", { name: "Download reconciliation sheet" }).click();
  await expect.poll(() => page.evaluate(() => window.__rosterDownloads.length)).toBe(1);
  const sheet = await page.evaluate(() => window.__rosterDownloads[0]);
  expect(sheet.trim().split("\r\n")).toHaveLength(9);
  expect(sheet).toContain("existing-unchanged");
  expect(sheet).not.toContain("+92 3000000009");
  expect(sheet).not.toContain("synthetic-medical");
});

test("an unfinished rehearsal can be reopened instead of restaged", async ({ page }) => {
  await mount(page, { list: [{ ...staged, rows: undefined }], reopen: staged });
  await expect(page.getByText("Unfinished rehearsal")).toBeVisible();
  await snap(page, "en-desktop-reopen");
  await page.getByRole("button", { name: "Reopen rehearsal" }).click();
  await expect(page.getByText("Rehearsal only")).toBeVisible();
  const urls = await page.evaluate(() => window.__rosterRequests.map(r => r.method + " " + r.url));
  expect(urls).toContain("GET /api/import-batches/" + staged.id);
  expect(urls.some(url => url.startsWith("POST"))).toBe(false);
});

for (const [language, width] of [["ar", 390], ["ur", 820], ["ar", 1280]] as const) {
  test(`rehearsal reads right-to-left in ${language} at ${width}px without horizontal page scroll`, async ({ page }) => {
    await mount(page, { list: [], stage: staged }, language, width);
    await stage(page);
    await expect(page.getByText(language === "ar" ? "معاينة تجريبية فقط" : "صرف آزمائشی جائزہ")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await snap(page, `${language}-${width}-rehearsal`);
  });
}
