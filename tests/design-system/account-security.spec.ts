import { test, expect, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { SecurityFixtureConfig } from "./account-security.fixture";

const requireTooling = createRequire(createRequire(path.join(process.cwd(), "package.json")).resolve("tsx"));
const { build } = requireTooling("esbuild");
const { compile } = requireTooling("@tailwindcss/node");
const { Scanner } = requireTooling("@tailwindcss/oxide");
let script: string;
let styles: string;

// Synthetic values only: not a real authenticator key, session or recovery code.
const on = { enabled: true, required: false, enrolledAt: "2026-09-01T08:30:00.000Z", recoveryCodesRemaining: 7, recoveryCodesTotal: 10, authenticatorReadable: true };
const off = { ...on, enabled: false, enrolledAt: null, recoveryCodesRemaining: 0, authenticatorReadable: null };
const required = { ...on, required: true };
const secret = "SYNTHETICSECRETNOTAREALKEY000000";
const uri = `otpauth://totp/Skoolee:example%40synthetic.invalid?secret=${secret}&issuer=Skoolee`;
const codes = ["AAAA-0000-AAAA-0000-AAAA", "BBBB-1111-BBBB-1111-BBBB", "CCCC-2222-CCCC-2222-CCCC"];
const typedRecovery = "a1b2c3d4e5f6a7b8c9d0";
const sessions = { sessions: [
  { id: "synthetic-current", userAgent: "Synthetic Desktop Browser", loginAt: "2026-10-01T08:00:00Z", expiresAt: "2026-10-08T08:00:00Z", current: true },
  { id: "synthetic-other", userAgent: "Synthetic Mobile Android", loginAt: "2026-09-28T08:00:00Z", expiresAt: "2026-10-05T08:00:00Z", current: false },
] };

test.beforeAll(async () => {
  const root = process.cwd();
  const result = await build({
    entryPoints: [path.join(root, "tests/design-system/account-security.fixture.tsx")], bundle: true, write: false,
    platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"test"', "process.env": "{}" }, tsconfig: path.join(root, "tsconfig.json"),
    plugins: [{ name: "security-fixture-boundaries", setup(builder: {
      onResolve: (options: { filter: RegExp }, callback: (args: { path: string }) => unknown) => void;
      onLoad: (options: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => unknown) => void;
    }) {
      builder.onResolve({ filter: /^(next\/link|@\/components\/locale\/LocaleProvider|@\/app\/actions\/locale)$/ }, args => ({ path: args.path, namespace: "security-stub" }));
      builder.onResolve({ filter: /\.module\.css$/ }, args => ({ path: args.path, namespace: "security-stub" }));
      builder.onLoad({ filter: /.*/, namespace: "security-stub" }, args => ({ loader: "jsx", resolveDir: root, contents:
        args.path === "next/link" ? 'import React from "react";export default function Link({children,...props}){return <a {...props}>{children}</a>}'
            : args.path.endsWith(".module.css") ? "export default {}"
              // The account layout seeds the locale server-side; here the served <html lang> stands in for it.
              // Server actions are replaced by synthetic ones: the language picker reads/saves through these, the school panel is refused.
              : args.path === "@/app/actions/locale" ? 'export async function getPersonalLanguage(){return window.__securityFixture.personal??{personal:null,inherited:"en"}}export async function saveLanguagePreference(language){window.__languageSaves.push(language);return{preferredLanguage:language}}const refuse=async()=>{throw new Error("permission")};export const getLocaleSettings=refuse,previewLocaleChange=refuse,applyLocaleChange=refuse,setLocaleDelegation=refuse,reviewLocaleCurrency=refuse,getEffectiveDisplayLocale=refuse;'
              // The shell layout seeds the locale server-side; here the served <html lang> stands in for it. Interface copy uses the real catalog.
              : 'import{translateUi}from"./src/lib/locale/ui-messages";const lang=()=>["ar","ur"].includes(document.documentElement.lang)?document.documentElement.lang:"en";export const useLocale=()=>({language:lang(),timezone:"UTC",calendar:"gregory",numberingSystem:"latn",country:"OTHER",currency:"USD",weekStartsOn:1,weekend:[0]});export const useUiText=()=>(text,values=[])=>translateUi(text,lang()).replace(/\\{(\\d+)\\}/g,(m,i)=>i in values?String(values[i]):m);export const StaticLocaleProvider=({children})=>children;export const LocaleProvider=({children})=>children;export const UiText=({children})=>children;',
      }));
    } }],
  });
  script = result.outputFiles[0].text;
  const compiler = await compile(await readFile(path.join(root, "src/app/globals.css"), "utf8"), { base: path.join(root, "src/app"), onDependency() {} });
  const scanner = new Scanner({ sources: [
    { base: root, pattern: "src/components/ui/*.tsx", negated: false },
    { base: root, pattern: "src/components/auth/mfa/*.tsx", negated: false },
    { base: root, pattern: "src/components/account-security/*.tsx", negated: false },
    { base: root, pattern: "src/components/settings/*.tsx", negated: false },
  ] });
  styles = compiler.build(scanner.scan());
});

async function mount(page: Page, config: SecurityFixtureConfig, language = "en", width = 1280) {
  await page.setViewportSize({ width, height: width <= 390 ? 800 : 1000 });
  await page.route("**/*", route => route.request().isNavigationRequest()
    ? route.fulfill({ contentType: "text/html", body: `<html lang="${language}" dir="${language === "en" ? "ltr" : "rtl"}"><body><div id="fixture-root"></div></body></html>` })
    : route.abort());
  await page.goto("http://security-fixture.test/account/security");
  await page.evaluate(value => { window.__securityFixture = value; }, config);
  await page.addStyleTag({ content: styles });
  await page.addScriptTag({ content: script });
}
async function release(page: Page) { await page.evaluate(() => window.dispatchEvent(new Event("security:release"))); }
async function posts(page: Page) {
  return page.evaluate(() => window.__securityRequests.filter(r => r.method === "POST").map(r => JSON.parse(r.body!)));
}
async function statusReads(page: Page) {
  return page.evaluate(() => window.__securityRequests.filter(r => r.method === "GET" && r.url === "/api/account/mfa").length);
}
/** The Settings modal itself, and the flow dialogs stacked over it. */
const settings = (page: Page) => page.locator("[role=dialog]:has([data-settings-root])");
const pageLive = (page: Page) => page.locator("[data-security-live]");
const dialog = (page: Page) => page.getByRole("dialog").filter({ hasNot: page.locator("[data-settings-root]") });
const dialogLive = (page: Page) => dialog(page).locator("[aria-live=polite]");
const toggle = (page: Page) => page.getByRole("switch", { name: "Two-factor authentication" });
const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth
  && Array.from(document.querySelectorAll<HTMLElement>("[role=dialog] .overflow-y-auto")).every(el => el.scrollWidth <= el.clientWidth + 1));
