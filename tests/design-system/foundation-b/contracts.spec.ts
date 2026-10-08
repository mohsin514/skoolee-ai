import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { resolve } from "node:path";

// tsx already owns esbuild in the locked dependency tree; no new runtime dependency.
const { buildSync } = createRequire(require.resolve("tsx"))("esbuild") as {
  buildSync: (options: Record<string, unknown>) => { outputFiles: { text: string }[] };
};
const script = buildSync({
  entryPoints: [resolve("tests/design-system/foundation-b/fixture.tsx")],
  bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
  alias: { "@/app/actions/locale": resolve("tests/design-system/foundation-b/locale-action.ts") },
}).outputFiles[0].text;

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-07T12:00:00Z") });
  await page.route("http://foundation-b.test/**", route => route.fulfill(route.request().url().endsWith("fixture.js")
    ? { contentType: "application/javascript", body: script }
    : { contentType: "text/html", body: '<!doctype html><html lang="en"><head><title>Shared field fixture</title><style>body{font:16px sans-serif}form{padding:1rem}button,input{margin:.25rem;min-height:44px}svg{width:16px;height:16px}[role=dialog][aria-modal=true]{position:fixed;inset:5%;overflow:auto;background:white;border:1px solid;padding:1rem}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>' }));
  await page.goto("http://foundation-b.test/");
});

test("explicit scopes keep duplicate field names unique and summaries focus their own form", async ({ page }) => {
  const legacy = page.getByLabel("Legacy field", { exact: true });
  await expect(legacy).toHaveAttribute("id", "field-legacy");
  await page.getByRole("button", { name: "Focus legacy field" }).click();
  await expect(legacy).toBeFocused();

  const first = page.getByLabel("first name", { exact: true });
  const second = page.getByLabel("second name", { exact: true });
  await expect(first).toHaveAttribute("id", "field-first-name");
  await expect(second).toHaveAttribute("id", "field-second-name");
  for (const scope of ["first", "second"]) {
    const input = page.getByLabel(`${scope} name`, { exact: true });
    await page.getByRole("button", { name: `Focus ${scope} name` }).click();
    await expect(input).toBeFocused();
    await expect(input).toHaveAccessibleDescription(`${scope} hint ${scope} error`);
    await expect(input).toHaveAttribute("aria-describedby", `field-${scope}-name-hint field-${scope}-name-error`);
  }
  await page.getByRole("button", { name: "Focus dialog name" }).click();
  await expect(page.getByLabel("Dialog name", { exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Focus confirmation name" }).click();
  await expect(page.getByLabel("Confirmation name", { exact: true })).toBeFocused();
});

test("direct and non-forwarding controls keep caller semantics through required/error transitions", async ({ page }) => {
  const direct = page.getByRole("textbox", { name: "Direct field", exact: true });
  const urdu = page.getByRole("textbox", { name: "Urdu field", exact: true });
  await expect(direct).toHaveAttribute("id", "direct-id");
  await expect(direct).toHaveAccessibleDescription("External first instruction Shared hint Shared error");
  await expect(direct).toHaveAttribute("aria-invalid", "true");
  await expect(urdu).toHaveAttribute("id", "field-urdu");
  await expect(urdu).toHaveAttribute("aria-required", "true");
  await expect(urdu).toHaveAccessibleDescription("Urdu hint");
  await page.locator("label").filter({ hasText: "Urdu field" }).click();
  await expect(urdu).toBeFocused();
  await urdu.fill("طالب علم");
  await expect(urdu).toHaveValue("طالب علم");
  await page.getByRole("button", { name: "Update field state" }).click();
  await expect(direct).toHaveAttribute("aria-invalid", "spelling");
  await expect(direct).toHaveAttribute("aria-required", "false");
  await expect(direct).toHaveAccessibleDescription("External revised instruction");
  await expect(urdu).not.toHaveAttribute("aria-required");
  await expect(urdu).toHaveValue("طالب علم");
  await page.getByRole("button", { name: "Update field state" }).click();
  await expect(urdu).toHaveAttribute("aria-required", "true");
  await expect(direct).toHaveAccessibleDescription("External first instruction Shared hint Shared error");
});

test("compound fields preserve child IDs and caller ARIA as owned state changes", async ({ page }) => {
  const input = page.getByRole("textbox", { name: "Compound field", exact: true });
  await expect(input).toHaveAttribute("id", "nested-custom");
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(input).toHaveAttribute("aria-required", "true");
  await expect(input).toHaveAccessibleDescription("External first instruction Shared hint Shared error");
  await page.locator("label").filter({ hasText: "Compound field" }).click();
  await expect(input).toBeFocused();
  await page.getByRole("button", { name: "Update field state" }).click();
  await expect(input).toHaveAttribute("aria-invalid", "spelling");
  await expect(input).toHaveAttribute("aria-required", "false");
  await expect(input).toHaveAttribute("aria-describedby", "external-two");
  await expect(input).toHaveAccessibleDescription("External revised instruction");
});

test("an explicit FormField ID overrides the child without duplicate wrapper IDs", async ({ page }) => {
  const input = page.getByLabel("Explicit field", { exact: true });
  await expect(input).toHaveAttribute("id", "explicit-field");
  await expect(page.locator('[id="explicit-field"]')).toHaveCount(1);
  await expect(page.locator('[id="overridden-child"]')).toHaveCount(0);
  await page.getByText("Explicit field", { exact: true }).click();
  await expect(input).toBeFocused();
  const wrapperControl = page.getByLabel("Wrapper ID", { exact: true });
  await expect(wrapperControl).toHaveAttribute("id", "wrapper-control");
  await expect(page.locator('[id="wrapper-control"]')).toHaveCount(1);
  await expect(page.locator('[id="nested-wrapper-child"]')).toHaveCount(0);
});

test("Today selects the campus day inside bounds and preserves native form/change behavior", async ({ page }) => {
  const input = page.locator('input[name="date"]');
  await expect(input).toHaveAccessibleName("Campus date");
  await expect(input).toHaveAccessibleDescription("Date hint");
  await expect(input).toHaveAttribute("aria-required", "true");
  await page.getByRole("button", { name: "Choose campus date" }).click();
  const calendar = page.getByRole("dialog", { name: "Choose date", exact: true });
  const today = calendar.getByRole("button", { name: "Today", exact: true });
  await expect(today).toBeEnabled();
  await expect(calendar.getByRole("button", { name: "Thursday, October 8, 2026", exact: true })).toHaveAttribute("aria-current", "date");
  await today.click();
  await expect(input).toHaveValue("2026-10-08");
  await expect(page.getByLabel("Native change", { exact: true })).toHaveText("2026-10-08");
  await expect(page.getByLabel("Value change", { exact: true })).toHaveText("2026-10-08");
  expect(await page.getByRole("form", { name: "Date form" }).evaluate(form => new FormData(form as HTMLFormElement).get("date"))).toBe("2026-10-08");
});
