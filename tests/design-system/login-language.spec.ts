/**
 * Login-page language (design §B.1, AC1, AC2, AC9b, AC21).
 *
 * Fixture tests render the real /login and /protect-account pages through the
 * existing esbuild fixtures, on ONE synthetic origin so sessionStorage (the
 * "explicit choice" flag) carries from one page to the next like it does in a
 * tab. No real authentication endpoint is called. The server-render checks
 * (AC2) need the dev server on :3005 and run against it read-only.
 */
import { test, expect, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";

const workspaceRequire = createRequire(createRequire(path.join(process.cwd(), "package.json")).resolve("tsx"));
const { build } = workspaceRequire("esbuild");
const { compile } = workspaceRequire("@tailwindcss/node");
const { Scanner } = workspaceRequire("@tailwindcss/oxide");
const ORIGIN = "http://lang-fixture.test";
let loginScript: string;
let protectScript: string;
let styles: string;

const stubs = (root: string) => ({ name: "synthetic-language-boundaries", setup(builder: {
  onResolve: (options: { filter: RegExp }, callback: (args: { path: string }) => unknown) => void;
  onLoad: (options: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => unknown) => void;
}) {
  builder.onResolve({ filter: /^(next\/(navigation|link)|@\/app\/actions\/invite|@\/components\/locale\/LocaleProvider)$/ }, args => ({ path: args.path, namespace: "lang-stub" }));
  builder.onResolve({ filter: /\.module\.css$/ }, args => ({ path: args.path, namespace: "lang-stub" }));
  builder.onLoad({ filter: /.*/, namespace: "lang-stub" }, args => ({ loader: "jsx", resolveDir: root, contents:
    args.path === "next/navigation" ? 'const query=new URLSearchParams(location.search);const router={push:url=>(window.__authNavigations||=[]).push(url),replace:url=>(window.__mfaNavigation||=[]).push(url)};export const useRouter=()=>router;export const useSearchParams=()=>query;'
      : args.path === "next/link" ? 'import React from "react";export default function Link({children,...props}){return <a {...props}>{children}</a>}'
        : args.path.includes("actions/invite") ? "export const acceptInvite=async()=>{};export const acceptInviteResult=async()=>({success:true});"
          : args.path.includes("LocaleProvider") ? 'export const useLocale=()=>({language:"en",timezone:"UTC",weekStartsOn:1});export const useUiText=()=>text=>text;export const StaticLocaleProvider=({children})=>children;'
            : "export default {}",
  }));
} });

test.beforeAll(async () => {
  const root = process.cwd();
  const bundle = async (entry: string) => (await build({
    entryPoints: [path.join(root, entry)], bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"test"', "process.env": "{}" }, tsconfig: path.join(root, "tsconfig.json"), plugins: [stubs(root)],
  })).outputFiles[0].text;
  loginScript = await bundle("tests/design-system/auth-login-invite.fixture.tsx");
  protectScript = await bundle("tests/design-system/protect-account.fixture.tsx");
  const compiler = await compile(await readFile(path.join(root, "src/app/globals.css"), "utf8"), { base: path.join(root, "src/app"), onDependency() {} });
  const scanner = new Scanner({ sources: [
    { base: root, pattern: "src/components/**/*.tsx", negated: false },
    { base: root, pattern: "src/app/(auth)/{login,protect-account}/page.tsx", negated: false },
  ] });
  styles = compiler.build(scanner.scan());
});

/** Serves every navigation with `<html lang>` taken from the skoolee-lang cookie, as the (auth) layout would. */
async function serveFixtureOrigin(page: Page) {
  await page.route(`${ORIGIN}/**`, async route => {
    if (!route.request().isNavigationRequest()) return route.abort();
    const cookie = /(?:^|;\s*)skoolee-lang=(en|ar|ur)(?:;|$)/.exec(route.request().headers().cookie ?? "")?.[1] ?? "en";
    return route.fulfill({ contentType: "text/html", body: `<html lang="${cookie}" dir="${cookie === "en" ? "ltr" : "rtl"}"><body><div id="fixture-root"></div></body></html>` });
  });
}

async function mountLogin(page: Page, replies: unknown[] = [], width = 390) {
  await page.setViewportSize({ width, height: 844 });
  await serveFixtureOrigin(page);
  await page.goto(`${ORIGIN}/login`);
  await page.evaluate(value => { (window as unknown as { __authFixture: unknown }).__authFixture = { page: "login", replies: value }; }, replies);
  await page.addStyleTag({ content: styles });
  await page.addScriptTag({ content: loginScript });
  await expect(page.getByRole("combobox", { name: /Language|اللغة|زبان/ })).toBeVisible();
}

const languageSelect = (page: Page) => page.locator("#login-language");
const bodies = (page: Page) => page.evaluate(() => (window as unknown as { __authRequests: { body: string | null }[] }).__authRequests.map(request => JSON.parse(request.body!)));
const explicitFlag = (page: Page) => page.evaluate(() => sessionStorage.getItem("skoolee-lang-explicit"));
const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

test("AC1: switching to Arabic flips direction and copy in one render and keeps typed credentials", async ({ page }) => {
  await mountLogin(page);
  await page.locator("#email").fill("example@synthetic.invalid");
  await page.locator("#password").fill("SyntheticOnly123");
  await page.getByText("Keep me signed in for 30 days", { exact: true }).click();
  await languageSelect(page).selectOption("ar");

  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("main")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { level: 2, name: "مرحباً بعودتك" })).toBeVisible();
  await expect(page.getByRole("button", { name: "تسجيل الدخول", exact: true })).toBeVisible();
  await expect(page.getByLabel("البريد الإلكتروني للعمل", { exact: true })).toHaveValue("example@synthetic.invalid");
  await expect(page.locator("#password")).toHaveValue("SyntheticOnly123");
  await expect(page.getByLabel("ابقَ مسجّلاً لمدة 30 يوماً")).toBeChecked();
  // The option labels stay in their own script, each tagged with its language.
  await expect(languageSelect(page).locator("option")).toHaveText(["English", "العربية", "اردو"]);
  await expect(languageSelect(page).locator('option[value="ur"]')).toHaveAttribute("lang", "ur");

  // AC2 (client half): the choice is in the cookie and marked explicit for this tab.
  expect(await page.evaluate(() => document.cookie)).toContain("skoolee-lang=ar");
  expect(await explicitFlag(page)).toBe("1");

  // Zod validation renders in the chosen language.
  await page.locator("#email").fill("");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page.locator("#email")).toHaveAccessibleDescription("أدخل بريداً إلكترونياً صالحاً");
  expect(await bodies(page)).toEqual([]);
});

