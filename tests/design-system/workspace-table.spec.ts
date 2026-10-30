import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { resolve } from "node:path";

// Use tsx's existing compiler; no test-only package installation or app route is needed.
const requireFromTsx = createRequire(require.resolve("tsx"));
const { build } = requireFromTsx("esbuild");
type FixtureBuilder = {
  onResolve: (options: { filter: RegExp }, callback: () => { path: string; namespace: string }) => void;
  onLoad: (options: { filter: RegExp; namespace: string }, callback: () => { contents: string; loader: "js" }) => void;
};
let fixtureScript: string;

test.beforeAll(async () => {
  const output = await build({
    entryPoints: [resolve("tests/design-system/fixtures/workspace-table.tsx")], bundle: true, write: false,
    platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"test"' },
    plugins: [{ name: "synthetic-table-locale", setup(builder: FixtureBuilder) {
      builder.onResolve({ filter: /^@\/components\/locale\/LocaleProvider$/ }, () => ({ path: "locale", namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: 'export function useLocale() { return {language: window.__tableLanguage || "en"}; } export function useUiText() { return source => source; }', loader: "js" }));
    } }],
  });
  fixtureScript = output.outputFiles[0].text;
});

for (const language of ["en", "ar", "ur"] as const) {
  test(`workspace table keyboard, selection and labels: ${language}`, async ({ page }) => {
    // Reuse the real application's loaded CSS. Only the locale provider is a fixture boundary;
    // the rendered DataTable, Checkbox and WorkspaceHeader are production source components.
    await page.goto("/design-system?patterns=application");
    await expect(page.getByText("Shared workspace components")).toBeVisible();
    const rootClasses = await page.evaluate(() => ({ html: document.documentElement.className, body: document.body.className }));
    // querySelectorAll intentionally excludes the Next devtools shadow-root styles.
    // A piercing locator would copy those isolated reset rules into the fixture document.
    const styles = await page.evaluate(() => Array.from(document.querySelectorAll('link[rel="stylesheet"], style')).map(node => {
      const copy = node.cloneNode(true) as HTMLElement;
      if (node instanceof HTMLLinkElement) copy.setAttribute("href", node.href);
      return copy.outerHTML;
    }).join("\n"));
    // A test-only intercepted document keeps stylesheet requests on the local origin.
    await page.route("**/__workspace_table_fixture__", route => route.fulfill({
      contentType: "text/html", body: `<!doctype html><html class="${rootClasses.html}" lang="${language}" dir="${language === "en" ? "ltr" : "rtl"}"><head>${styles}</head><body class="${rootClasses.body}"><div id="table-fixture"></div></body></html>`,
    }));
    await page.goto("/__workspace_table_fixture__");
    await page.evaluate(value => { (window as Window & { __tableLanguage: string }).__tableLanguage = value; }, language);
    await page.addScriptTag({ content: fixtureScript });
    const copy = {
      en: { all: "Select all displayed rows", row: "Deselect Example A", open: "Open Example A" },
      ar: { all: "تحديد جميع الصفوف المعروضة", row: "إلغاء تحديد Example A", open: "فتح Example A" },
      ur: { all: "تمام دکھائی گئی قطاریں منتخب کریں", row: "انتخاب ختم کریں Example A", open: "کھولیں Example A" },
    }[language];
    const table = page.getByRole("table", { name: "Synthetic workspace table" });
    await expect(table).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "Student" })).toHaveAttribute("aria-sort", "ascending");
    await table.getByRole("button", { name: "Student", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(table.getByRole("columnheader", { name: "Student" })).toHaveAttribute("aria-sort", "descending");
    const all = table.getByRole("checkbox", { name: copy.all });
    await expect(all).toHaveJSProperty("indeterminate", true);
    await expect(table.getByRole("checkbox", { name: copy.row })).toBeChecked();
    await all.focus(); await page.keyboard.press("Space");
    await expect(all).toBeChecked(); await expect(all).toHaveJSProperty("indeterminate", false);
    await all.press("Space"); await expect(all).not.toBeChecked();
    const action = table.getByRole("button", { name: copy.open });
    await action.focus(); await page.keyboard.press("Enter");
    await expect(page.getByRole("status")).toHaveText("Opened 1");
    await action.press("Space"); await expect(page.getByRole("status")).toHaveText("Opened 2");
    await table.getByText("Read-only cell content").click();
    await expect(page.getByRole("status")).toHaveText("Opened 3");
    await table.getByRole("button", { name: "مثال B", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Opened 4");
    await expect(table.locator('button button, button a, a button')).toHaveCount(0);
    await expect(table.getByRole("row").nth(2).getByRole("button")).toHaveCount(1);
    await expect(table.getByRole("columnheader", { name: "Logical end" })).toHaveCSS("text-align", "end");
    await expect(table.getByRole("columnheader", { name: "Physical right" })).toHaveCSS("text-align", "right");
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      const geometry = await page.getByRole("heading").evaluate(heading => ({
        clipped: heading.scrollWidth > heading.clientWidth + 1,
        whiteSpace: getComputedStyle(heading).whiteSpace,
        pageOverflows: document.documentElement.scrollWidth > innerWidth,
      }));
      expect(geometry).toEqual({ clipped: false, whiteSpace: "normal", pageOverflows: false });
      await page.screenshot({ path: `test-results/design-system/evidence/foundation-d/table-${language}-${viewport.width}.png`, fullPage: true });
    }
    await page.getByRole("button", { name: "Toggle empty" }).click();
    await expect(table.getByText("No synthetic rows")).toBeVisible();
    await expect(all).toBeDisabled();
  });
}
