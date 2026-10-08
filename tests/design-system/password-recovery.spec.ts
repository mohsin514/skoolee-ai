import { test, expect, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { resolve } from "node:path";

type Outcome = "success" | "error" | "pending";
type Scenario = { token?: string; verification?: "valid" | "invalid" | "error" | "pending"; request?: Outcome; reset?: Outcome; language?: "en" | "ar" | "ur" };
type FixtureWindow = Window & {
  __recoveryFixture: Scenario;
  __recoveryCalls: string[];
  __recoveryNavigation: string[];
  __finishRecovery: (action: string, outcome: string) => void;
};
type FixtureBuilder = {
  onResolve: (options: { filter: RegExp }, callback: (args: { path: string }) => { path: string; namespace: string }) => void;
  onLoad: (options: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => { contents: string; loader: "jsx"; resolveDir: string }) => void;
};
const requireFromTsx = createRequire(require.resolve("tsx"));
const { build } = requireFromTsx("esbuild");
let fixtureScript: string;
let fixtureCss: string;
const modules: Record<string, string> = {
  "@/app/actions/auth/reset": `
    const pending = {};
    window.__recoveryCalls = []; window.__recoveryNavigation = [];
    function result(action, outcome) {
      if (outcome === "error") throw Error(action === "verify" ? "Synthetic verification failure" : "Synthetic service failure. Try again.");
      return action === "verify" ? { valid: outcome !== "invalid" } : { success: true };
    }
    window.__finishRecovery = (action, outcome) => {
      const waiter = pending[action];
      try { waiter.resolve(result(action, outcome)); } catch (error) { waiter.reject(error); }
    };
    async function run(action, outcome) {
      window.__recoveryCalls.push(action);
      if (outcome === "pending") return new Promise((resolve, reject) => { pending[action] = { resolve, reject }; });
      return result(action, outcome);
    }
    export const verifyToken = () => run("verify", window.__recoveryFixture.verification || "valid");
    export const requestPasswordReset = () => run("request", window.__recoveryFixture.request || "success");
    export const resetPassword = () => run("reset", window.__recoveryFixture.reset || "success");
  `,
  "next/navigation": `export function useSearchParams() { return new URLSearchParams(window.__recoveryFixture.token ? {token: window.__recoveryFixture.token} : {}); } export function useRouter() { return { push: path => window.__recoveryNavigation.push(path) }; }`,
  "next/link": `import React from "react"; export default function Link(props) { return <a {...props} />; }`,
  "sonner": `export const toast = { error() {}, success() {} };`,
  "@/components/locale/LocaleProvider": `export function useLocale() { return { language: window.__recoveryFixture.language || "en" }; } export function useUiText() { return source => source; }`,
};

test.beforeAll(async () => {
  const output = await build({
    entryPoints: [resolve("tests/design-system/fixtures/password-recovery.tsx")], bundle: true, write: false, outdir: "/private/tmp/recovery-fixture",
    platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"test"' }, loader: { ".module.css": "local-css" },
    plugins: [{ name: "synthetic-recovery-boundaries", setup(builder: FixtureBuilder) {
      builder.onResolve({ filter: /^(@\/app\/actions\/auth\/reset|next\/navigation|next\/link|sonner|@\/components\/locale\/LocaleProvider)$/ }, args => ({ path: args.path, namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: modules[args.path], loader: "jsx", resolveDir: process.cwd() }));
    } }],
  });
  fixtureScript = output.outputFiles.find((file: { path: string }) => file.path.endsWith(".js")).text;
  fixtureCss = output.outputFiles.find((file: { path: string }) => file.path.endsWith(".css"))?.text || "";
});

async function mount(page: Page, scenario: Scenario = {}) {
  // Real no-token route is read-only. All submitted fixture forms use mocked modules;
  // backend code, tokens, email and password payloads never leave the browser fixture.
  await page.goto("/forgot-password");
  await expect(page.getByText("Recover account", { exact: true })).toBeVisible();
  const source = await page.evaluate(() => ({
    html: document.documentElement.className, body: document.body.className,
    styles: Array.from(document.querySelectorAll('link[rel="stylesheet"], style')).map(node => {
      const copy = node.cloneNode(true) as HTMLElement;
      if (node instanceof HTMLLinkElement) copy.setAttribute("href", node.href);
      return copy.outerHTML;
    }).join("\n"),
  }));
  const language = scenario.language || "en";
  await page.route("**/__password_recovery_fixture__", route => route.fulfill({
    contentType: "text/html", body: `<!doctype html><html class="${source.html}" lang="${language}" dir="${language === "en" ? "ltr" : "rtl"}"><head>${source.styles}<style>${fixtureCss}</style></head><body class="${source.body}"><div id="recovery-fixture"></div></body></html>`,
  }));
  await page.goto("/__password_recovery_fixture__");
  await page.evaluate(value => { (window as unknown as FixtureWindow).__recoveryFixture = value; }, scenario);
  await page.addScriptTag({ content: fixtureScript });
}

async function calls(page: Page) { return page.evaluate(() => (window as unknown as FixtureWindow).__recoveryCalls); }

// Target assertions run against the original page first to document reproducible defects.
test("request invalid field is programmatically linked", async ({ page }) => {
  await mount(page);
  await page.getByRole("button", { name: "Send reset link" }).click();
  const email = page.getByRole("textbox", { name: "Email Identity", exact: true });
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(email).toHaveAccessibleDescription("Invalid email address");
  await expect(email).toBeFocused();
  expect(await calls(page)).toEqual([]);
});

test("password visibility actions are keyboard accessible", async ({ page }) => {
  await mount(page, { token: "synthetic-token" });
  const password = page.getByLabel(/^New Password/);
  await expect(password).toBeVisible();
  const toggle = page.getByRole("button", { name: "Show new password", exact: true });
  await toggle.focus(); await page.keyboard.press("Enter");
  await expect(password).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Hide new password", exact: true }).press("Space");
  await expect(password).toHaveAttribute("type", "password");
  expect(await calls(page)).toEqual(["verify"]);
});

test("read-only actual request responsive shell", async ({ page }) => {
  await page.goto("/forgot-password");
  await expect(page.getByText("Recover account", { exact: true })).toBeVisible();
  for (const viewport of [{width:1440,height:1000},{width:768,height:1024},{width:390,height:844}]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({path:`test-results/design-system/evidence/auth-password-recovery/${process.env.RECOVERY_BASELINE ? "baseline-" : ""}request-${viewport.width}.png`,fullPage:true});
  }
});

async function fillPasswords(page: Page, value = "Synthetic9!") {
  await page.getByLabel(/^New Password/).fill(value);
  await page.getByLabel(/^Confirm Password/).fill(value);
}

async function finish(page: Page, action: string, outcome: string) {
  await page.evaluate(({ action, outcome }) => (window as unknown as FixtureWindow).__finishRecovery(action, outcome), { action, outcome });
}

test("request pending, persistent failure, retry and enumeration-safe success", async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await mount(page, { request: "pending" });
  const email = page.getByRole("textbox", { name: "Email Identity", exact: true });
  await email.fill("synthetic@example.invalid"); await email.press("Enter");
  await expect(page.getByRole("button", { name: "Sending…" })).toBeDisabled();
  await expect(page.getByRole("status")).toHaveText("Sending…");
  await expect(email).toHaveAttribute("readonly", "");
  await email.press("Enter");
  expect(await calls(page)).toEqual(["request"]);
  await finish(page, "request", "error");
  await expect(page.getByRole("alert")).toHaveText("Synthetic service failure. Try again.");
  await expect(page.getByRole("group", {name:"Synthetic service failure. Try again."})).toBeFocused();
  await expect(email).toHaveValue("synthetic@example.invalid");
  await page.screenshot({path:"test-results/design-system/evidence/auth-password-recovery/request-error-390.png",fullPage:true});
  await expect(email).not.toHaveAttribute("readonly");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await finish(page, "request", "success");
  await expect(page.getByRole("heading", { level: 1, name: "Check your inbox" })).toBeFocused();
  await expect(page.getByText(/If an eligible account exists/)).toContainText("try again in five minutes");
  await expect(page.getByRole("button", { name: /Send|Resend/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Back to login" })).toHaveAttribute("href", "/login");
  expect(await calls(page)).toEqual(["request", "request"]);
  await page.screenshot({path:"test-results/design-system/evidence/auth-password-recovery/request-success-390.png",fullPage:true});
});

test("verification pending, rejected retry, and expired link preserve server result", async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await mount(page, { token: "synthetic-token", verification: "pending" });
  await expect(page.getByRole("status")).toHaveText("Verifying link…");
  await expect(page.locator("input")).toHaveCount(0);
  await finish(page, "verify", "error");
  await expect(page.getByRole("heading", { level: 1, name: "Unable to verify link" })).toBeFocused();
  await page.screenshot({path:"test-results/design-system/evidence/auth-password-recovery/verification-error-390.png",fullPage:true});
  await page.getByRole("button", { name: "Try again" }).press("Enter");
  await expect(page.getByRole("status")).toHaveText("Verifying link…");
  await finish(page, "verify", "invalid");
  await expect(page.getByRole("heading", { level: 1, name: "Link expired" })).toBeFocused();
  await page.screenshot({path:"test-results/design-system/evidence/auth-password-recovery/expired-390.png",fullPage:true});
  await page.getByRole("button", { name: "Request new link" }).press("Space");
  expect(await page.evaluate(() => (window as unknown as FixtureWindow).__recoveryNavigation)).toEqual(["/forgot-password"]);
  expect(await calls(page)).toEqual(["verify", "verify"]);
});

test("reset constraints, linked errors, busy protection, failure and success navigation", async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await mount(page, { token: "synthetic-token", reset: "pending" });
  const password = page.getByLabel(/^New Password/);
  const confirm = page.getByLabel(/^Confirm Password/);
  const save = page.getByRole("button", { name: "Save new password" });
  await save.click();
  await expect(password).toHaveAttribute("aria-invalid", "true");
  await expect(password).toHaveAccessibleDescription(/Password must be at least 8 characters/);
  await expect(password).toBeFocused();
  for (const weakValue of ["lowercase9!", "Uppercase!", "Uppercase9"]) {
    await fillPasswords(page, weakValue); await save.click();
    await expect(password).toHaveAccessibleDescription(/Please satisfy all security requirements/);
  }
  expect(await calls(page)).toEqual(["verify"]);
  await fillPasswords(page); await confirm.fill("Different9!"); await save.click();
  await expect(confirm).toHaveAttribute("aria-invalid", "true");
  await expect(confirm).toHaveAccessibleDescription(/Passwords don't match/);
  await confirm.fill("Synthetic9!");
  await expect(page.locator("#password-requirements li").filter({hasText:"Not yet met:"})).toHaveCount(0);
  await page.getByRole("button", { name: "Show confirmed password" }).press("Enter");
  await expect(confirm).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Hide confirmed password" }).press("Space");
  await expect(confirm).toHaveAttribute("type", "password");
  await confirm.press("Enter");
  await expect(page.getByRole("button", { name: "Saving…" })).toBeDisabled();
  await expect(password).toHaveAttribute("readonly", "");
  await expect(page.getByRole("button", { name: "Show new password" })).toBeDisabled();
  await finish(page, "reset", "error");
  await expect(page.getByRole("alert")).toHaveText("Synthetic service failure. Try again.");
  await expect(page.getByRole("group", {name:"Synthetic service failure. Try again."})).toBeFocused();
  await expect(password).toHaveValue("Synthetic9!");
  await page.screenshot({path:"test-results/design-system/evidence/auth-password-recovery/reset-error-390.png",fullPage:true});
  await save.click(); await finish(page, "reset", "success");
  expect(await page.evaluate(() => (window as unknown as FixtureWindow).__recoveryNavigation)).toEqual(["/login"]);
  expect(await calls(page)).toEqual(["verify", "reset", "reset"]);
});

for (const language of ["en", "ar", "ur"] as const) {
  test(`recovery responsive controls: ${language} direction with existing English copy`, async ({ page }) => {
    await mount(page, { token: "synthetic-token", language });
    await expect(page.getByRole("heading", { level:1, name:"New password" })).toBeVisible();
    for (const viewport of [{width:1440,height:1000},{width:768,height:1024},{width:390,height:844},{width:320,height:720}]) {
      await page.setViewportSize(viewport);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      for (const input of await page.locator("input").all()) {
        const group = input.locator("..");
        const box = await group.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
        await expect(input).toHaveAttribute("aria-required", "true");
        const bounds = await input.evaluate(element => ({ width: element.getBoundingClientRect().width, groupWidth: element.parentElement!.clientWidth }));
        expect(bounds.width).toBeGreaterThan(70);
        expect(bounds.width).toBeLessThan(bounds.groupWidth);
      }
      const firstGroup = page.locator(".sk-input-group").first();
      const icon = await firstGroup.locator('[data-field-affix="start"]').boundingBox();
      const toggle = await firstGroup.getByRole("button").boundingBox();
      expect(toggle!.width).toBeGreaterThanOrEqual(44); expect(toggle!.height).toBeGreaterThanOrEqual(44);
      expect(language === "en" ? icon!.x < toggle!.x : icon!.x > toggle!.x).toBe(true);
      await page.screenshot({path:`test-results/design-system/evidence/auth-password-recovery/reset-${language}-${viewport.width}.png`,fullPage:true});
    }
  });
}
