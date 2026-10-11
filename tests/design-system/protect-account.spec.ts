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
const enrolled = { enrolled: true, school: "Synthetic School", awaitingAcknowledgement: false, resumeChallenge: false };
const unenrolled = { ...enrolled, enrolled: false };
// Synthetic values only: not a real authenticator key, account or recovery code.
const secret = "SYNTHETICSECRETNOTAREALKEY000000";
const groupedSecret = "SYNT HETI CSEC RETN OTAR EALK EY00 0000";
const uri = `otpauth://totp/Skoolee:example%40synthetic.invalid?secret=${secret}&issuer=Skoolee`;
const codes = ["AAAA-0000-AAAA-0000-AAAA", "BBBB-1111-BBBB-1111-BBBB", "CCCC-2222-CCCC-2222-CCCC"];
const field = (page: Page) => page.locator("#mfa-code");

test.beforeAll(async () => {
  const root = process.cwd();
  const result = await build({
    entryPoints: [path.join(root, "tests/design-system/protect-account.fixture.tsx")], bundle: true, write: false,
    platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"test"' }, tsconfig: path.join(root, "tsconfig.json"),
    plugins: [{ name: "mfa-fixture-boundaries", setup(builder: {
      onResolve: (options: { filter: RegExp }, callback: (args: { path: string }) => unknown) => void;
      onLoad: (options: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => unknown) => void;
    }) {
      builder.onResolve({ filter: /^(next\/(navigation|link)|@\/components\/locale\/LocaleProvider)$/ }, args => ({ path: args.path, namespace: "mfa-stub" }));
      builder.onResolve({ filter: /\.module\.css$/ }, args => ({ path: args.path, namespace: "mfa-stub" }));
      builder.onLoad({ filter: /.*/, namespace: "mfa-stub" }, args => ({ loader: "jsx", resolveDir: root, contents:
        args.path === "next/navigation" ? 'const router={replace:path=>window.__mfaNavigation.push(path)};export const useRouter=()=>router;'
          : args.path === "next/link" ? 'import React from "react";export default function Link({children,...props}){return <a {...props}>{children}</a>}'
            : args.path.endsWith(".module.css") ? "export default {}"
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
  await page.setViewportSize({ width, height: width <= 390 ? 844 : width === 768 ? 1024 : 1000 });
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
const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

test("status loading shows a skeleton, is announced and language uses the shared selector", async ({ page }) => {
  await mount(page, { statusReplies: [{ body: enrolled, pending: true }] });
  await expect(page.getByRole("status")).toHaveText("Checking account…");
  await expect(page.getByRole("status")).toHaveAttribute("aria-busy", "true");
  expect((await page.getByRole("status").boundingBox())!.height).toBeGreaterThanOrEqual(300);
  await expect(page.getByRole("combobox", { name: "Language" })).toHaveClass(/sk-select/);
  expect(await payloads(page)).toEqual([]);
  await release(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Verify it's you");
  await expect(page.getByRole("textbox", { name: "Authenticator code" })).toBeFocused();
});

test("challenge error is linked to the field, focused, and busy controls cannot alter a pending request", async ({ page }) => {
  await mount(page, { statusReplies: [{ body: enrolled }], actionReplies: [{ status: 400, body: { error: "Synthetic code rejection" }, pending: true }] });
  await field(page).fill("000000");
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect(page.getByRole("button", { name: "Use a recovery code" })).toBeDisabled();
  await expect(field(page)).toHaveAttribute("readonly", "");
  await field(page).press("Enter");
  expect((await payloads(page)).length).toBe(1);
  await release(page);
  await expect(field(page)).toBeFocused();
  await expect(page.locator("#mfa-code-error")).toHaveText("Synthetic code rejection");
  await expect(page.locator("#mfa-code-error")).toHaveAttribute("role", "alert");
  await expect(field(page)).toHaveAttribute("aria-describedby", /(^|\s)mfa-code-error(\s|$)/);
  await expect(field(page)).toHaveAttribute("aria-invalid", "true");
  await expect(field(page)).toHaveValue("000000");
  expect(await payloads(page)).toEqual([{ action: "challenge", code: "000000", recovery: false, acknowledged: false }]);
});

test("reason codes map to localised guidance instead of the raw server text", async ({ page }) => {
  await mount(page, { statusReplies: [{ body: enrolled }], actionReplies: [
    { status: 400, body: { error: "server text", reason: "clock_skew" } },
    { status: 400, body: { error: "server text", reason: "secret_unavailable" } },
    { status: 400, body: { error: "server text", reason: "recovery_invalid" } },
  ] });
  await field(page).fill("123456");
  await field(page).press("Enter");
  await expect(page.locator("#mfa-code-error")).toHaveText("That code is out of date. Make sure your phone sets its date and time automatically, then enter the current code.");
  await field(page).press("Enter");
  await expect(page.locator("#mfa-code-error")).toContainText("Sign in with one of your recovery codes");
  await page.getByRole("button", { name: "Use a recovery code" }).click();
  await expect(page.locator("#mfa-code-error")).toHaveCount(0);
  await field(page).fill(codes[0]);
  await field(page).press("Enter");
  await expect(page.locator("#mfa-code-error")).toHaveText("That recovery code isn't recognised or has already been used. Try another unused recovery code.");
  await page.getByRole("combobox", { name: "Language" }).selectOption("ar");
  await expect(page.locator("#mfa-code-error")).toHaveText("رمز الاسترداد غير معروف أو مستخدم مسبقاً. جرّب رمز استرداد آخر غير مستخدم.");
  expect(await payloads(page)).toEqual([
    { action: "challenge", code: "123456", recovery: false, acknowledged: false },
    { action: "challenge", code: "123456", recovery: false, acknowledged: false },
    { action: "challenge", code: codes[0], recovery: true, acknowledged: false },
  ]);
});

test("session_expired during a challenge replaces the form with Sign in again", async ({ page }) => {
  await mount(page, { statusReplies: [{ body: enrolled }], actionReplies: [{ status: 401, body: { error: "server text", reason: "session_expired" } }] });
  await field(page).fill("123456");
  await field(page).press("Enter");
  await expect(page.getByRole("alert")).toHaveText("Your sign-in timed out. Sign in again to continue.");
  await expect(page.getByRole("alert")).toBeFocused();
  await expect(page.getByRole("link", { name: "Sign in again" })).toHaveAttribute("href", "/login");
  await expect(field(page)).toHaveCount(0);
});

test("status failure offers a read-only retry without any MFA action", async ({ page }) => {
  await mount(page, { statusReplies: [{ reject: true }, { body: enrolled }] });
  await expect(page.getByRole("alert")).toHaveText("We couldn't reach Skoolee. Check your connection and try again.");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(field(page)).toBeFocused();
  expect(await payloads(page)).toEqual([]);
  expect(await page.evaluate(() => window.__mfaRequests.map(request => [request.method, request.cache]))).toEqual([["GET", "no-store"], ["GET", "no-store"]]);
});

test("synthetic setup shows QR, key and recovery tools while retaining every gate and exact payload", async ({ page }) => {
  await mount(page, { statusReplies: [{ body: unenrolled }], actionReplies: [
    { body: { secret, uri }, pending: true }, { body: { recoveryCodes: codes } }, { body: { user: { role: "PRINCIPAL", mustChangePassword: true } }, pending: true },
  ] });
  await expect(page.getByRole("list", { name: "Setup progress" }).getByRole("listitem").nth(0)).toHaveAttribute("aria-current", "step");
  await page.getByRole("button", { name: "Set up authenticator" }).click();
  await expect(page.getByRole("button", { name: "Set up authenticator" })).toBeDisabled();
  await release(page);
  const qr = page.getByRole("img", { name: "QR code to add Skoolee to your authenticator app" });
  await expect(qr).toHaveAttribute("src", /^data:image\/png;base64,/);
  await expect(page.locator("#mfa-secret")).toHaveText(groupedSecret);
  await expect(field(page)).toBeFocused();
  await page.getByRole("button", { name: "Copy key" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  await expect(page.locator("[aria-live=polite]")).toHaveText("Copied");
  expect(await page.evaluate(() => window.__mfaClipboard)).toEqual([secret]);
  // Authenticator apps show and copy codes as "123 456"; paste and typing keep the digits only.
  await field(page).evaluate((input: HTMLInputElement) => {
    const data = new DataTransfer(); data.setData("text", " 000 000 ");
    input.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(field(page)).toHaveValue("000000");
  await expect(page.getByRole("list", { name: "Setup progress" }).getByRole("listitem").nth(1)).toHaveAttribute("aria-current", "step");
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect(page.getByRole("list", { name: "Recovery codes" }).locator("li bdi")).toHaveText(codes);
  await expect(page.locator("#mfa-secret")).toHaveCount(0);
  await expect(page.locator("#mfa-recovery-instructions")).toBeFocused();
  await page.getByRole("button", { name: "Copy all" }).click();
  expect(await page.evaluate(() => window.__mfaClipboard.at(-1))).toBe(codes.join("\n"));
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download .txt" }).click();
  expect((await download).suggestedFilename()).toBe("skoolee-recovery-codes.txt");
  await page.getByRole("button", { name: "Print" }).click();
  expect(await page.evaluate(() => window.__mfaPrints)).toBe(1);
  await expect(page.getByRole("button", { name: "Enter workspace" })).toBeDisabled();
  expect(await page.evaluate(() => window.__mfaNavigation)).toEqual([]);
  await page.getByRole("checkbox", { name: "I saved my recovery codes and understand how to recover access" }).check();
  await page.getByRole("button", { name: "Enter workspace" }).click();
  await expect(page.getByRole("checkbox")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Enter workspace" })).toBeDisabled();
  await release(page);
  await expect.poll(() => page.evaluate(() => window.__mfaNavigation)).toEqual(["/first-login"]);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your account is protected");
  expect(await payloads(page)).toEqual([
    { action: "setup", code: "", recovery: false, acknowledged: false },
    { action: "verify-setup", code: "000000", recovery: false, acknowledged: false },
    { action: "acknowledge", code: "", recovery: false, acknowledged: true },
  ]);
});

test("recovery toggle is pressed, clears and refocuses the code, and sends recovery:true", async ({ page }) => {
  await mount(page, { statusReplies: [{ body: enrolled }], actionReplies: [{ body: { user: { role: "PARENT" } } }] });
  const app = page.getByRole("button", { name: "Authenticator code" });
  const recoveryButton = page.getByRole("button", { name: "Use a recovery code" });
  await expect(app).toHaveAttribute("aria-pressed", "true");
  await expect(recoveryButton).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("Enter the current code from your authenticator app to continue.")).toBeVisible();
  await field(page).fill("000000");
  await recoveryButton.click();
  await expect(recoveryButton).toHaveAttribute("aria-pressed", "true");
  await expect(app).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("Enter one of the unused recovery codes you saved to continue. Each code works once.")).toBeVisible();
  await expect(page.getByText("Enter the current code from your authenticator app to continue.")).toHaveCount(0);
  await expect(field(page)).toHaveValue("");
  await expect(field(page)).toBeFocused();
  await expect(field(page)).toHaveAttribute("inputmode", "text");
  await expect(page.getByRole("textbox", { name: "Recovery code" })).toBeVisible();
  await field(page).fill(codes[0]);
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect.poll(() => page.evaluate(() => window.__mfaNavigation)).toEqual(["/parent"]);
  expect(await payloads(page)).toEqual([{ action: "challenge", code: codes[0], recovery: true, acknowledged: false }]);
});

test("a recovery code pasted into the authenticator field switches to recovery mode instead of being cut to 6 digits", async ({ page }) => {
  await mount(page, { statusReplies: [{ body: enrolled }], actionReplies: [{ body: { user: { role: "PARENT" } } }] });
  await expect(page.getByRole("button", { name: "Authenticator code" })).toHaveAttribute("aria-pressed", "true");
  await field(page).evaluate((input: HTMLInputElement, value: string) => {
    const data = new DataTransfer(); data.setData("text", ` ${value} `);
    input.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, codes[2]);
  await expect(page.getByRole("button", { name: "Use a recovery code" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("textbox", { name: "Recovery code" })).toHaveValue(codes[2]);
  await field(page).press("Enter");
  await expect.poll(() => page.evaluate(() => window.__mfaNavigation)).toEqual(["/parent"]);
  expect(await payloads(page)).toEqual([{ action: "challenge", code: codes[2], recovery: true, acknowledged: false }]);
});

test("keyboard flow runs from the toggle to the field to submit, and Enter submits", async ({ page }) => {
  await mount(page, { statusReplies: [{ body: enrolled }], actionReplies: [{ body: { user: { role: "PARENT" } } }] });
  await page.getByRole("button", { name: "Use a recovery code" }).focus();
  await page.keyboard.press("Tab");
  await expect(field(page)).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Verify code" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "Use a recovery code" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(field(page)).toBeFocused();
  await page.keyboard.type(codes[1]);
  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => window.__mfaNavigation)).toEqual(["/parent"]);
  expect(await payloads(page)).toEqual([{ action: "challenge", code: codes[1], recovery: true, acknowledged: false }]);
});

test("expired ticket cannot show setup, challenge or acknowledgement controls", async ({ page }) => {
  await mount(page, { statusReplies: [{ status: 401, body: { error: "Sign in again to continue", reason: "session_expired" } }] });
  await expect(page.getByRole("alert")).toHaveText("Your sign-in timed out. Sign in again to continue.");
  await expect(field(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Set up|Verify code|Enter workspace/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Sign in again" })).toHaveAttribute("href", "/login");
  expect(await payloads(page)).toEqual([]);
});

test("a verified but unacknowledged enrolment resumes as a challenge", async ({ page }) => {
  await mount(page, { statusReplies: [{ body: { ...unenrolled, resumeChallenge: true } }], actionReplies: [{ body: { user: { role: "PRINCIPAL" } } }] });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Verify it's you");
  await expect(page.getByText("You already started setup.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Set up authenticator" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start setup again" })).toHaveAccessibleDescription(/replaces your authenticator entry/);
  await field(page).fill("123456");
  await field(page).press("Enter");
  await expect.poll(() => page.evaluate(() => window.__mfaNavigation)).toEqual(["/principal"]);
  expect(await payloads(page)).toEqual([{ action: "challenge", code: "123456", recovery: false, acknowledged: false }]);
});

test("a same-ticket unacknowledged setup offers the existing restart action", async ({ page }) => {
  await mount(page, { statusReplies: [{ body: { ...unenrolled, awaitingAcknowledgement: true } }], actionReplies: [{ body: { secret, uri } }] });
  await page.getByRole("button", { name: "Start setup again" }).click();
  await expect(page.locator("#mfa-secret")).toHaveText(groupedSecret);
  expect(await payloads(page)).toEqual([{ action: "setup", code: "", recovery: false, acknowledged: false }]);
});

for (const language of ["en", "ar", "ur"]) {
  for (const width of [360, 768, 1440]) {
    test(`MFA shared controls fit ${language} at ${width}px`, async ({ page }) => {
      await mount(page, { statusReplies: [{ body: enrolled }] }, language, width);
      await expect(page.locator("main")).toHaveAttribute("dir", language === "en" ? "ltr" : "rtl");
      await expect(field(page)).toHaveAttribute("dir", "ltr");
      await expect(field(page)).toHaveClass(/sk-field/);
      expect((await page.getByRole("combobox").boundingBox())!.height).toBeGreaterThanOrEqual(48);
      for (const button of await page.getByRole("button").all()) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect(await noHorizontalScroll(page)).toBe(true);
      expect(await payloads(page)).toEqual([]);
    });
  }
  test(`setup and recovery views fit ${language} at 360px, also with 200% text`, async ({ page }) => {
    await mount(page, { statusReplies: [{ body: unenrolled }], actionReplies: [{ body: { secret, uri } }, { body: { recoveryCodes: codes } }] }, language, 360);
    for (const scale of ["100%", "200%"]) {
      await page.evaluate(size => { document.documentElement.style.fontSize = size; }, scale);
      expect(await noHorizontalScroll(page), `intro ${scale}`).toBe(true);
    }
    await page.locator("main button").first().click();
    await expect(page.locator("#mfa-secret")).toHaveText(groupedSecret);
    expect(await noHorizontalScroll(page), "scan 200%").toBe(true);
    await field(page).fill("000000");
    await field(page).press("Enter");
    await expect(page.locator("#mfa-recovery-instructions")).toBeFocused();
    expect(await noHorizontalScroll(page), "codes 200%").toBe(true);
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
    expect(await noHorizontalScroll(page), "codes 100%").toBe(true);
  });
  test(`challenge fits ${language} at 360px with 200% text`, async ({ page }) => {
    await mount(page, { statusReplies: [{ body: enrolled }] }, language, 360);
    await expect(field(page)).toBeVisible();
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    expect(await noHorizontalScroll(page)).toBe(true);
    await page.locator("[aria-pressed=false]").click();
    expect(await noHorizontalScroll(page)).toBe(true);
  });
}