async function targetsAre44(page: Page, scope: ReturnType<Page["locator"]>) {
  for (const button of await scope.getByRole("button").all()) {
    if (!(await button.isVisible())) continue;
    const box = (await button.boundingBox())!;
    expect(box.height, await button.innerText()).toBeGreaterThanOrEqual(44);
    expect(box.width, await button.innerText()).toBeGreaterThanOrEqual(44);
  }
}

test("Settings opens on Security: skeleton, then password, status, enrolment details and sessions", async ({ page }) => {
  await mount(page, { status: [{ body: on, pending: true }, { body: on }], sessions: [{ body: sessions }] });
  await expect(settings(page)).toHaveAccessibleName("Settings");
  await expect(page.locator("[aria-busy=true][role=status]")).toContainText("Loading security settings…");
  await expect(pageLive(page)).toHaveText("");
  await release(page);
  const tab = settings(page).getByRole("tab", { name: "Security & sign-in" });
  await expect(tab).toHaveAttribute("aria-selected", "true");
  await expect(tab).toBeFocused();
  const panel = settings(page).getByRole("tabpanel", { name: "Security & sign-in" });
  await expect(panel.getByRole("heading", { level: 3 })).toHaveText("Security & sign-in");
  await expect(panel.getByRole("button", { name: "Change password" })).toBeVisible();
  await expect(toggle(page)).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("#security-2fa-heading + div")).toHaveText("On");
  await expect(page.getByText("Authenticator added")).toBeVisible();
  await expect(page.getByText("September 1, 2026", { exact: false })).toBeVisible();
  await expect(page.getByText("7 of 10 unused")).toBeVisible();
  await expect(page.getByText("Running low.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Change authenticator" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Regenerate recovery codes" })).toBeVisible();
  await expect(page.getByText("This device", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "End session" })).toHaveCount(2);
  expect(await page.evaluate(() => window.__securityRequests.filter(r => r.url === "/api/account/mfa").map(r => r.cache))).toEqual(["no-store"]);
});

