import { test, expect, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";

// SKAI-1045: WhatsApp connection panel in mock mode, EN/AR/UR, desktop and phone. Synthetic data only.
const requireTooling = createRequire(createRequire(path.join(process.cwd(), "package.json")).resolve("tsx"));
const { build } = requireTooling("esbuild");
const { compile } = requireTooling("@tailwindcss/node");
const { Scanner } = requireTooling("@tailwindcss/oxide");
const shots = process.env.EVIDENCE_DIR;
let script: string, styles: string;

test.beforeAll(async () => {
  const root = process.cwd();
  const result = await build({
    entryPoints: [path.join(root, "tests/design-system/whatsapp-connection.fixture.tsx")], bundle: true, write: false,
    platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"test"', "process.env": "{}" }, tsconfig: path.join(root, "tsconfig.json"),
    plugins: [{ name: "locale-stub", setup(builder: { onResolve: (o: { filter: RegExp }, cb: (a: { path: string }) => unknown) => void; onLoad: (o: { filter: RegExp; namespace: string }, cb: (a: { path: string }) => unknown) => void }) {
      builder.onResolve({ filter: /^@\/components\/locale\/LocaleProvider$/ }, args => ({ path: args.path, namespace: "stub" }));
      builder.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ loader: "jsx", resolveDir: root, contents:
        'import{translateUi}from"./src/lib/locale/ui-messages";const lang=()=>["ar","ur"].includes(document.documentElement.lang)?document.documentElement.lang:"en";export const useLocale=()=>({language:lang()});export const useUiText=()=>(t,v=[])=>translateUi(t,lang()).replace(/\\{(\\d+)\\}/g,(m,i)=>i in v?String(v[i]):m);export const useLocaleFormat=()=>({dateTime:v=>new Date(v).toISOString().slice(0,16).replace("T"," "),date:v=>String(v).slice(0,10),money:m=>String(m),number:n=>String(n)});' }));
    } }],
  });
  script = result.outputFiles[0].text;
  const compiler = await compile(await readFile(path.join(root, "src/app/globals.css"), "utf8"), { base: path.join(root, "src/app"), onDependency() {} });
  styles = compiler.build(new Scanner({ sources: [{ base: root, pattern: "src/components/ui/*.tsx", negated: false }, { base: root, pattern: "src/components/whatsapp/*.tsx", negated: false }] }).scan());
});

async function mount(page: Page, language: string, status: unknown, width = 1280) {
  await page.setViewportSize({ width, height: 800 });
  await page.route("**/*", route => route.request().isNavigationRequest()
    ? route.fulfill({ contentType: "text/html", body: `<html lang="${language}" dir="${language === "en" ? "ltr" : "rtl"}"><body><div id="fixture-root"></div></body></html>` })
    : route.abort());
  await page.goto("http://whatsapp-fixture.test/admin");
  await page.evaluate(value => { window.__waStatus = value; }, status);
  await page.addStyleTag({ content: styles });
  await page.addScriptTag({ content: script });
}
const mock = { mode: "mock", appId: null, configId: null, connection: null };

test("connect in mock mode, then disconnect with confirmation", async ({ page }) => {
  await mount(page, "en", mock);
  await expect(page.getByText("Not connected")).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/SKAI-1045_01_not_connected_EN.png`, fullPage: true });
  await page.getByRole("button", { name: "Connect with Facebook" }).click();
  await expect(page.getByText("Synthetic School")).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/SKAI-1045_02_connected_EN.png`, fullPage: true });
  await page.getByRole("button", { name: "Disconnect" }).first().click();
  await expect(page.getByText("Disconnect WhatsApp?")).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/SKAI-1045_03_disconnect_confirm_EN.png`, fullPage: true });
  expect(await page.evaluate(() => window.__waPosts)).toEqual([{ action: "connect", code: "mock-code", wabaId: "100000000000001", phoneNumberId: "100000000000002", businessId: "100000000000003" }]);
});

test("unconfigured deployment explains it and disables Connect", async ({ page }) => {
  await mount(page, "en", { ...mock, mode: "disabled" });
  await expect(page.getByRole("button", { name: "Connect with Facebook" })).toBeDisabled();
});

for (const language of ["ar", "ur"]) test(`right-to-left ${language}, desktop and phone`, async ({ page }) => {
  const status = { ...mock, connection: { status: "CONNECTED", wabaId: "100000000000001", phoneNumberId: "100000000000002", displayPhoneNumber: "+92 300 0000002", verifiedName: "Synthetic School", connectedAt: "2026-10-29T08:00:00.000Z", tokenExpiresAt: null } };
  await mount(page, language, status);
  await expect(page.getByText("Synthetic School")).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/SKAI-1045_04_connected_${language.toUpperCase()}.png`, fullPage: true });
  await mount(page, language, status, 390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  if (shots) await page.screenshot({ path: `${shots}/SKAI-1045_05_phone_${language.toUpperCase()}.png`, fullPage: true });
});
