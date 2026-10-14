import { test, expect, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";


// Use the existing tsx/Tailwind transitive tooling; no new runtime dependency.
const workspaceRequire = createRequire(createRequire(path.join(process.cwd(), "package.json")).resolve("tsx"));
const { build } = workspaceRequire("esbuild");
const { compile } = workspaceRequire("@tailwindcss/node");
const { Scanner } = workspaceRequire("@tailwindcss/oxide");
let fixtureScript: string;
let fixtureStyles: string;

test.beforeAll(async () => {
  const root = process.cwd();
  const result = await build({
    entryPoints: [path.join(root, "tests/design-system/fixtures/admin-wizard.tsx")],
    bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"' },
    tsconfig: path.join(root, "tsconfig.json"),
  });
  fixtureScript = result.outputFiles[0].text;
  const compiler = await compile(await readFile(path.join(root, "src/app/globals.css"), "utf8"), {
    base: path.join(root, "src/app"), onDependency() {},
  });
  const scanner = new Scanner({ sources: [
    { base: root, pattern: "src/components/ui/*.{ts,tsx}", negated: false },
    { base: root, pattern: "tests/design-system/fixtures/admin-wizard.tsx", negated: false },
    { base: root, pattern: "src/components/shared-admin/wizard-shell.tsx", negated: false },
  ] });
  fixtureStyles = compiler.build(scanner.scan());
});

async function mountFixture(page: Page, width = 1440, direction: "ltr" | "rtl" = "ltr", language = direction === "rtl" ? "ur" : "en") {
  await page.setViewportSize({ width, height: 900 });
  await page.setContent(`<html lang="${language}" dir="${direction}"><body><div id="fixture-root"></div></body></html>`);
  await page.addStyleTag({ content: fixtureStyles });
  await page.addScriptTag({ content: fixtureScript });
  await expect(page.getByRole("heading", { name: "Shared admin wizard fixture" })).toBeVisible();
}


for (const [language, width] of [['en', 320], ['ar', 390], ['ur', 1440]] as const) {
  test(`admin wizard shares field semantics and busy close policy: ${language}`, async ({ page }) => {
    await mountFixture(page, width, language === 'en' ? 'ltr' : 'rtl', language);
    await page.getByRole('button', { name: 'Open admission example' }).click();
    const dialog = page.getByRole('dialog');
    const name = dialog.getByRole('textbox', { name: 'Example name' });
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    await expect(name).toHaveAttribute('aria-required', 'true');
    const described = await name.getAttribute('aria-describedby');
    expect(described).toBeTruthy();
    await expect(dialog.locator(`[id="${described}"]`)).toHaveText('Enter an example name.');
    await dialog.locator('label').filter({ hasText: 'Example name' }).click();
    await expect(name).toBeFocused();
    await name.fill('Synthetic example');
    await expect(name).not.toHaveAttribute('aria-invalid', 'true');
    await dialog.getByRole('button', { name: 'Next', exact: true }).click();
    await dialog.getByRole('button', { name: 'Submit example', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Working…' })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Back', exact: true })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Edit', exact: true })).toBeDisabled();
    await page.keyboard.press('Tab');
    await expect(dialog).toBeFocused();
    await page.keyboard.press('Escape');
    await page.mouse.click(1, 1);
    await expect(dialog).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`admin-wizard-${language}.png`) });
    await page.evaluate(() => window.dispatchEvent(new Event('fixture:release')));
    await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeEnabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open admission example' })).toBeFocused();
  });
}

test('shared bounded table retains one scroll owner and sticky headers', async ({ page }) => {
  await mountFixture(page, 390);
  const table = page.getByRole('table', { name: 'Example bounded roster' });
  const header = table.getByRole('columnheader', { name: 'Example name' });
  await expect(header).toHaveAttribute('scope', 'col');
  const before = (await header.boundingBox())!;
  const scroll = await table.evaluate(element => {
    const owner = element.parentElement!;
    owner.scrollTop = 150;
    return { top: owner.scrollTop, overflow: getComputedStyle(owner).overflowY, height: owner.clientHeight };
  });
  expect(scroll.top).toBeGreaterThan(0);
  expect(scroll.overflow).toBe('auto');
  expect(scroll.height).toBeLessThanOrEqual(128);
  expect(Math.abs((await header.boundingBox())!.y - before.y)).toBeLessThan(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