test("off: the switch opens the enable flow, which asks for the password only", async ({ page }) => {
  await mount(page, { status: [{ body: off }, { body: { ...on, recoveryCodesRemaining: 10 } }], actions: [{ body: { secret, uri, expiresAt: "2026-10-01T08:10:00Z" } }, { body: { success: true, recoveryCodes: codes, user: { role: "PARENT" } } }] });
  await expect(toggle(page)).toHaveAttribute("aria-checked", "false");
  await expect(page.locator("#security-2fa-heading + div")).toHaveText("Off");
  await expect(page.getByRole("button", { name: "Change authenticator" })).toHaveCount(0);
  await toggle(page).click();
  await expect(dialog(page)).toHaveAccessibleName("Turn on two-factor");
  await expect(dialog(page).getByLabel("Current password")).toBeFocused();
  await expect(dialog(page).getByRole("group", { name: "Verification method" })).toHaveCount(0);
  await page.keyboard.type("synthetic-password");
  await page.keyboard.press("Enter");
  await expect(dialog(page).locator("#security-secret")).toHaveText("SYNT HETI CSEC RETN OTAR EALK EY00 0000");
  await dialog(page).getByRole("button", { name: "Continue" }).click();
  await expect(dialog(page).getByRole("textbox", { name: "Code from your new app" })).toBeFocused();
  await page.keyboard.type("654321");
  await page.keyboard.press("Enter");
  await expect(dialogLive(page)).toHaveText("Two-factor turned on");
  await expect.poll(() => statusReads(page)).toBe(2);
  expect(await posts(page)).toEqual([
    { action: "begin", mode: "enable", password: "synthetic-password" },
    { action: "confirm", code: "654321" },
  ]);
});

test("required: the switch stays focusable, explains why and does nothing", async ({ page }) => {
  await mount(page, { status: [{ body: required }] });
  await expect(toggle(page)).toHaveAttribute("aria-disabled", "true");
  await expect(toggle(page)).not.toHaveAttribute("disabled", /.*/);
  await expect(toggle(page)).toHaveAccessibleDescription("Required for your role");
  await expect(page.getByText("Required for your role")).toBeVisible();
  await toggle(page).focus();
  await expect(toggle(page)).toBeFocused();
  await page.keyboard.press("Space");
  await page.keyboard.press("Enter");
  // Playwright treats aria-disabled as not actionable; force the pointer path to prove the no-op.
  await toggle(page).click({ force: true });
  await expect(dialog(page)).toHaveCount(0);
  await expect(toggle(page)).toHaveAttribute("aria-checked", "true");
  expect(await posts(page)).toEqual([]);
});

test("unreadable secret warns and starts the change dialog in recovery mode; low codes are flagged", async ({ page }) => {
  await mount(page, { status: [{ body: { ...on, authenticatorReadable: false, recoveryCodesRemaining: 2 } }] });
  await expect(page.getByText("Your authenticator can't be checked on this server.")).toBeVisible();
  await expect(page.getByText("2 of 10 unused")).toBeVisible();
  await expect(page.getByText("Running low. Regenerate to get a fresh set.")).toBeVisible();
  await page.getByRole("button", { name: "Change authenticator" }).click();
  await expect(dialog(page).getByRole("button", { name: "Use a recovery code" })).toHaveAttribute("aria-pressed", "true");
  await expect(dialog(page).getByRole("textbox", { name: "Recovery code" })).toBeVisible();
});

