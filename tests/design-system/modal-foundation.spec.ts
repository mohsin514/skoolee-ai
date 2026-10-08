import { test, expect, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { overlayMessages } from "../../src/lib/ui/overlay-messages";

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
    entryPoints: [path.join(root, "tests/design-system/modal-foundation.fixture.tsx")],
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
    { base: root, pattern: "tests/design-system/modal-foundation.fixture.tsx", negated: false },
  ] });
  fixtureStyles = compiler.build(scanner.scan());
});

async function mountFixture(page: Page, width = 1440, direction: "ltr" | "rtl" = "ltr", language = direction === "rtl" ? "ur" : "en") {
  await page.setViewportSize({ width, height: 900 });
  await page.setContent(`<html lang="${language}" dir="${direction}"><body><div id="fixture-root"></div></body></html>`);
  await page.addStyleTag({ content: fixtureStyles });
  await page.addScriptTag({ content: fixtureScript });
  await expect(page.getByRole("heading", { name: "Modal foundation synthetic fixture" })).toBeVisible();
}

async function dragHeader(page: Page, name: string) {
  const heading = page.getByRole("heading", { name, exact: true });
  const box = (await heading.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 150, { steps: 6 });
  await page.mouse.up();
}

for (const width of [390, 1440]) {
  test(`busy confirmation rejects every dismissal path at ${width}px`, async ({ page }) => {
    await mountFixture(page, width);
    await page.getByRole("button", { name: "Open confirmation", exact: true }).click();
    const dialog = page.getByRole("alertdialog", { name: "Confirm synthetic change", exact: true });
    await dialog.getByRole("button", { name: "Start example operation" }).click();
    await expect(dialog.getByRole("button", { name: "Start example operation" })).toHaveAttribute("aria-busy", "true");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(220);
    await expect(dialog).toBeVisible();
    await page.mouse.click(4, 4);
    if (width < 640) await dragHeader(page, "Confirm synthetic change");
    await page.waitForTimeout(220);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeDisabled();
    await page.screenshot({ path: test.info().outputPath("busy-confirmation.png") });
    await page.evaluate(() => window.dispatchEvent(new Event("fixture:release-operation")));
    await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeEnabled();
    await expect(dialog.getByRole("button", { name: "Start example operation" })).toHaveAttribute("aria-busy", "false");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Open confirmation", exact: true })).toBeFocused();
  });
}

