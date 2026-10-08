import { test, expect, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AuthFixtureConfig } from "./auth-login-invite.fixture";

const workspaceRequire = createRequire(createRequire(path.join(process.cwd(), "package.json")).resolve("tsx"));
const { build } = workspaceRequire("esbuild");
const { compile } = workspaceRequire("@tailwindcss/node");
const { Scanner } = workspaceRequire("@tailwindcss/oxide");
let script: string;
let styles: string;
const pendingInvite = {
  success: true, status: "pending", contextKey: "synthetic-context", role: "TEACHER", institutionName: "Example Institution",
  campusName: "Example Campus", invitedBy: "Example Administrator", expiresAt: "2030-10-08T12:00:00Z",
  canPurchaseSubscription: false, canManageMemberships: false,
};

test.beforeAll(async () => {
  const root = process.cwd();
  const result = await build({
    entryPoints: [path.join(root, "tests/design-system/auth-login-invite.fixture.tsx")],
    bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"' }, tsconfig: path.join(root, "tsconfig.json"),
    plugins: [{ name: "synthetic-auth-boundaries", setup(builder: {
      onResolve: (options: { filter: RegExp }, callback: (args: { path: string }) => unknown) => void;
      onLoad: (options: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => unknown) => void;
    }) {
      builder.onResolve({ filter: /^(next\/(navigation|link)|@\/app\/actions\/invite|@\/components\/locale\/LocaleProvider)$/ }, args => ({ path: args.path, namespace: "auth-stub" }));
      builder.onResolve({ filter: /\.module\.css$/ }, args => ({ path: args.path, namespace: "auth-stub" }));
      builder.onLoad({ filter: /.*/, namespace: "auth-stub" }, args => ({ loader: "jsx", resolveDir: root, contents:
        args.path === "next/navigation" ? 'const query=new URLSearchParams(location.search);const router={push:(url)=>window.__authNavigations.push(url)};export const useRouter=()=>router;export const useSearchParams=()=>query;'
          : args.path === "next/link" ? 'import React from "react";export default function Link({children,...props}){return <a {...props}>{children}</a>}'
            : args.path.includes("actions/invite") ? 'export const acceptInvite=(...args)=>window.__fixtureAcceptInvite(...args);'
              : args.path.includes("LocaleProvider") ? 'export const useLocale=()=>({language:"en",timezone:"UTC",weekStartsOn:1});export const useUiText=()=>text=>text;'
                : 'export default {}',
      }));
    } }],
  });
  script = result.outputFiles[0].text;
  const compiler = await compile(await readFile(path.join(root, "src/app/globals.css"), "utf8"), { base: path.join(root, "src/app"), onDependency() {} });
  const scanner = new Scanner({ sources: [
    { base: root, pattern: "src/components/**/*.tsx", negated: false },
    { base: root, pattern: "src/app/(auth)/{login,accept-invite}/page.tsx", negated: false },
  ] });
  styles = compiler.build(scanner.scan());
});

async function mount(page: Page, config: AuthFixtureConfig, options: { width?: number; language?: string; query?: string } = {}) {
  await page.setViewportSize({ width: options.width ?? 390, height: 844 });
  const language = options.language ?? "en";
  const direction = language === "en" ? "ltr" : "rtl";
  await page.route("**/*", route => route.request().isNavigationRequest()
    ? route.fulfill({ contentType: "text/html", body: `<html lang="${language}" dir="${direction}"><body><div id="fixture-root"></div></body></html>` })
    : route.abort());
  await page.goto(`http://auth-fixture.test/${config.page}${options.query ?? (config.page === "invite" ? "?token=synthetic-token" : "")}`);
  await page.evaluate(value => { window.__authFixture = value; }, config);
  await page.addStyleTag({ content: styles });
  await page.addScriptTag({ content: script });
}

async function fillLogin(page: Page) {
  await page.getByLabel("Work Email", { exact: true }).fill("example@synthetic.invalid");
  await page.getByLabel("Password", { exact: true }).fill("SyntheticOnly123");
}

async function fillInvite(page: Page) {
  await page.locator("#fullName").fill("Example Person");
  await page.locator("#password").fill("SyntheticOnly123");
  await page.locator("#confirmPassword").fill("SyntheticOnly123");
}