test("change authenticator: every step, field-scoped errors with focus, live region text and exact payloads", async ({ page }) => {
  await mount(page, { status: [{ body: on }, { body: { ...on, recoveryCodesRemaining: 10 } }], sessions: [{ body: sessions }], actions: [
    { status: 400, body: { error: "server text", reason: "password_invalid" } },
    { body: { secret, uri, expiresAt: "2026-10-01T08:10:00Z" } },
    { status: 400, body: { error: "server text", reason: "invalid_code" } },
    { body: { success: true, recoveryCodes: codes, user: { role: "PARENT" } }, pending: true },
  ] });
  const opener = page.getByRole("button", { name: "Change authenticator" });
  await opener.click();
  await expect(dialog(page)).toHaveAccessibleName("Change authenticator");
  const steps = dialog(page).getByRole("list", { name: "Progress" }).getByRole("listitem");
  await expect(steps.nth(0)).toHaveAttribute("aria-current", "step");
  const password = dialog(page).getByLabel("Current password");
  await expect(password).toBeFocused();
  await password.fill("wrong-synthetic");
  await dialog(page).getByRole("button", { name: "Show password" }).click();
  await expect(password).toHaveAttribute("type", "text");
  await dialog(page).getByRole("button", { name: "Hide password" }).click();
  const code = dialog(page).locator("#security-change-code");
  await code.click();
  // AC20: the dash in an authenticator code is dropped, not treated as a recovery code.
  await page.keyboard.type("123-456");
  await expect(code).toHaveValue("123456");
  await expect(dialog(page).getByRole("button", { name: "Authenticator code" })).toHaveAttribute("aria-pressed", "true");
  await dialog(page).getByRole("button", { name: "Continue" }).click();
  await expect(password).toBeFocused();
  await expect(dialog(page).locator("#security-change-password-error")).toHaveText("That password isn't right. Enter your current password.");
  await expect(password).toHaveAttribute("aria-invalid", "true");
  await expect(password).toHaveAttribute("aria-describedby", /security-change-password-error/);
  await password.fill("synthetic-password");
  await page.keyboard.press("Enter");
  await expect(steps.nth(1)).toHaveAttribute("aria-current", "step");
  await expect(dialog(page).getByRole("img", { name: "QR code to add Skoolee to your authenticator app" })).toHaveAttribute("src", /^data:image\/png;base64,/);
  await dialog(page).getByRole("button", { name: "Copy key" }).click();
  await expect(dialogLive(page)).toHaveText("Copied");
  expect(await page.evaluate(() => window.__securityClipboard)).toEqual([secret]);
  await dialog(page).getByRole("button", { name: "Continue" }).click();
  await expect(steps.nth(2)).toHaveAttribute("aria-current", "step");
  const newCode = dialog(page).getByRole("textbox", { name: "Code from your new app" });
  await expect(newCode).toBeFocused();
  await page.keyboard.type("000000");
  await page.keyboard.press("Enter");
  await expect(newCode).toBeFocused();
  await expect(dialog(page).locator("#security-new-code-error")).toHaveText("That code didn't match. Enter the current 6-digit code from your authenticator app.");
  await newCode.fill("654321");
  await dialog(page).getByRole("button", { name: "Confirm" }).click();
  await expect(dialog(page).getByRole("button", { name: "Confirm" })).toHaveAttribute("aria-busy", "true");
  await expect(dialogLive(page)).toHaveText("Working…");
  await release(page);
  await expect(steps.nth(3)).toHaveAttribute("aria-current", "step");
  await expect(dialog(page).locator("#security-change-recovery-instructions")).toBeFocused();
  await expect(dialog(page).getByRole("list", { name: "Recovery codes" }).locator("li bdi")).toHaveText(codes);
  await expect(dialogLive(page)).toHaveText("Authenticator changed");
  await dialog(page).getByRole("button", { name: "Copy all" }).click();
  await expect(dialogLive(page)).toHaveText("Copied");
  await dialog(page).getByRole("button", { name: "Print" }).click();
  expect(await page.evaluate(() => window.__securityPrints)).toBe(1);
  expect(await page.evaluate(() => document.documentElement.classList.contains("sk-print-recovery"))).toBe(true);
  const done = dialog(page).getByRole("button", { name: "Done" });
  await expect(done).toBeDisabled();
  await dialog(page).getByRole("checkbox", { name: "I saved my recovery codes and understand how to recover access" }).check();
  await done.click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(pageLive(page)).toHaveText("Authenticator changed");
  await expect(opener).toBeFocused();
  await expect(page.getByText("10 of 10 unused")).toBeVisible();
  expect(await posts(page)).toEqual([
    { action: "begin", mode: "change", password: "wrong-synthetic", code: "123456", recovery: false },
    { action: "begin", mode: "change", password: "synthetic-password", code: "123456", recovery: false },
    { action: "confirm", code: "000000" },
    { action: "confirm", code: "654321" },
  ]);
});

test("a recovery code typed into the authenticator field switches to recovery mode and keeps every character", async ({ page }) => {
  await mount(page, { status: [{ body: on }], actions: [{ body: { secret, uri, expiresAt: "2026-10-01T08:10:00Z" } }, { body: { success: true } }] });
  await page.getByRole("button", { name: "Change authenticator" }).click();
  await dialog(page).getByLabel("Current password").fill("synthetic-password");
  const code = dialog(page).locator("#security-change-code");
  await code.click();
  await page.keyboard.type(typedRecovery);
  await expect(dialog(page).getByRole("button", { name: "Use a recovery code" })).toHaveAttribute("aria-pressed", "true");
  await expect(dialog(page).getByRole("textbox", { name: "Recovery code" })).toHaveValue(typedRecovery);
  await expect(code).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog(page).locator("#security-secret")).toBeVisible();
  // Dismissing a staged swap cancels it (fire and forget); nothing was committed.
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
  await expect.poll(() => posts(page)).toEqual([
    { action: "begin", mode: "change", password: "synthetic-password", code: typedRecovery, recovery: true },
    { action: "cancel" },
  ]);
});

