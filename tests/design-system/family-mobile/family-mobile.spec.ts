import { test, expect, type Locator, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { translateUi } from "../../../src/lib/locale/ui-messages";
import { LONG_ROLL_A, LONG_ROLL_B } from "./data-mock";

const toolRequire = createRequire(createRequire(path.join(process.cwd(), "package.json")).resolve("tsx"));
const { build } = toolRequire("esbuild");
const { compile } = toolRequire("@tailwindcss/node");
const { Scanner } = toolRequire("@tailwindcss/oxide");
let js: string, css: string;
test.beforeAll(async () => {
  const root = process.cwd(), fixture = path.join(root, "tests/design-system/family-mobile"), mock = path.join(fixture, "boundary-mock.tsx");
  const bundled = await build({ entryPoints: [path.join(fixture, "fixture.tsx")], outfile: path.join(fixture, "unused-output.js"), bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"development"', "process.env": "{}" }, alias: {
    "@/components/chat": mock, "@/components/settings/SettingsModalHost": mock, "@/hooks/use-notifications": mock,
    "@/app/actions/locale": path.join(root, "tests/design-system/component-adoption/locale-mock.ts"),
    "@/app/actions/dashboard": path.join(root, "tests/design-system/navigation-foundation/dashboard-action.ts"),
    "next/navigation": path.join(root, "tests/design-system/navigation-foundation/navigation-mock.tsx"), "next/link": path.join(root, "tests/design-system/navigation-foundation/navigation-mock.tsx"),
  }, plugins: [{ name: "synthetic-family-data", setup(plugin: { onResolve: (options: { filter: RegExp }, callback: () => { path: string }) => void }) {
    plugin.onResolve({ filter: /(?:parent|student)-data-context$/ }, () => ({ path: path.join(fixture, "data-mock.tsx") }));
  } }] });
  js = bundled.outputFiles.find((file: { path: string }) => file.path.endsWith(".js")).text;
  const moduleCss = bundled.outputFiles.filter((file: { path: string }) => file.path.endsWith(".css")).map((file: { text: string }) => file.text).join("\n");
  const compiler = await compile(await readFile(path.join(root, "src/app/globals.css"), "utf8"), { base: path.join(root, "src/app"), onDependency() {} });
  css = compiler.build(new Scanner({ sources: [{ base: root, pattern: "src/components/**/*.{ts,tsx}", negated: false }, { base: root, pattern: "src/app/{parent,student}/*.{ts,tsx}", negated: false }, { base: root, pattern: "tests/design-system/family-mobile/*.tsx", negated: false }] }).scan()) + "\n" + moduleCss;
});

async function mount(page: Page, role: "parent" | "student", language: "en" | "ar" | "ur", large: boolean) {
  await page.route("**/*", route => route.request().url().startsWith("http://family-mobile.test/") ? route.fulfill({ contentType: "text/html", body: `<html lang="${language}" dir="${language === "en" ? "ltr" : "rtl"}"><head><title>Family mobile synthetic fixture</title></head><body><div id="root"></div></body></html>` }) : route.abort());
  await page.route("**/api/navigation/access", route => route.fulfill({ json: { access: { reports: true, attendance: true, fees: true, timetable: true, students: true, exams: true, ai: true } } }));
  await page.route("**/api/profile", route => route.fulfill({ json: { profile: null } }));
  await page.route("**/api/academic-cycle", route => route.fulfill({ json: { active: null, data: [] } }));
  await page.goto(`http://family-mobile.test/${role}`);
  await page.addStyleTag({ content: css + (large ? "\nhtml { font-size: 200% !important; }" : "") });
  await page.addScriptTag({ content: js });
  await expect(page.locator("main h1")).toBeVisible();
  // The academic-cycle chip is staff context (role-ux §4.1): families never carry it in their header.
  await expect(page.getByText(translateUi("No Cycle", language), { exact: true })).toHaveCount(0);
}

async function finishDialogEntry(dialog: Locator) {
  await expect(dialog).toBeVisible();
  await dialog.evaluate(async element => {
    // Visibility precedes the sheet's entrance animation; measure its settled
    // geometry without disabling the production animation or hiding overflow.
    const animations = [...element.getAnimations(), ...(element.parentElement?.getAnimations() ?? [])];
    await Promise.all(animations.map(animation => animation.finished.catch(() => {})));
  });
}

