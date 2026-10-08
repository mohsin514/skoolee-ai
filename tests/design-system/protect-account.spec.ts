import { test, expect, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { MfaFixtureConfig } from "./protect-account.fixture";

const requireTooling = createRequire(createRequire(path.join(process.cwd(), "package.json")).resolve("tsx"));
const { build } = requireTooling("esbuild");
const { compile } = requireTooling("@tailwindcss/node");
const { Scanner } = requireTooling("@tailwindcss/oxide");
let script: string;
let styles: string;
const enrolled = { enrolled: true, school: "Synthetic School", awaitingAcknowledgement: false };
const unenrolled = { ...enrolled, enrolled: false };
const secret = "SYNTHETIC-SECRET-NOT-A-VALID-KEY";
const codes = ["SYNTHETIC-RECOVERY-ONE", "SYNTHETIC-RECOVERY-TWO"];

test.beforeAll(async () => {
  const root = process.cwd();
  const result = await build({
    entryPoints: [path.join(root, "tests/design-system/protect-account.fixture.tsx")], bundle: true, write: false,
    platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"test"' },
    plugins: [{ name: "mfa-fixture-boundaries", setup(builder: {
      onResolve: (options: { filter: RegExp }, callback: (args: { path: string }) => unknown) => void;
      onLoad: (options: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => unknown) => void;
    }) {
      builder.onResolve({ filter: /^(next\/(navigation|link)|@\/components\/locale\/LocaleProvider)$/ }, args => ({ path: args.path, namespace: "mfa-stub" }));
      builder.onLoad({ filter: /.*/, namespace: "mfa-stub" }, args => ({ loader: "jsx", resolveDir: root, contents:
        args.path === "next/navigation" ? 'const router={replace:path=>window.__mfaNavigation.push(path)};export const useRouter=()=>router;'
          : args.path === "next/link" ? 'import React from "react";export default function Link({children,...props}){return <a {...props}>{children}</a>}'
            : 'export const useLocale=()=>({language:"en",timezone:"UTC",weekStartsOn:1});export const useUiText=()=>text=>text;',
      }));
    } }],
  });
  script = result.outputFiles[0].text;
  const compiler = await compile(await readFile(path.join(root, "src/app/globals.css"), "utf8"), { base: path.join(root, "src/app"), onDependency() {} });
  const scanner = new Scanner({ sources: [
    { base: root, pattern: "src/components/ui/*.tsx", negated: false },
    { base: root, pattern: "src/app/(auth)/protect-account/page.tsx", negated: false },
  ] });
  styles = compiler.build(scanner.scan());
});

async function mount(page: Page, config: MfaFixtureConfig, language = "en", width = 390) {
  await page.setViewportSize({ width, height: width === 390 ? 844 : width === 768 ? 1024 : 1000 });
  await page.route("**/*", route => route.request().isNavigationRequest()
    ? route.fulfill({ contentType: "text/html", body: `<html lang="${language}" dir="${language === "en" ? "ltr" : "rtl"}"><body><div id="fixture-root"></div></body></html>` })
    : route.abort());
  await page.goto("http://mfa-fixture.test/protect-account");
  await page.evaluate(value => { window.__mfaFixture = value; }, config);
  await page.addStyleTag({ content: styles });
  await page.addScriptTag({ content: script });
}
async function release(page: Page) { await page.evaluate(() => window.dispatchEvent(new Event("mfa:release"))); }
async function payloads(page: Page) {
  return page.evaluate(() => window.__mfaRequests.filter(request => request.method === "POST").map(request => JSON.parse(request.body!)));
}

test("status loading is announced and language uses the shared selector", async ({ page }) => {
  await mount(page, { statusReplies: [{ body: enrolled, pending: true }] });
  await page.screenshot({ path: test.info().outputPath("status-loading.png"), fullPage: true });
  await expect(page.getByRole("status")).toHaveText("Checking account…");
  await expect(page.getByRole("combobox", { name: "Language" })).toHaveClass(/sk-select/);
  expect(await payloads(page)).toEqual([]);
  await release(page);
  await expect(page.getByRole("textbox", { name: "Authenticator or recovery code" })).toBeVisible();
});

test("challenge error is focused and busy recovery controls cannot alter a pending request", async ({ page }) => {
  await mount(page, { statusReplies: [{ body: enrolled }], actionReplies: [{ status: 400, body: { error: "Synthetic code rejection" }, pending: true }] });
  await page.getByRole("textbox", { name: "Authenticator or recovery code", exact: true }).fill("000000");
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect(page.getByLabel("Use a recovery code")).toBeDisabled();
  await expect(page.locator("#mfa-code")).toHaveAttribute("readonly", "");
  await page.locator("#mfa-code").press("Enter");
  expect((await payloads(page)).length).toBe(1);
  await release(page);
  await expect(page.getByRole("alert")).toBeFocused();
  await expect(page.getByRole("alert")).toHaveText("Synthetic code rejection");
  await expect(page.locator("#mfa-code")).toHaveValue("000000");
  expect(await payloads(page)).toEqual([{ action: "challenge", code: "000000", recovery: false, acknowledged: false }]);
  await page.screenshot({ path: test.info().outputPath("challenge-error.png"), fullPage: true });
});

test("status failure offers a read-only retry without any MFA action", async ({ page }) => {
  await mount(page, { statusReplies: [{ reject: true }, { body: enrolled }] });
  await expect(page.getByRole("alert")).toHaveText("Synthetic connection failure");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.locator("#mfa-code")).toBeFocused();
  expect(await payloads(page)).toEqual([]);
  expect(await page.evaluate(() => window.__mfaRequests.map(request => [request.method, request.cache]))).toEqual([["GET", "no-store"], ["GET", "no-store"]]);
});