test("secret_unavailable switches to recovery; setup_expired offers Start again; unacknowledged codes ask before closing", async ({ page }) => {
  await mount(page, { status: [{ body: on }], actions: [
    { status: 400, body: { error: "server text", reason: "secret_unavailable" } },
    { body: { secret, uri, expiresAt: "2026-10-01T08:10:00Z" } },
    { status: 409, body: { error: "server text", reason: "setup_expired" } },
    { body: { secret, uri, expiresAt: "2026-10-01T08:10:00Z" } },
    { body: { success: true, recoveryCodes: codes } },
  ] });
  await page.getByRole("button", { name: "Change authenticator" }).click();
  await dialog(page).getByLabel("Current password").fill("synthetic-password");
  await dialog(page).locator("#security-change-code").fill("123456");
  await page.keyboard.press("Enter");
  await expect(dialog(page).getByRole("button", { name: "Use a recovery code" })).toHaveAttribute("aria-pressed", "true");
  await expect(dialog(page).locator("#security-change-code")).toBeFocused();
  await expect(dialog(page).locator("#security-change-code-error")).toContainText("Use one of your recovery codes instead.");
  await dialog(page).locator("#security-change-code").fill(codes[0]);
  await page.keyboard.press("Enter");
  await dialog(page).getByRole("button", { name: "Continue" }).click();
  await dialog(page).getByRole("textbox", { name: "Code from your new app" }).fill("111111");
  await page.keyboard.press("Enter");
  const alert = dialog(page).getByRole("alert");
  await expect(alert).toContainText("This setup session has expired.");
  await expect(alert).toBeFocused();
  await alert.getByRole("button", { name: "Start again" }).click();
  await expect(dialog(page).getByLabel("Current password")).toBeVisible();
  await dialog(page).getByLabel("Current password").fill("synthetic-password");
  await dialog(page).locator("#security-change-code").fill(codes[1]);
  await page.keyboard.press("Enter");
  await dialog(page).getByRole("button", { name: "Continue" }).click();
  await dialog(page).getByRole("textbox", { name: "Code from your new app" }).fill("222222");
  await page.keyboard.press("Enter");
  await expect(dialog(page).getByRole("list", { name: "Recovery codes" })).toBeVisible();
  await page.keyboard.press("Escape");
  const prompt = page.getByRole("alertdialog");
  await expect(prompt).toContainText("You haven't confirmed you saved these codes. They won't be shown again.");
  await prompt.getByRole("button", { name: /keep/i }).click();
  await expect(dialog(page).getByRole("list", { name: "Recovery codes" })).toBeVisible();
  expect((await posts(page)).map(body => body.action)).toEqual(["begin", "begin", "confirm", "begin", "confirm"]);
});

test("regenerate: password + authenticator code, then the new codes with ack-gated Done", async ({ page }) => {
  await mount(page, { status: [{ body: { ...on, recoveryCodesRemaining: 1 } }, { body: { ...on, recoveryCodesRemaining: 10 } }], actions: [{ body: { recoveryCodes: codes } }] });
  await page.getByRole("button", { name: "Regenerate recovery codes" }).click();
  await expect(dialog(page)).toHaveAccessibleName("Regenerate recovery codes");
  await expect(dialog(page).getByRole("group", { name: "Verification method" })).toHaveCount(0);
  await dialog(page).getByLabel("Current password").fill("synthetic-password");
  const code = dialog(page).locator("#security-regenerate-code");
  await code.click();
  await page.keyboard.type("12 34 56x");
  await expect(code).toHaveValue("123456");
  await dialog(page).getByRole("button", { name: "Create new codes" }).click();
  await expect(dialog(page).locator("#security-regenerate-recovery-instructions")).toBeFocused();
  await expect(dialogLive(page)).toHaveText("New recovery codes are ready");
  const download = page.waitForEvent("download");
  await dialog(page).getByRole("button", { name: "Download .txt" }).click();
  expect((await download).suggestedFilename()).toBe("skoolee-recovery-codes.txt");
  await expect(dialogLive(page)).toHaveText("Downloaded");
  await dialog(page).getByRole("checkbox").check();
  await dialog(page).getByRole("button", { name: "Done" }).click();
  await expect(pageLive(page)).toHaveText("New recovery codes are ready");
  await expect(page.getByText("10 of 10 unused")).toBeVisible();
  expect(await posts(page)).toEqual([{ action: "regenerate", password: "synthetic-password", code: "123456" }]);
});