async function assertInsideViewport(locator: Locator, page: Page) {
  const box = await locator.boundingBox(); expect(box).not.toBeNull();
  const viewport = page.viewportSize()!;
  expect(box!.x).toBeGreaterThanOrEqual(-1); expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box!.y).toBeGreaterThanOrEqual(-1); expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
}

for (const language of ["en", "ar", "ur"] as const) for (const role of ["parent", "student"] as const) for (const large of [false, true]) {
  test(`${language} ${role} at320 ${large ? "200% text" : "normal text"}: content, controls and Messages remain usable`, async ({ page }) => {
    const t = (source: string) => translateUi(source, language);
    await mount(page, role, language, large);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const title of ["View notifications", "Account settings", "Account menu"]) await assertInsideViewport(page.getByTitle(t(title), { exact: true }), page);
    const headerButtons = await Promise.all(["View notifications", "Account settings", "Account menu"].map(title => page.getByTitle(t(title), { exact: true }).boundingBox()));
    for (let i = 0; i < headerButtons.length; i++) for (let j = i + 1; j < headerButtons.length; j++) {
      const a = headerButtons[i]!, b = headerButtons[j]!;
      expect(Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) <= 1 || Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) <= 1).toBe(true);
    }
    if (role === "parent") {
      // The child switcher lives in the header's context slot (M97) and names the child being viewed.
      const change = page.locator('[data-tour="shell.parent.child-switcher"]');
      await expect(change).toHaveAccessibleName(new RegExp(t("Change child, viewing {0}").split("{0}")[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      await assertInsideViewport(change, page);
      await change.focus(); await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog"); await finishDialogEntry(dialog);
      for (const roll of [LONG_ROLL_A, LONG_ROLL_B]) {
        const id = dialog.getByText(roll, { exact: true }); await expect(id).toBeVisible();
        expect(await id.evaluate(element => {
          const range = document.createRange(); range.selectNodeContents(element);
          return [...range.getClientRects()].every(rect => rect.left >= 0 && rect.right <= innerWidth);
        })).toBe(true);
      }
      const selection = dialog.getByRole("button").filter({ hasText: LONG_ROLL_B });
      for (let i = 0; i < 6 && !await selection.evaluate(element => element === document.activeElement); i++) await page.keyboard.press("Tab");
      await expect(selection).toBeFocused(); await assertInsideViewport(selection, page);
      await page.screenshot({ path: test.info().outputPath(`${role}-${language}-${large ? "large" : "normal"}-chooser.png`), fullPage: false });
      await page.keyboard.press("Enter");
      await expect(dialog).toHaveCount(0); await expect(page.getByTestId("selected-child")).toHaveText("child-b");
      await expect(change).toBeFocused();
    }
    const first = page.getByTestId("primary-record"); await first.scrollIntoViewIfNeeded();
    await assertInsideViewport(first, page);
    const action = page.getByTestId("final-action");
    await action.evaluate(element => element.scrollIntoView({ block: "center" }));
    await assertInsideViewport(action, page);
    const nav = page.getByRole("button", { name: t("More"), exact: true }).locator("..");
    const navBounds = (await nav.boundingBox())!, actionBounds = (await action.boundingBox())!;
    expect(actionBounds.y + actionBounds.height).toBeLessThanOrEqual(navBounds.y + 1);
    expect(await action.evaluate(element => { const rect = element.getBoundingClientRect(); const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2); return hit === element || element.contains(hit); })).toBe(true);
    await action.focus(); await page.keyboard.press("Enter"); await expect(action).toHaveAttribute("data-activated", "true");
    await page.screenshot({ path: test.info().outputPath(`${role}-${language}-${large ? "large" : "normal"}-content.png`), fullPage: false });
    await page.getByRole("button", { name: t("More"), exact: true }).click();
    const directory = page.getByRole("dialog", { name: t("Navigation"), exact: true });
    await finishDialogEntry(directory);
    const messages = directory.getByRole("link", { name: t("Messages"), exact: true });
    await expect(messages).toBeVisible(); await messages.focus(); await assertInsideViewport(messages, page);
    await page.screenshot({ path: test.info().outputPath(`${role}-${language}-${large ? "large" : "normal"}-directory.png`), fullPage: false });
    await page.keyboard.press("Escape"); await expect(directory).toHaveCount(0);
  });
}