test("login validation is linked, reveal state is exposed, and no empty request is sent", async ({ page }) => {
  await mount(page, { page: "login" });
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByLabel("Work Email", { exact: true })).toHaveAccessibleDescription("Valid email required");
  await expect(page.getByLabel("Password", { exact: true })).toHaveAccessibleDescription("Password required");
  await expect(page.getByLabel("Work Email", { exact: true })).toBeFocused();
  expect(await page.evaluate(() => window.__authRequests)).toEqual([]);
  const reveal = page.getByRole("button", { name: "Show password", exact: true });
  await expect(reveal).toHaveAttribute("aria-pressed", "false");
  await reveal.click();
  await expect(page.getByRole("button", { name: "Hide password", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#password")).toHaveAttribute("type", "text");
});

test("invite uses the shared language field and translated no-token notice", async ({ page }) => {
  await mount(page, { page: "invite" }, { query: "", language: "ur" });
  await expect(page.getByRole("combobox")).toHaveClass(/sk-select/);
  await expect(page.getByRole("alert")).toContainText("دعوت کا لنک مکمل نہیں");
  expect(await page.evaluate(() => window.__authRequests)).toEqual([]);
});

test("login server error is focused, preserves credentials and remember choice, and supports cooldown", async ({ page }) => {
  await mount(page, { page: "login", replies: [{ status: 429, headers: { "Retry-After": "2" }, body: { error: "Synthetic rate limit" } }] });
  await fillLogin(page);
  await page.getByText("Keep me signed in for 30 days", { exact: true }).click();
  await expect(page.getByLabel("Keep me signed in for 30 days")).toBeChecked();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("#login-error")).toBeFocused();
  await expect(page.locator("#login-error")).toHaveText("Synthetic rate limit");
  await expect(page.locator("#password")).toHaveValue("SyntheticOnly123");
  await expect(page.getByRole("button", { name: /Try again in/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
  const requests = await page.evaluate(() => window.__authRequests);
  expect(JSON.parse(requests[0].body!)).toEqual({ email: "example@synthetic.invalid", password: "SyntheticOnly123", rememberMe: true });
  await page.screenshot({ path: test.info().outputPath("login-recoverable-error.png"), fullPage: true });
});

test("school selection retains credentials and the selected scope on a second pass", async ({ page }) => {
  await mount(page, { page: "login", replies: [
    { body: { needsSchoolSelection: true, schools: [{ schoolId: "synthetic-school", schoolName: "Example School", campusName: "Example Campus", role: "TEACHER" }] } },
    { body: { user: { fullName: "Example Person", role: "TEACHER", onboardingComplete: true } }, pending: true },
  ] });
  await fillLogin(page);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Choose your school" })).toBeFocused();
  await page.getByRole("button", { name: /Example School/ }).click();
  await expect(page.getByRole("button", { name: /Example School/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Use a different account" })).toBeDisabled();
  await page.evaluate(() => window.dispatchEvent(new Event("auth:release")));
  await expect.poll(() => page.evaluate(() => window.__authNavigations)).toEqual(["/teacher"]);
  const requests = await page.evaluate(() => window.__authRequests);
  expect(JSON.parse(requests[1].body!)).toEqual({ email: "example@synthetic.invalid", password: "SyntheticOnly123", rememberMe: false, schoolId: "synthetic-school" });
});

for (const scenario of [
  { user: { role: "PRINCIPAL", mfaRequired: true }, path: "/protect-account" },
  { user: { role: "PRINCIPAL", mustChangePassword: true }, path: "/first-login" },
  { user: { role: "TEACHER", onboardingComplete: false }, path: "/teacher-onboarding" },
  { user: { role: "PARENT" }, path: "/parent" },
]) {
  test(`synthetic login keeps the ${scenario.path} handoff`, async ({ page }) => {
    await mount(page, { page: "login", replies: [{ body: { user: { fullName: "Example Person", ...scenario.user } }, pending: true }] });
    await fillLogin(page);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("button", { name: "Signing in…" })).toBeDisabled();
    await page.evaluate(() => window.dispatchEvent(new Event("auth:release")));
    await expect.poll(() => page.evaluate(() => window.__authNavigations)).toEqual([scenario.path]);
  });
}

test("invitation requirements, reveal, pending, rejection, and scoped action payload stay intact", async ({ page }) => {
  await mount(page, { page: "invite", inviteReply: { body: pendingInvite }, acceptError: "Synthetic invitation failure", acceptPending: true });
  await expect(page.getByRole("button", { name: "Activate account" })).toBeDisabled();
  await fillInvite(page);
  await expect(page.locator("#password")).toHaveAttribute("autocomplete", "new-password");
  await expect(page.locator("#password")).toHaveAttribute("aria-describedby", /password-requirements/);
  const reveal = page.getByRole("button", { name: "Password: show" });
  await reveal.click();
  await expect(page.getByRole("button", { name: "Password: hide" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#confirmPassword")).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Activate account" }).click();
  await expect(page.getByRole("button", { name: "Activating account…" })).toBeDisabled();
  await page.evaluate(() => window.dispatchEvent(new Event("auth:release")));
  await expect(page.locator("#invite-error")).toBeFocused();
  await expect(page.locator("#password")).toHaveValue("SyntheticOnly123");
  expect(await page.evaluate(() => window.__authAcceptCalls)).toEqual([["synthetic-token", "SyntheticOnly123", "Example Person", "synthetic-context"]]);
  await page.screenshot({ path: test.info().outputPath("invite-recoverable-error.png"), fullPage: true });
});

test("invitation status loading and password mismatch block activation", async ({ page }) => {
  await mount(page, { page: "invite", inviteReply: { body: pendingInvite, pending: true } });
  await expect(page.getByRole("status")).toHaveText("Validating invitation status…");
  await expect(page.getByRole("button", { name: "Activate account" })).toBeDisabled();
  await page.evaluate(() => window.dispatchEvent(new Event("auth:release")));
  await fillInvite(page);
  await page.locator("#confirmPassword").fill("DifferentSynthetic123");
  await expect(page.getByRole("button", { name: "Activate account" })).toBeDisabled();
  await expect(page.getByRole("listitem", { name: "Passwords match: Needed" })).toBeVisible();
  expect(await page.evaluate(() => window.__authAcceptCalls)).toEqual([]);
});

for (const notice of [
  { query: "?verified=true", message: "Account verified. Please log in." },
  { query: "?invite=accepted", message: "Invitation accepted. Log in with your new password." },
  { query: "?reason=session-expired", message: "Your session has ended. Please sign in again." },
]) {
  test(`synthetic login notice ${notice.query} remains visible and clears its query`, async ({ page }) => {
    await mount(page, { page: "login" }, { query: notice.query });
    await expect(page.locator("[data-sonner-toast]")).toHaveText(notice.message);
    await expect(page).toHaveURL("http://auth-fixture.test/login");
    expect(await page.evaluate(() => window.__authRequests)).toEqual([]);
  });
}

for (const message of [
  "Invalid verification link", "This verification link is invalid or has expired", "User not found", "Verification failed",
]) {
  test(`verification redirect error is persistent and focused: ${message}`, async ({ page }) => {
    await mount(page, { page: "login" }, { query: `?error=${encodeURIComponent(message)}&redirect=%2Fparent` });
    await expect(page.locator("#login-error")).toHaveText(message);
    await expect(page.locator("#login-error")).toBeFocused();
    await expect(page).toHaveURL("http://auth-fixture.test/login?redirect=%2Fparent");
    expect(await page.evaluate(() => window.__authRequests)).toEqual([]);
    expect(await page.evaluate(() => window.__authNavigations)).toEqual([]);
  });
}

test("unknown query error uses fixed safe text and successful status priority is unchanged", async ({ page }) => {
  await mount(page, { page: "login" }, { query: `?error=${encodeURIComponent('<img src=x onerror="alert(1)">')}` });
  await expect(page.locator("#login-error")).toHaveText("Unable to verify this link. Please open the latest verification email and try again.");
  await expect(page.locator("#login-error img")).toHaveCount(0);
  await page.reload();
  await page.evaluate(() => { window.__authFixture = { page: "login" }; });
  await page.evaluate(() => history.replaceState(null, "", "/login?verified=true&invite=accepted&reason=session-expired&error=Verification+failed&redirect=%2Fparent"));
  await page.addStyleTag({ content: styles });
  await page.addScriptTag({ content: script });
  await expect(page.locator("[data-sonner-toast]")).toHaveText("Account verified. Please log in.");
  await expect(page.locator("#login-error")).toHaveCount(0);
  await expect(page).toHaveURL("http://auth-fixture.test/login?redirect=%2Fparent");
});

test("synthetic invitation success preserves the login redirect", async ({ page }) => {
  await mount(page, { page: "invite", inviteReply: { body: pendingInvite } });
  await fillInvite(page);
  await page.getByRole("button", { name: "Activate account" }).click();
  await expect.poll(() => page.evaluate(() => window.__authNavigations)).toEqual(["/login?invite=accepted"]);
  await expect(page.locator('[data-sonner-toast][data-type="success"]')).toContainText("Example Institution");
});

for (const status of ["invalid", "expired", "cancelled", "accepted"] as const) {
  test(`synthetic ${status} invitation cannot activate`, async ({ page }) => {
    await mount(page, { page: "invite", inviteReply: { body: { success: true, status } } });
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByRole("button", { name: "Activate account" })).toBeDisabled();
    if (status === "expired") {
      await page.getByRole("button", { name: "Request a new link" }).click();
      await expect(page.getByRole("alert")).toContainText("If the invitation is still available");
      expect(await page.evaluate(() => window.__authRequests.filter(request => request.method === "POST"))).toEqual([
        { url: "/api/invite/reissue", method: "POST", body: JSON.stringify({ token: "synthetic-token" }) },
      ]);
    }
    expect(await page.evaluate(() => window.__authAcceptCalls)).toEqual([]);
  });
}

for (const language of ["en", "ar", "ur"]) {
  for (const width of [390, 768, 1440]) {
    test(`invitation field layout fits ${language} at ${width}px`, async ({ page }) => {
      await mount(page, { page: "invite", inviteReply: { body: pendingInvite } }, { width, language });
      await expect(page.locator("#fullName")).toBeVisible();
      await expect(page.locator("main")).toHaveAttribute("dir", language === "en" ? "ltr" : "rtl");
      const bounds = await page.getByRole("combobox").boundingBox();
      expect(bounds!.height).toBeGreaterThanOrEqual(48);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.locator("#password").focus();
      await page.screenshot({ path: test.info().outputPath(`invite-${language}-${width}.png`), fullPage: true });
    });
  }
}