test("disable: destructive action, mandatory refusal is a focused alert, success closes and announces", async ({ page }) => {
  await mount(page, { status: [{ body: on }, { body: off }], actions: [{ status: 403, body: { error: "server text", reason: "mfa_required" } }, { body: { success: true, user: { role: "PARENT" } } }] });
  await toggle(page).click();
  await expect(dialog(page)).toHaveAccessibleName("Turn off two-factor");
  await expect(dialog(page).getByText("Anyone with your password could sign in. Other devices will be signed out.")).toBeVisible();
  const action = dialog(page).getByRole("button", { name: "Turn off two-factor" });
  await expect(action).toHaveClass(/bg-destructive/);
  await dialog(page).getByLabel("Current password").fill("synthetic-password");
  await dialog(page).locator("#security-disable-code").fill("123456");
  await action.click();
  const alert = dialog(page).getByRole("alert");
  await expect(alert).toHaveText("Your role requires two-factor authentication, so it can't be turned off.");
  await expect(alert).toBeFocused();
  await action.click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(pageLive(page)).toHaveText("Two-factor turned off");
  await expect(toggle(page)).toHaveAttribute("aria-checked", "false");
  expect(await posts(page)).toEqual([
    { action: "disable", password: "synthetic-password", code: "123456", recovery: false },
    { action: "disable", password: "synthetic-password", code: "123456", recovery: false },
  ]);
});

test("a 401 inside a dialog offers Sign in again", async ({ page }) => {
  await mount(page, { status: [{ body: on }], actions: [{ status: 401, body: { error: "server text", reason: "session_expired" } }] });
  await page.getByRole("button", { name: "Regenerate recovery codes" }).click();
  await dialog(page).getByLabel("Current password").fill("synthetic-password");
  await dialog(page).locator("#security-regenerate-code").fill("123456");
  await page.keyboard.press("Enter");
  await expect(dialog(page).getByRole("alert")).toContainText("Your sign-in timed out.");
  await expect(dialog(page).getByRole("link", { name: "Sign in again" })).toHaveAttribute("href", "/login?reason=session-expired");
});

test("load failure shows an error with Retry; a 401 redirects to sign-in", async ({ page }) => {
  await mount(page, { status: [{ reject: true }, { body: on }] });
  await expect(page.getByRole("alert")).toContainText("We couldn't load your security settings.");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(toggle(page)).toBeVisible();

  const redirected = page.waitForURL("http://security-fixture.test/login?reason=session-expired");
  await mount(page, { status: [{ status: 401, body: { error: "server text", reason: "session_expired" } }] });
  await redirected;
});

test("ending another session sends its id and announces the result", async ({ page }) => {
  await mount(page, { status: [{ body: on }], sessions: [{ body: sessions }], deletes: [{ body: { success: true, endedAt: "2026-10-01T09:00:00Z" } }] });
  await page.getByRole("listitem").filter({ hasText: "Synthetic Mobile Android" }).getByRole("button", { name: "End session" }).click();
  await expect(pageLive(page)).toHaveText("Session ended");
  expect(await page.evaluate(() => window.__securityRequests.filter(r => r.method === "DELETE").map(r => JSON.parse(r.body!)))).toEqual([{ id: "synthetic-other" }]);
});

