import { test, expect } from '@playwright/test';

const routes = [
  '/ai-school-management-software', '/ai-report-cards-urdu-english', '/ai-student-performance-analytics',
  '/multi-campus-school-erp', '/school-fee-management-software', '/whatsapp-report-card-software',
];
for (const route of routes) {
  test(`${route} shares accessible public navigation and responsive surfaces`, async ({ page }) => {
    await page.route('**/api/**', request => request.abort());
    await page.goto(route);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('a button, button a')).toHaveCount(0);
    const navigation = page.getByRole('navigation', { name: 'Product navigation' });
    await expect(navigation.getByRole('link', { name: 'Trust', exact: true })).toHaveAttribute('href', '/privacy');
    await expect(navigation.getByRole('link', { name: 'Pricing', exact: true })).toHaveAttribute('href', '/pricing');
    await expect(navigation.getByRole('link', { name: 'Login', exact: true })).toHaveAttribute('href', '/login');
    await expect(navigation.getByRole('link', { name: 'Book a demo', exact: true })).toHaveAttribute('href', /^mailto:.*subject=Demo%20request/);
    await expect(page.getByText('Synthetic example data. This is not a customer result or measured outcome.')).toBeVisible();
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      for (const link of await navigation.getByRole('link').all()) {
        expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      if (width === 390 || width === 1440) await page.screenshot({ path: `test-results/design-system/evidence/product-pages/${route.slice(1)}-${width}.png`, fullPage: true });
    }
    const pricing = navigation.getByRole('link', { name: 'Pricing', exact: true });
    await pricing.focus();
    await expect(pricing).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/pricing$/);
    // Mail links are inspected only; no message is composed or sent.
  });
}