test("synthetic setup, verification, and acknowledgement retain every gate and exact payload", async ({ page }) => {
  await mount(page, { statusReplies: [{ body: unenrolled }], actionReplies: [
    { body: { secret }, pending: true }, { body: { recoveryCodes: codes } }, { body: { user: { role: "PRINCIPAL", mustChangePassword: true } }, pending: true },
  ] });
  await page.getByRole("button", { name: "Set up authenticator" }).click();
  await expect(page.getByRole("button", { name: "Set up authenticator" })).toBeDisabled();
  await release(page);
  await expect(page.locator("code")).toHaveText(secret);
  await expect(page.locator("#mfa-code")).toBeFocused();
  await page.locator("#mfa-code").fill("000000");
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect(page.locator("pre")).toHaveText(codes.join("\n"));
  await expect(page.locator("code")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Enter workspace" })).toBeDisabled();
  await expect(page.locator("#mfa-recovery-instructions")).toBeFocused();
  expect(await page.evaluate(() => window.__mfaNavigation)).toEqual([]);
  await page.getByRole("checkbox", { name: "I saved my recovery codes and understand how to recover access" }).check();
  await page.getByRole("button", { name: "Enter workspace" }).click();
  await expect(page.getByRole("checkbox")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Enter workspace" })).toBeDisabled();
  await release(page);
  await expect.poll(() => page.evaluate(() => window.__mfaNavigation)).toEqual(["/first-login"]);
  expect(await payloads(page)).toEqual([
    { action: "setup", code: "", recovery: false, acknowledged: false },
    { action: "verify-setup", code: "000000", recovery: false, acknowledged: false },
    { action: "acknowledge", code: "", recovery: false, acknowledged: true },
  ]);
  await page.screenshot({ path: test.info().outputPath("recovery-codes-synthetic.png"), fullPage: true });
});

test("recovery alternative clears code and preserves challenge destination", async ({ page }) => {
  await mount(page, { statusReplies: [{ body: enrolled }], actionReplies: [{ body: { user: { role: "PARENT" } } }] });
  await page.locator("#mfa-code").fill("000000");
  await page.getByRole("checkbox", { name: "Use a recovery code" }).check();
  await expect(page.locator("#mfa-code")).toHaveValue("");
  await expect(page.locator("#mfa-code")).toHaveAttribute("inputmode", "text");
  await page.locator("#mfa-code").fill(codes[0]);
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect.poll(() => page.evaluate(() => window.__mfaNavigation)).toEqual(["/parent"]);
  expect(await payloads(page)).toEqual([{ action: "challenge", code: codes[0], recovery: true, acknowledged: false }]);
});

test("expired ticket cannot show setup, challenge or acknowledgement controls", async ({ page }) => {
  await mount(page, { statusReplies: [{ status: 401, body: { error: "Sign in again to continue" } }] });
  await expect(page.getByRole("alert")).toHaveText("Sign in again to continue");
  await expect(page.locator("#mfa-code")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Set up|Verify code|Enter workspace/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Return to sign in" })).toHaveAttribute("href", "/login");
  expect(await payloads(page)).toEqual([]);
});

test("a resumed unacknowledged setup offers the existing restart action", async ({ page }) => {
  await mount(page, { statusReplies: [{ body: { ...unenrolled, awaitingAcknowledgement: true } }], actionReplies: [{ body: { secret } }] });
  await page.getByRole("button", { name: "Start setup again" }).click();
  await expect(page.locator("code")).toHaveText(secret);
  expect(await payloads(page)).toEqual([{ action: "setup", code: "", recovery: false, acknowledged: false }]);
});

for (const language of ["en", "ar", "ur"]) {
  for (const width of [390, 768, 1440]) {
    test(`MFA shared controls fit ${language} at ${width}px`, async ({ page }) => {
      await mount(page, { statusReplies: [{ body: enrolled }] }, language, width);
      await expect(page.locator("main")).toHaveAttribute("dir", language === "en" ? "ltr" : "rtl");
      await expect(page.locator("#mfa-code")).toHaveAttribute("dir", "ltr");
      await expect(page.locator("#mfa-code")).toHaveClass(/sk-field/);
      expect((await page.getByRole("combobox").boundingBox())!.height).toBeGreaterThanOrEqual(48);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: test.info().outputPath(`mfa-${language}-${width}.png`), fullPage: true });
      expect(await payloads(page)).toEqual([]);
    });
  }
}
