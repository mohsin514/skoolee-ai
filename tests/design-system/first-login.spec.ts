import { test, expect, type Page, type Route } from "@playwright/test";
import { createRequire } from "node:module";
import { resolve } from "node:path";

type FixtureWindow = Window & { __firstLoginLanguage: string; __firstLoginNavigation: string[]; __firstLoginRefreshes: number };
type FixtureBuilder = {
  onResolve: (options: { filter: RegExp }, callback: (args: { path: string }) => { path: string; namespace: string }) => void;
  onLoad: (options: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => { contents: string; loader: "js" }) => void;
};
const requireFromTsx = createRequire(require.resolve("tsx"));
const { build } = requireFromTsx("esbuild");
let fixtureScript: string;
let fixtureCss: string;
const modules: Record<string, string> = {
  "next/navigation": `window.__firstLoginNavigation = []; window.__firstLoginRefreshes = 0; export function useRouter() { return { push: path => window.__firstLoginNavigation.push(path), refresh: () => window.__firstLoginRefreshes++ }; }`,
  "sonner": `export const toast = { error() {}, success() {} };`,
  "@/components/locale/LocaleProvider": `export function useLocale() { return { language: window.__firstLoginLanguage || "en" }; } export function useUiText() { return source => source; }`,
};

test.beforeAll(async () => {
  const output = await build({
    entryPoints: [resolve("tests/design-system/fixtures/first-login.tsx")], bundle: true, write: false, outdir: "/private/tmp/first-login-fixture",
    platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"test"' }, loader: { ".module.css": "local-css" },
    plugins: [{ name: "synthetic-first-login-boundaries", setup(builder: FixtureBuilder) {
      builder.onResolve({ filter: /^(next\/navigation|sonner|@\/components\/locale\/LocaleProvider)$/ }, args => ({ path: args.path, namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: modules[args.path], loader: "js" }));
    } }],
  });
  fixtureScript = output.outputFiles.find((file: { path: string }) => file.path.endsWith(".js")).text;
  fixtureCss = output.outputFiles.find((file: { path: string }) => file.path.endsWith(".css"))?.text || "";
});

async function mount(page: Page, language = "en") {
  // Load real public CSS read-only; fixture submissions are always intercepted.
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
  await page.route("**/api/auth/first-password", route => route.fulfill({ status: 500, json: { error: "Synthetic service failure. Try again." } }));
  await page.route("**/__first_login_fixture__", route => route.fulfill({
    contentType: "text/html", body: `<!doctype html><html class="${source.html}" lang="${language}" dir="${language === "en" ? "ltr" : "rtl"}"><head>${source.styles}<style>${fixtureCss}</style></head><body class="${source.body}"><div id="first-login-fixture"></div></body></html>`,
  }));
  await page.goto("/__first_login_fixture__");
  await page.evaluate(value => { (window as unknown as FixtureWindow).__firstLoginLanguage = value; }, language);
  await page.addScriptTag({ content: fixtureScript });
  await expect(page.getByRole("heading", {level:1,name:"Set your password"})).toBeVisible();
}

async function fillPasswords(page: Page, value = "Synthetic9") {
  await page.getByLabel(/^New Password/).fill(value);
  await page.getByLabel(/^Confirm Password/).fill(value);
}

// Run these two regression targets against the original page before implementation.
test("confirmation mismatch has an accessible error description", async ({ page }) => {
  await mount(page);
  await fillPasswords(page);
  const confirm = page.getByLabel(/^Confirm Password/);
  await confirm.fill("Different9");
  await expect(confirm).toHaveAttribute("aria-invalid", "true");
  await expect(confirm).toHaveAccessibleDescription(/Passwords do not match/);
});

test("pending save stays named and fields are protected", async ({ page }) => {
  await mount(page);
  const pending: Route[] = [];
  await page.route("**/api/auth/first-password", route => { pending.push(route); });
  await fillPasswords(page);
  await page.getByRole("button", {name:"Save and continue"}).click();
  await expect(page.getByRole("button", {name:"Saving…"})).toBeDisabled();
  await expect(page.getByLabel(/^New Password/)).toHaveAttribute("readonly", "");
  await expect(page.getByLabel(/^Confirm Password/)).toHaveAttribute("readonly", "");
  expect(pending).toHaveLength(1);
  expect(pending[0].request().method()).toBe("PUT");
  expect(pending[0].request().postDataJSON()).toEqual({newPassword:"Synthetic9"});
  await pending[0].fulfill({status:500,json:{error:"Synthetic service failure. Try again."}});
});

test("read-only anonymous route guard and synthetic geometry", async ({ page }) => {
  await page.goto("/first-login");
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await mount(page);
  for (const viewport of [{width:1440,height:1000},{width:768,height:1024},{width:390,height:844}]) {
    await page.setViewportSize(viewport);
    await page.screenshot({path:`test-results/design-system/evidence/auth-first-login/${process.env.FIRST_LOGIN_BASELINE ? "baseline-" : ""}first-login-${viewport.width}.png`,fullPage:true});
  }
});