test("AC1: a known server error and its toast follow the chosen language", async ({ page }) => {
  await mountLogin(page, [{ status: 401, body: { error: "Invalid email or password" } }]);
  await languageSelect(page).selectOption("ur");
  await page.locator("#email").fill("example@synthetic.invalid");
  await page.locator("#password").fill("SyntheticOnly123");
  await page.getByRole("button", { name: "سائن اِن", exact: true }).click();
  await expect(page.locator("#login-error")).toHaveText("ای میل یا پاس ورڈ غلط ہے");
  await expect(page.locator("[data-sonner-toast]")).toHaveText("ای میل یا پاس ورڈ غلط ہے");
  expect((await bodies(page))[0]).toMatchObject({ language: "ur", languageSource: "explicit" });
});

test("an untouched selector sends nothing; a cookie-only language is sent as source cookie", async ({ page }) => {
  await mountLogin(page, [{ status: 401, body: { error: "Invalid email or password" } }, { status: 401, body: { error: "Invalid email or password" } }]);
  await page.locator("#email").fill("example@synthetic.invalid");
  await page.locator("#password").fill("SyntheticOnly123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("#login-error")).toBeVisible();
  // Left behind by someone else on a shared device: a cookie but no explicit flag in this tab.
  await page.evaluate(() => { document.cookie = "skoolee-lang=ar; Path=/"; });
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect.poll(async () => (await bodies(page)).length).toBe(2);
  const [first, second] = await bodies(page);
  expect(first).toEqual({ email: "example@synthetic.invalid", password: "SyntheticOnly123", rememberMe: false });
  expect(second).toEqual({ email: "example@synthetic.invalid", password: "SyntheticOnly123", rememberMe: false, language: "ar", languageSource: "cookie" });
});

test("AC9b: the explicit flag survives the MFA-ticket response and is cleared only by the session-issuing challenge", async ({ page }) => {
  await mountLogin(page, [{ body: { mfaRequired: true, user: { mfaRequired: true } } }]);
  // A saved-Arabic user explicitly picks English: choose Arabic, then English.
  await languageSelect(page).selectOption("ar");
  await languageSelect(page).selectOption("en");
  await page.locator("#email").fill("example@synthetic.invalid");
  await page.locator("#password").fill("SyntheticOnly123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __authNavigations: string[] }).__authNavigations)).toEqual(["/protect-account"]);
  expect((await bodies(page))[0]).toMatchObject({ language: "en", languageSource: "explicit" });
  expect(await explicitFlag(page)).toBe("1");

  // Same tab, same origin: /protect-account.
  await page.goto(`${ORIGIN}/protect-account`);
  await page.evaluate(() => {
    (window as unknown as { __mfaFixture: unknown }).__mfaFixture = {
      statusReplies: [{ body: { enrolled: true, school: "Synthetic School", awaitingAcknowledgement: false, resumeChallenge: false } }],
      actionReplies: [{ body: { success: true, user: { role: "PRINCIPAL", mustChangePassword: false } } }],
    };
  });
  await page.addStyleTag({ content: styles });
  await page.addScriptTag({ content: protectScript });
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  expect(await explicitFlag(page)).toBe("1");
  await page.locator("#mfa-code").fill("123456");
  await page.locator("#mfa-code").press("Enter");
  await expect.poll(() => page.evaluate(() => (window as unknown as { __mfaNavigation: string[] }).__mfaNavigation)).toEqual(["/principal"]);
  const posts = await page.evaluate(() => (window as unknown as { __mfaRequests: { method: string; body: string | null }[] }).__mfaRequests.filter(request => request.method === "POST").map(request => JSON.parse(request.body!)));
  expect(posts).toEqual([{ action: "challenge", code: "123456", recovery: false, acknowledged: false, language: "en", languageSource: "explicit" }]);
  expect(await explicitFlag(page)).toBeNull();
});

for (const language of ["ar", "ur"] as const) {
  test(`AC21: login in ${language} fits 360px, at 200% text, with reduced motion`, async ({ page }) => {
    await mountLogin(page, [], 360);
    await languageSelect(page).selectOption(language);
    await expect(page.locator("main")).toHaveAttribute("dir", "rtl");
    expect(await noHorizontalScroll(page)).toBe(true);
    const select = await languageSelect(page).boundingBox();
    expect(select!.height).toBeGreaterThanOrEqual(44);
    // The selector sits at the inline end: the left edge in RTL.
    const form = await page.locator("main > section").last().locator(":scope > div").boundingBox();
    expect(select!.x - form!.x).toBeLessThan(4);
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    expect(await noHorizontalScroll(page)).toBe(true);
    await expect(page.locator("#password")).toBeVisible();
    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
    const looping = await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === "running" && animation.effect?.getComputedTiming().iterations === Infinity).length);
    expect(looping).toBe(0);
    // Keyboard reaches the selector (Shift+Tab back from the autofocused email) and focus changes its ring via the shared token.
    const rest = await languageSelect(page).evaluate(element => getComputedStyle(element).boxShadow);
    await page.locator("#email").focus();
    await page.keyboard.press("Shift+Tab");
    await expect(languageSelect(page)).toBeFocused();
    expect(await languageSelect(page).evaluate(element => getComputedStyle(element).boxShadow)).not.toBe(rest);
  });
}

