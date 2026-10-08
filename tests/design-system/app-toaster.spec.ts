import { test, expect } from "@playwright/test";

function contrast(foreground: string, background: string) {
  const luminance = (color: string) => {
    const rgb = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const values = [luminance(foreground), luminance(background)].sort((a, b) => a - b);
  return (values[1] + 0.05) / (values[0] + 0.05);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/design-system?patterns=application");
  await expect(page.getByRole("heading", { name: "Shared workspace components" })).toBeVisible();
});

test("real root toaster renders readable success/error palettes and keyboard dismissal", async ({ page }) => {
  await page.getByRole("button", { name: "Show example success", exact: true }).click();
  const success = page.locator('[data-sonner-toast][data-type="success"]');
  await expect(success).toBeVisible();
  await expect(page.locator("[data-sonner-toaster]")).toHaveCount(1);
  await expect(success).toHaveCSS("background-color", "rgb(236, 253, 245)");
  await expect(success).toHaveCSS("border-top-color", "rgb(16, 185, 129)");
  await expect(success).toHaveCSS("color", "rgb(6, 95, 70)");
  const successColors = await success.evaluate((toast) => {
    const style = getComputedStyle(toast);
    return { color: style.color, background: style.backgroundColor };
  });
  expect(contrast(successColors.color, successColors.background)).toBeGreaterThanOrEqual(4.5);
  await success.getByRole("button", { name: "Close notification", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(success).toHaveCount(0);

  await page.getByRole("button", { name: "Show example error", exact: true }).click();
  const error = page.locator('[data-sonner-toast][data-type="error"]');
  await expect(error).toHaveCSS("background-color", "rgb(254, 242, 242)");
  await expect(error).toHaveCSS("border-top-color", "rgb(239, 68, 68)");
  await expect(error).toHaveCSS("color", "rgb(153, 27, 27)");
  const errorColors = await error.evaluate((toast) => {
    const style = getComputedStyle(toast);
    return { color: style.color, background: style.backgroundColor };
  });
  expect(contrast(errorColors.color, errorColors.background)).toBeGreaterThanOrEqual(4.5);
  await test.info().attach("computed-status-colors", {
    body: JSON.stringify({
      success: { ...successColors, contrast: contrast(successColors.color, successColors.background) },
      error: { ...errorColors, contrast: contrast(errorColors.color, errorColors.background) },
    }, null, 2),
    contentType: "application/json",
  });
  await page.screenshot({ path: test.info().outputPath("error-palette.png") });
});

for (const width of [390, 601, 767, 768, 1440]) {
  test(`toast leaves modal footer usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole("button", { name: "Open feedback dialog", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Feedback example dialog", exact: true });
    await dialog.getByRole("button", { name: "Show dialog error", exact: true }).click();
    const toast = page.locator('[data-sonner-toast][data-type="error"]');
    await expect(toast).toBeVisible();
    const bottom = await page.locator("[data-sonner-toaster]").evaluate((element) => parseFloat(getComputedStyle(element).bottom));
    expect(bottom).toBeGreaterThanOrEqual(width < 768 ? 74 : 24);
    const finish = dialog.getByRole("button", { name: "Finish example", exact: true });
    await expect.poll(() => finish.evaluate((button) => {
      const bounds = button.getBoundingClientRect();
      const topmost = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      return topmost === button || button.contains(topmost);
    })).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`dialog-toast-${width}.png`) });
    await finish.click();
    await expect(dialog).toHaveCount(0);
    await toast.getByRole("button", { name: "Close notification", exact: true }).click();
    await expect(toast).toHaveCount(0);
  });
}

for (const locale of [
  { lang: "ar", region: "الإشعارات", close: "إغلاق الإشعار" },
  { lang: "ur", region: "اطلاعات", close: "اطلاع بند کریں" },
]) {
  test(`root toast follows document ${locale.lang} label/direction changes`, async ({ page }) => {
    // This reproduces LocaleRoot's document-attribute contract, not a login or
    // translated reference page. The page's local RTL toggle changes only main.
    await page.evaluate((language) => {
      document.documentElement.lang = language;
      document.documentElement.dir = "rtl";
    }, locale.lang);
    await page.getByRole("button", { name: "Show example success", exact: true }).click();
    // Sonner's section has no own box; its fixed-position toast is visible.
    await expect(page.getByRole("region", { name: new RegExp(locale.region) })).toHaveCount(1);
    await expect(page.locator('[data-sonner-toast][data-type="success"]')).toBeVisible();
    await expect(page.locator("[data-sonner-toaster]")).toHaveAttribute("dir", "rtl");
    await page.locator('[data-sonner-toast][data-type="success"]').getByRole("button", { name: locale.close, exact: true }).click();
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
    await page.evaluate(() => { document.documentElement.lang = "en"; document.documentElement.dir = "ltr"; });
    await page.getByRole("button", { name: "Show example error", exact: true }).click();
    await expect(page.locator("[data-sonner-toaster]")).toHaveAttribute("dir", "ltr");
    await expect(page.getByRole("button", { name: "Close notification", exact: true })).toBeVisible();
  });
}
