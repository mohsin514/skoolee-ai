import { test, expect } from '@playwright/test';

test('semantic surfaces win over the default border without changing field states', async ({ page }) => {
  await page.goto('/design-system?patterns=application');
  const workspace = page.locator('main > div').nth(1);
  await expect(page.getByText('Shared workspace components')).toBeVisible();
  // Keep the pointer off the panels: hover has a deliberately different border.
  await page.mouse.move(0, 0);
  const panel = page.locator('.sk-panel').first();
  await expect(panel).toHaveCSS('border-top-color', 'rgb(228, 220, 237)');
  await expect(panel).toHaveCSS('border-top-left-radius', '28px');
  await expect(workspace).toHaveCSS('border-top-left-radius', '32px');
  await expect(workspace).toHaveCSS('border-top-color', 'rgb(228, 220, 237)');
  expect(await workspace.evaluate(el => getComputedStyle(el).boxShadow)).toContain('rgba(40, 23, 60, 0.02) 0px 2px 4px 0px, rgba(80, 42, 118, 0.25) 0px 20px 60px -30px, rgb(255, 255, 255) 0px 1px 0px 0px inset');
  await expect(page.locator('#field-states-text')).toHaveCSS('border-top-color', 'rgb(216, 207, 229)');
  await expect(page.locator('#field-states-invalid')).toHaveCSS('border-top-color', 'rgb(175, 29, 29)');
  await expect(page.locator('#field-states-disabled')).toHaveCSS('border-top-color', 'rgb(206, 195, 213)');
  await page.locator('#field-states-text').focus();
  await expect(page.locator('#field-states-text')).toHaveCSS('border-top-color', 'rgb(155, 122, 184)');
  for (const width of [390, 639, 640, 767, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(workspace).toHaveCSS('border-top-left-radius', width < 640 ? '24px' : '32px');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if ([390, 768, 1440].includes(width)) {
      await page.screenshot({ path: `test-results/design-system/evidence/foundation-a/reference-en-${width}.png`, fullPage: true });
    }
  }
});

test('reduced motion removes spatial dialog animation and preserves exit lifecycle', async ({ page }) => {
  await page.goto('/design-system?screen=form');
  await page.getByRole('combobox', { name: 'Campus', exact: true }).selectOption({ label: 'North campus' });
  await page.getByRole('button', { name: 'Review changes', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Review example changes' });
  await expect(dialog).toBeVisible();
  const motion = await dialog.evaluate(element => {
    const style = getComputedStyle(element);
    return { name: style.animationName, duration: style.animationDuration };
  });
  expect(motion.name).toBe('fade-in');
  expect(motion.duration).toBe('1e-05s');
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(dialog).toBeHidden();
});