test("keyboard only: Tab stays in Settings, Escape closes only the top layer, focus returns each time", async ({ page }) => {
  await mount(page, { status: [{ body: on }], sessions: [{ body: sessions }] });
  await expect(toggle(page)).toBeVisible();
  const tab = settings(page).getByRole("tab", { name: "Security & sign-in" });
  await expect(tab).toBeFocused();
  const order: string[] = [];
  for (let i = 0; i < 8; i += 1) {
    await page.keyboard.press("Tab");
    order.push(await page.evaluate(() => { const el = document.activeElement as HTMLElement; return el.getAttribute("aria-label") || el.innerText.trim(); }));
  }
  expect(order).toEqual(["Change password", "Two-factor authentication", "Change authenticator", "Regenerate recovery codes", "End session", "End session", "Close settings", "Security & sign-in"]);
  for (let i = 0; i < 3; i += 1) await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Change authenticator" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog(page).getByLabel("Current password")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog(page).getByRole("button", { name: "Show password" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
  await expect(settings(page)).toBeVisible();
  await expect(page.getByRole("button", { name: "Change authenticator" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(settings(page)).toHaveCount(0);
  // Reopened from a trigger, Settings hands focus back to it on close.
  const opener = page.getByRole("button", { name: "Open settings" });
  await opener.click();
  await expect(settings(page).getByRole("tab", { name: "Profile" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(settings(page)).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test("section nav is a tabs pattern: arrows, Home and End move and activate; visited sections keep their state", async ({ page }) => {
  await mount(page, { status: [{ body: on }] });
  const tabs = settings(page).getByRole("tablist", { name: "Settings sections" });
  await expect(tabs.getByRole("tab")).toHaveText(["Profile", "Language", "Security & sign-in"]);
  await expect(tabs.getByRole("tab", { name: "Security & sign-in" })).toBeFocused();
  await page.keyboard.press("ArrowUp");
  const language = tabs.getByRole("tab", { name: "Language" });
  await expect(language).toBeFocused();
  await expect(language).toHaveAttribute("aria-selected", "true");
  await expect(settings(page).getByRole("tabpanel", { name: "Language" })).toBeVisible();
  await page.keyboard.press("Home");
  await expect(tabs.getByRole("tab", { name: "Profile" })).toHaveAttribute("aria-selected", "true");
  const name = settings(page).getByLabel("Full name");
  await name.fill("Synthetic Parent Edited");
  await tabs.getByRole("tab", { name: "Profile" }).focus();
  await page.keyboard.press("End");
  await expect(tabs.getByRole("tab", { name: "Security & sign-in" })).toHaveAttribute("aria-selected", "true");
  await expect(settings(page).getByRole("tabpanel", { name: "Profile" })).toBeHidden();
  await tabs.getByRole("tab", { name: "Profile" }).click();
  await expect(name).toHaveValue("Synthetic Parent Edited");
  // Unsaved profile edits ask before the modal closes.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("alertdialog")).toContainText("Your profile changes have not been saved. Close without saving?");
});

test("profile: edits save through PATCH /api/profile and announce", async ({ page }) => {
  await mount(page, { status: [{ body: on }], section: "profile" });
  const panel = settings(page).getByRole("tabpanel", { name: "Profile" });
  await expect(panel.getByLabel("Full name")).toHaveValue("Synthetic Parent");
  await expect(panel.getByText("parent@synthetic.invalid")).toBeVisible();
  const save = panel.getByRole("button", { name: "Save changes" });
  await expect(save).toBeDisabled();
  await panel.getByLabel("Full name").fill("");
  await panel.getByLabel("Phone").fill("+92 300 0000000");
  await save.click();
  await expect(panel.getByText("Full name is required")).toBeVisible();
  await panel.getByLabel("Full name").fill("Synthetic Parent Two");
  await save.click();
  await expect(panel.getByRole("status").filter({ hasText: "Profile updated" })).toBeVisible();
  await expect(save).toBeDisabled();
  const patch = await page.evaluate(() => window.__securityRequests.filter(r => r.method === "PATCH").map(r => JSON.parse(r.body!)));
  expect(patch).toEqual([{ fullName: "Synthetic Parent Two", phone: "+92 300 0000000", profileImageUrl: null }]);
});

test("language: radio cards in their own script; choosing one saves, re-localizes the app and keeps Settings open", async ({ page }) => {
  await mount(page, { status: [{ body: on }], section: "language", personal: { personal: null, inherited: "ur" } });
  const panel = settings(page).getByRole("tabpanel", { name: "Language" });
  const group = panel.getByRole("group", { name: "Display language" });
  await expect(group.getByRole("radio")).toHaveCount(4);
  await expect(group.getByRole("radio", { name: /School default/ })).toBeChecked();
  await expect(group.getByText("Follows your school (اردو)")).toBeVisible();
  await expect(group.getByText("العربية", { exact: true })).toHaveAttribute("lang", "ar");
  await group.getByText("العربية", { exact: true }).click();
  await expect(group.getByRole("radio", { name: /العربية/ })).toBeChecked();
  await expect(panel.getByRole("status").filter({ hasText: "Language saved" })).toBeVisible();
  expect(await page.evaluate(() => window.__languageSaves)).toEqual(["ar"]);
  expect(await page.evaluate(() => window.__localeChanges)).toBe(1);
  await expect(settings(page)).toBeVisible();
  // Keyboard: arrows move within the group and save the focused choice.
  await group.getByRole("radio", { name: /العربية/ }).focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => page.evaluate(() => window.__languageSaves)).toEqual(["ar", "ur"]);
  // School-wide policy is separate and loads only on request.
  const school = panel.getByRole("button", { name: /School language and region/ });
  await expect(school).toHaveAttribute("aria-expanded", "false");
  await school.click();
  await expect(school).toHaveAttribute("aria-expanded", "true");
});

test("reduced motion: the switch thumb and spinners do not animate", async ({ page }) => {
  await mount(page, { status: [{ body: on }] });
  const thumb = toggle(page).locator("span[aria-hidden=true] > span");
  // motion-safe: drops the transition; the global reduced-motion rule may leave a 0.01ms floor.
  expect(parseFloat(await thumb.evaluate(el => getComputedStyle(el).transitionDuration))).toBeLessThan(0.001);
  await page.getByRole("button", { name: "Regenerate recovery codes" }).click();
  await expect(dialog(page)).toBeVisible();
  expect(parseFloat(await dialog(page).evaluate(el => getComputedStyle(el).animationDuration))).toBeLessThan(0.001);
});

const localized = {
  en: { title: "Security & sign-in", toggle: "Two-factor authentication", change: "Change authenticator", password: "Current password" },
  ar: { title: "الأمان وتسجيل الدخول", toggle: "المصادقة الثنائية", change: "تغيير تطبيق المصادقة", password: "كلمة المرور الحالية" },
  ur: { title: "سیکیورٹی اور سائن ان", toggle: "دو مرحلہ تصدیق", change: "تصدیقی ایپ تبدیل کریں", password: "موجودہ پاس ورڈ" },
} as const;

for (const language of ["en", "ar", "ur"] as const) {
  for (const width of [360, 1280]) {
    test(`settings and change dialog fit ${language} at ${width}px, also with 200% text`, async ({ page }) => {
      const copy = localized[language];
      await mount(page, { status: [{ body: { ...on, recoveryCodesRemaining: 2 } }], sessions: [{ body: sessions }] }, language, width);
      await expect(settings(page).getByRole("tabpanel").getByRole("heading", { level: 3 })).toHaveText(copy.title);
      await expect(page.locator("[data-settings-root]")).toHaveAttribute("dir", language === "en" ? "ltr" : "rtl");
      await expect(page.getByRole("switch", { name: copy.toggle })).toBeVisible();
      await targetsAre44(page, settings(page));
      expect(await noHorizontalScroll(page), "settings 100%").toBe(true);
      await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
      expect(await noHorizontalScroll(page), "settings 200%").toBe(true);
      await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
      await page.getByRole("button", { name: copy.change }).click();
      await expect(dialog(page).getByLabel(copy.password)).toBeFocused();
      await expect(dialog(page).locator("#security-change-code")).toHaveAttribute("dir", "ltr");
      await targetsAre44(page, dialog(page));
      expect(await noHorizontalScroll(page), "dialog 100%").toBe(true);
      await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
      expect(await noHorizontalScroll(page), "dialog 200%").toBe(true);
      expect(await posts(page)).toEqual([]);
    });
  }
}

// Visual evidence for review; opt-in so routine runs leave nothing behind.
const shots = process.env.SETTINGS_SCREENSHOTS;
for (const [language, width, section] of [["en", 1440, "profile"], ["en", 1440, "language"], ["en", 1440, "security"], ["en", 360, "profile"], ["en", 360, "language"], ["en", 360, "security"], ["ar", 1440, "language"], ["ar", 1440, "security"], ["ar", 360, "security"], ["ur", 1440, "language"]] as const) {
  test(`screenshot ${section} ${language} ${width}`, async ({ page }) => {
    test.skip(!shots, "set SETTINGS_SCREENSHOTS=<dir> to capture");
    await mount(page, { status: [{ body: { ...on, recoveryCodesRemaining: 2 } }], sessions: [{ body: sessions }], section, personal: { personal: language === "en" ? null : language, inherited: "en" } }, language, width);
    await expect(settings(page).getByRole("tabpanel")).toBeVisible();
    if (section === "security") await expect(toggle(page).or(page.getByRole("switch"))).toBeVisible();
    if (section === "language") await expect(settings(page).getByRole("radio").first()).toBeAttached();
    if (section === "profile") await expect(settings(page).locator("#settings-full-name")).toBeVisible();
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await mkdir(shots!, { recursive: true });
    await page.screenshot({ path: path.join(shots!, `settings-${section}-${language}-${width}.png`) });
  });
}
