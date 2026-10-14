import { test, expect } from '@playwright/test';

for (const route of ['/privacy', '/security', '/ai-governance', '/human-review-policy']) {
  test(`${route} keeps policy content accessible through shared navigation`, async ({ page }) => {
    await page.goto(route);
    const title = page.getByRole('heading', { level: 1 });
    await expect(title).toBeVisible();
    const navigation = page.getByRole('navigation', { name: 'Trust policies' });
    await expect(navigation.getByRole('link')).toHaveCount(4);
    const active = navigation.locator('[aria-current="page"]');
    await expect(active).toHaveCount(1);
    await expect(active).toHaveAttribute('href', route);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      for (const name of ['Product', 'Back to Skoolee AI']) {
        expect((await page.getByRole('link', { name, exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      if (width === 390 || width === 1440) await page.screenshot({ path: `test-results/design-system/evidence/trust-pages/${route.slice(1)}-${width}.png`, fullPage: true });
    }
    expect(await page.locator('.sk-blob').first().evaluate(el => getComputedStyle(el).animationName)).toBe('none');
    const review = navigation.getByRole('link', { name: /Human Review Policy/ });
    await review.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/human-review-policy$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Human Review Policy');
  });
}