test("required password rules, recommended symbol and independent keyboard reveals", async ({ page }) => {
  await mount(page);
  const password = page.getByLabel(/^New Password/);
  const confirm = page.getByLabel(/^Confirm Password/);
  const save = page.getByRole("button", {name:"Save and continue"});
  await expect(save).toBeDisabled();
  await expect(password).toHaveAccessibleDescription(/One symbol \(recommended\)/);
  for (const weakValue of ["Abc123", "12345678", "LettersOnly"]) {
    await fillPasswords(page, weakValue);
    await expect(save).toBeDisabled();
    await expect(password).toHaveAccessibleDescription(/Use at least 8 characters, including one letter and one number/);
  }
  await fillPasswords(page, "Synthetic9");
  await expect(save).toBeEnabled();
  await page.getByRole("button", {name:"Show new password",exact:true}).press("Enter");
  await expect(password).toHaveAttribute("type","text"); await expect(confirm).toHaveAttribute("type","password");
  await page.getByRole("button", {name:"Hide new password",exact:true}).press("Space");
  await expect(password).toHaveAttribute("type","password");
  await page.getByRole("button", {name:"Show confirmed password",exact:true}).press("Enter");
  await expect(confirm).toHaveAttribute("type","text"); await expect(password).toHaveAttribute("type","password");
  await page.getByRole("button", {name:"Hide confirmed password",exact:true}).press("Space");
  await expect(confirm).toHaveAttribute("type","password");
});

test("server error is persistent and focused; retry preserves values", async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await mount(page);
  await page.route("**/api/auth/first-password", route => route.fulfill({status:400,json:{error:"Choose a password different from the one you were given"}}));
  await fillPasswords(page);
  await page.getByLabel(/^Confirm Password/).press("Enter");
  await expect(page.getByRole("alert")).toHaveText("Choose a password different from the one you were given");
  await expect(page.getByRole("group", {name:"Choose a password different from the one you were given"})).toBeFocused();
  await expect(page.getByLabel(/^New Password/)).toHaveValue("Synthetic9");
  await expect(page.getByLabel(/^Confirm Password/)).toHaveValue("Synthetic9");
  await expect(page.getByRole("button",{name:"Save and continue"})).toBeEnabled();
  await page.screenshot({path:"test-results/design-system/evidence/auth-first-login/error-390.png",fullPage:true});
  await page.route("**/api/auth/first-password", route => route.fulfill({status:200,json:{role:"ADMIN",onboardingComplete:true}}));
  await page.getByRole("button",{name:"Save and continue"}).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as FixtureWindow).__firstLoginNavigation)).toEqual(["/admin"]);
});

for (const scenario of [
  {role:"TEACHER",onboardingComplete:false,target:"/teacher-onboarding"},
  {role:"TEACHER",onboardingComplete:true,target:"/teacher"},
  {role:"STUDENT",onboardingComplete:true,target:"/student"},
  {role:"UNKNOWN_SYNTHETIC_ROLE",onboardingComplete:true,target:"/login"},
]) {
  test(`synthetic saved destination ${scenario.role} ${scenario.onboardingComplete}`, async ({ page }) => {
    await mount(page);
    const requests: {method:string;data:unknown}[] = [];
    await page.route("**/api/auth/first-password", route => {
      requests.push({method:route.request().method(),data:route.request().postDataJSON()});
      return route.fulfill({status:200,json:{role:scenario.role,onboardingComplete:scenario.onboardingComplete}});
    });
    await fillPasswords(page);
    await page.getByLabel(/^Confirm Password/).press("Enter");
    await expect.poll(() => page.evaluate(() => (window as unknown as FixtureWindow).__firstLoginNavigation)).toEqual([scenario.target]);
    expect(await page.evaluate(() => (window as unknown as FixtureWindow).__firstLoginRefreshes)).toBe(1);
    expect(requests).toEqual([{method:"PUT",data:{newPassword:"Synthetic9"}}]);
  });
}

for (const language of ["en","ar","ur"]) {
  test(`first-login responsive ${language} direction with existing English copy`, async ({ page }) => {
    await mount(page,language);
    for (const viewport of [{width:1440,height:1000},{width:768,height:1024},{width:390,height:844},{width:320,height:720}]) {
      await page.setViewportSize(viewport);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const heading = page.getByRole("heading",{level:1});
      expect(await heading.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      for (const group of await page.locator(".sk-input-group").all()) {
        const input = group.locator("input");
        await expect(input).toHaveAttribute("aria-required","true");
        const box = await group.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44);
        const toggle = await group.getByRole("button").boundingBox();
        expect(toggle!.height).toBeGreaterThanOrEqual(44); expect(toggle!.width).toBeGreaterThanOrEqual(44);
        const icon = await group.locator('[data-field-affix="start"]').boundingBox();
        expect(language === "en" ? icon!.x < toggle!.x : icon!.x > toggle!.x).toBe(true);
      }
      await page.screenshot({path:`test-results/design-system/evidence/auth-first-login/first-login-${language}-${viewport.width}.png`,fullPage:true});
    }
  });
}