test("discard confirmation traps focus and cancellation returns to the dirty input", async ({ page }) => {
  await mountFixture(page);
  await page.getByRole("button", { name: "Open form", exact: true }).click();
  const input = page.getByRole("textbox", { name: "Synthetic name" });
  await input.fill("Unsubmitted synthetic text");
  await page.keyboard.press("Escape");
  const prompt = page.getByRole("alertdialog", { name: "Discard changes?", exact: true });
  await expect(prompt.getByRole("button", { name: "Keep editing", exact: true })).toBeFocused();
  await page.screenshot({ path: test.info().outputPath("dirty-prompt.png") });
  await page.keyboard.press("Shift+Tab");
  await expect(prompt.getByRole("button", { name: "Discard", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(prompt.getByRole("button", { name: "Keep editing", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(prompt).toHaveCount(0);
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("Unsubmitted synthetic text");
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
  await page.keyboard.press("Escape");
  await page.getByRole("alertdialog", { name: "Discard changes?", exact: true }).getByRole("button", { name: "Discard", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Edit synthetic record", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open form", exact: true })).toBeFocused();
  await expect(page.getByRole("status", { name: "Form close count" })).toHaveText("1");
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
});

test("nested confirmation keeps the parent open and restores its trigger", async ({ page }) => {
  await mountFixture(page, 390, "rtl");
  await page.getByRole("button", { name: "Open form", exact: true }).click();
  const trigger = page.getByRole("button", { name: "Open nested confirmation", exact: true });
  await trigger.click();
  const confirmation = page.getByRole("alertdialog", { name: "Confirm synthetic change", exact: true });
  await expect(confirmation.getByRole("button", { name: overlayMessages.ur.cancel, exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(confirmation).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Edit synthetic record", exact: true })).toBeVisible();
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
});

test("compound Dialog shares the dismissal policy", async ({ page }) => {
  await mountFixture(page);
  await page.getByRole("button", { name: "Open compound dialog", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Compound synthetic dialog", exact: true });
  await dialog.getByRole("button", { name: "Start compound operation", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(220);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Close compound", exact: true })).toBeDisabled();
  await page.evaluate(() => window.dispatchEvent(new Event("fixture:release-operation")));
  await dialog.getByRole("button", { name: "Close compound", exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

test("idle backdrop dismissal is distinct from releasing a text selection outside", async ({ page }) => {
  await mountFixture(page);
  await page.getByRole("button", { name: "Open form", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit synthetic record", exact: true });
  const field = (await page.getByRole("textbox", { name: "Synthetic name" }).boundingBox())!;
  await page.mouse.move(field.x + 5, field.y + 5);
  await page.mouse.down();
  await page.mouse.move(4, 4, { steps: 5 });
  await page.mouse.up();
  await expect(dialog).toBeVisible();
  await page.mouse.click(4, 4);
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open form", exact: true })).toBeFocused();
});

test("phone sheet drag still dismisses an idle dialog", async ({ page }) => {
  await mountFixture(page, 390);
  await page.getByRole("button", { name: "Open confirmation", exact: true }).click();
  await dragHeader(page, "Confirm synthetic change");
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});

test("Keep editing cancels discard on a phone without losing entered text", async ({ page }) => {
  await mountFixture(page, 390, "rtl");
  await page.getByRole("button", { name: "Open form", exact: true }).click();
  const input = page.getByRole("textbox", { name: "Synthetic name" });
  await input.fill("صرف مصنوعی مسودہ");
  await page.keyboard.press("Escape");
  const prompt = page.getByRole("alertdialog", { name: overlayMessages.ur.discardTitle, exact: true });
  await prompt.getByRole("button", { name: overlayMessages.ur.keepEditing, exact: true }).click();
  await expect(prompt).toHaveCount(0);
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("صرف مصنوعی مسودہ");
});


for (const language of ["ar", "ur"] as const) {
  test(`shared overlay chrome follows ${language} without translating authored content`, async ({ page }) => {
    const copy = overlayMessages[language];
    await mountFixture(page, 390, "rtl", language);
    await page.getByRole("button", { name: "Open form", exact: true }).click();
    const form = page.getByRole("dialog", { name: "Edit synthetic record", exact: true });
    await expect(form.getByRole("button", { name: copy.closeDialog, exact: true })).toBeVisible();
    const closeBox = await form.getByRole("button", { name: copy.closeDialog, exact: true }).boundingBox();
    expect(closeBox!.width).toBeGreaterThanOrEqual(44);
    expect(closeBox!.height).toBeGreaterThanOrEqual(44);
    await expect(form.getByRole("button", { name: copy.cancel, exact: true })).toBeVisible();
    const input = form.getByRole("textbox", { name: "Synthetic name" });
    await input.fill("Authored example مسودہ");
    await page.keyboard.press("Escape");
    const prompt = page.getByRole("alertdialog", { name: copy.discardTitle, exact: true });
    await expect(prompt).toHaveAccessibleDescription(copy.unsavedMessage);
    await expect(prompt.getByRole("button", { name: copy.keepEditing, exact: true })).toBeFocused();
    await prompt.getByRole("button", { name: copy.keepEditing, exact: true }).click();
    await expect(input).toBeFocused();
    await expect(input).toHaveValue("Authored example مسودہ");
    await form.getByRole("button", { name: "Open nested confirmation", exact: true }).click();
    const confirmation = page.getByRole("alertdialog", { name: "Confirm synthetic change", exact: true });
    await expect(confirmation.getByRole("button", { name: copy.cancel, exact: true })).toBeFocused();
    await expect(confirmation.getByRole("button", { name: "Start example operation", exact: true })).toBeVisible();
    await expect(confirmation).toHaveAccessibleDescription("Only this browser fixture changes.");
    await page.keyboard.press("Escape");
    await expect(confirmation).toHaveCount(0);
    // Existing document-locale publication updates chrome without discarding a draft.
    await page.evaluate(() => { document.documentElement.lang = "en"; document.documentElement.dir = "ltr"; });
    await expect(form.getByRole("button", { name: "Close dialog", exact: true })).toBeVisible();
    await expect(input).toHaveValue("Authored example مسودہ");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("alertdialog", { name: "Discard changes?", exact: true })).toBeVisible();
  });
}


test("localized shells preserve caller warning and action labels", async ({ page }) => {
  await mountFixture(page, 390, "rtl", "ar");
  await page.getByRole("checkbox", { name: "Use authored warning", exact: true }).check();
  await page.getByRole("button", { name: "Open form", exact: true }).click();
  await page.getByRole("textbox", { name: "Synthetic name" }).fill("Preserved draft");
  await page.keyboard.press("Escape");
  const prompt = page.getByRole("alertdialog", { name: overlayMessages.ar.discardTitle, exact: true });
  await expect(prompt).toHaveAccessibleDescription("Author-owned warning.");
  await prompt.getByRole("button", { name: overlayMessages.ar.keepEditing, exact: true }).click();
  await page.getByRole("button", { name: "Open nested confirmation", exact: true }).click();
  const confirmation = page.getByRole("alertdialog", { name: "Confirm synthetic change", exact: true });
  await expect(confirmation.getByRole("button", { name: "Author-owned cancel", exact: true })).toBeFocused();
});

for (const language of ["en", "ar", "ur"] as const) {
  test(`secondary modal action follows logical alignment in ${language}`, async ({ page }) => {
    await mountFixture(page, 1440, language === "en" ? "ltr" : "rtl", language);
    await page.getByRole("button", { name: "Open form", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Edit synthetic record", exact: true });
    const secondary = await dialog.getByRole("button", { name: "Save example draft", exact: true }).boundingBox();
    const primary = await dialog.getByRole("button", { name: "Finish example", exact: true }).boundingBox();
    expect(secondary).not.toBeNull();
    expect(primary).not.toBeNull();
    if (language === "en") expect(secondary!.x + secondary!.width).toBeLessThan(primary!.x);
    else expect(secondary!.x).toBeGreaterThan(primary!.x + primary!.width);
  });
}

for (const tone of ["primary", "danger", "warning", "success"] as const) {
  test(`confirmation ${tone} action has readable normal and hover colors`, async ({ page }, testInfo) => {
    await mountFixture(page);
    await page.getByRole("combobox", { name: "Synthetic confirmation tone" }).selectOption(tone);
    await page.getByRole("button", { name: "Open confirmation", exact: true }).click();
    const action = page.getByRole("button", { name: "Start example operation", exact: true });
    const samples = [];
    for (const state of ["normal", "hover"] as const) {
      if (state === "hover") {
        await action.hover();
        // Let the reduced-motion transition paint before sampling its endpoint.
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      }
      const sample = await action.evaluate(el => {
        const style = getComputedStyle(el);
        const canvas = document.createElement("canvas"); canvas.width = 1; canvas.height = 1;
        const context = canvas.getContext("2d")!;
        const luminance = (color: string) => {
          context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1);
          const rgb = Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3).map(value => {
            const s = value / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          });
          return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
        };
        const a = luminance(style.color), b = luminance(style.backgroundColor);
        return { color: style.color, background: style.backgroundColor, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
      });
      samples.push({ state, ...sample });
      if (!process.env.CAPTURE_ACTION_BASELINE) expect(sample.ratio).toBeGreaterThanOrEqual(4.5);
    }
    await testInfo.attach(`action-${tone}-contrast`, { body: JSON.stringify(samples, null, 2), contentType: "application/json" });
    if (process.env.CAPTURE_ACTION_BASELINE) console.log(JSON.stringify({ tone, samples }));
  });
}


test('descendant autofocus does not replace the dialog return target', async ({ page }) => {
  await mountFixture(page);
  const trigger = page.getByRole('button', { name: 'Open autofocus example', exact: true });
  await trigger.click();
  await expect(page.getByRole('textbox', { name: 'Autofocus field', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Autofocus example', exact: true })).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('a dialog mounted inactive remembers the current opener across reopen', async ({ page }) => {
  await mountFixture(page);
  for (const name of ['First inactive example trigger', 'Second inactive example trigger']) {
    const trigger = page.getByRole('button', { name, exact: true });
    await trigger.click();
    await expect(page.getByRole('textbox', { name: 'Inactive autofocus field', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Inactive hook example', exact: true })).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
});