test.describe("server render (needs the dev server on :3005)", () => {
  test("AC2: the cookie renders every auth page RTL in the server HTML", async ({ page, baseURL }) => {
    await page.goto("/login");
    // A choice made before hydration is replayed after React resets the controlled select, so wait for React to own it.
    await page.waitForFunction(() => { const select = document.querySelector("#login-language"); return !!select && Object.keys(select).some(key => key.startsWith("__reactProps")); });
    await page.locator("#login-language").selectOption("ar");
    const cookies = await page.context().cookies();
    expect(cookies.find(cookie => cookie.name === "skoolee-lang")?.value).toBe("ar");
    for (const route of ["/login", "/forgot-password", "/register", "/accept-invite?token=synthetic-token"]) {
      const html = await (await page.request.get(`${baseURL}${route}`)).text();
      expect(html, route).toMatch(/<div lang="ar" dir="rtl" class="contents">/);
    }
    await page.reload();
    await expect(page.locator("main")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 2, name: "مرحباً بعودتك" })).toBeVisible();
    // An invalid cookie value is ignored, never echoed into the HTML.
    await page.context().addCookies([{ name: "skoolee-lang", value: "x\"onload", url: baseURL! }]);
    const html = await (await page.request.get(`${baseURL}/login`)).text();
    expect(html).toMatch(/<div lang="en" dir="ltr" class="contents">/);
    expect(html).not.toContain("onload\"");
  });
});
