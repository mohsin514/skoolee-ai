import { test, expect, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";

// SKAI-1046: managed-sending usage view, EN/AR/UR, desktop and phone. Synthetic data only.
const requireTooling = createRequire(createRequire(path.join(process.cwd(), "package.json")).resolve("tsx"));
const { build } = requireTooling("esbuild");
const { compile } = requireTooling("@tailwindcss/node");
const { Scanner } = requireTooling("@tailwindcss/oxide");
const shots = process.env.EVIDENCE_DIR;
let script: string, styles: string;

test.beforeAll(async () => {
  const root = process.cwd();
  const result = await build({
    entryPoints: [path.join(root, "tests/design-system/whatsapp-managed.fixture.tsx")], bundle: true, write: false,
    platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"test"', "process.env": "{}" }, tsconfig: path.join(root, "tsconfig.json"),
    plugins: [{ name: "locale-stub", setup(builder: { onResolve: (o: { filter: RegExp }, cb: (a: { path: string }) => unknown) => void; onLoad: (o: { filter: RegExp; namespace: string }, cb: (a: { path: string }) => unknown) => void }) {
      builder.onResolve({ filter: /^@\/components\/locale\/LocaleProvider$/ }, args => ({ path: args.path, namespace: "stub" }));
      builder.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ loader: "jsx", resolveDir: root, contents:
        'import{translateUi}from"./src/lib/locale/ui-messages";const lang=()=>["ar","ur"].includes(document.documentElement.lang)?document.documentElement.lang:"en";export const useLocale=()=>({language:lang()});export const useUiText=()=>(t,v=[])=>translateUi(t,lang()).replace(/\\{(\\d+)\\}/g,(m,i)=>i in v?String(v[i]):m);export const useLocaleFormat=()=>({dateTime:v=>new Date(v).toISOString().slice(0,16).replace("T"," "),date:v=>String(v).slice(0,10),money:m=>String(m),number:(n,d=1)=>n.toFixed(d)});' }));
    } }],
  });
  script = result.outputFiles[0].text;
  const compiler = await compile(await readFile(path.join(root, "src/app/globals.css"), "utf8"), { base: path.join(root, "src/app"), onDependency() {} });
  styles = compiler.build(new Scanner({ sources: [{ base: root, pattern: "src/components/ui/*.tsx", negated: false }, { base: root, pattern: "src/components/whatsapp/*.tsx", negated: false }] }).scan());
});

const entries = [
  { id: "e2", kind: "MESSAGE", category: "UTILITY", country: "PK", metaRateMicroUsd: 10000, marginMicroUsd: 2000, amountMicroUsd: 12000, reference: null, createdAt: "2026-10-29T09:00:00.000Z" },
  { id: "e1", kind: "TOP_UP", category: null, country: null, metaRateMicroUsd: 0, marginMicroUsd: 0, amountMicroUsd: 25000000, reference: "INV-SYNTHETIC", createdAt: "2026-10-28T09:00:00.000Z" },
];
const active = { enabled: true, provisioned: true, balanceMicroUsd: 24988000, last30Days: { messages: 1, spentMicroUsd: 12000 }, entries };

async function mount(page: Page, language: string, data: unknown, width = 1280) {
  await page.setViewportSize({ width, height: 800 });
  await page.route("**/*", route => route.request().isNavigationRequest()
    ? route.fulfill({ contentType: "text/html", body: `<html lang="${language}" dir="${language === "en" ? "ltr" : "rtl"}"><body><div id="fixture-root"></div></body></html>` })
    : route.abort());
  await page.goto("http://whatsapp-fixture.test/admin");
  await page.evaluate(value => { window.__managed = value; }, data);
  await page.addStyleTag({ content: styles });
  await page.addScriptTag({ content: script });
}

test("usage view shows balance, last 30 days and the ledger", async ({ page }) => {
  await mount(page, "en", active);
  await expect(page.getByText("USD 24.9880")).toBeVisible();
  await expect(page.getByText("Credit added")).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/SKAI-1046_01_usage_EN.png`, fullPage: true });
});

test("cap reached shows the paused warning", async ({ page }) => {
  await mount(page, "en", { ...active, balanceMicroUsd: 0 });
  await expect(page.getByText(/Credit is used up/)).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/SKAI-1046_02_cap_reached_EN.png`, fullPage: true });
});

test("not provisioned: opting in is disabled", async ({ page }) => {
  await mount(page, "en", { enabled: false, provisioned: false, balanceMicroUsd: 0, last30Days: { messages: 0, spentMicroUsd: 0 }, entries: [] });
  await expect(page.getByRole("button", { name: "Turn on managed sending" })).toBeDisabled();
});

for (const language of ["ar", "ur"]) test(`right-to-left ${language}, desktop and phone`, async ({ page }) => {
  await mount(page, language, active);
  await expect(page.getByText("USD 24.9880")).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/SKAI-1046_03_usage_${language.toUpperCase()}.png`, fullPage: true });
  await mount(page, language, active, 390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  if (shots) await page.screenshot({ path: `${shots}/SKAI-1046_04_phone_${language.toUpperCase()}.png`, fullPage: true });
});
