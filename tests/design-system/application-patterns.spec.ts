import { test, expect } from '@playwright/test';

test('real workspace components preserve icon spacing, clear actions and RTL at phone width', async ({ page }) => {
  await page.goto('/design-system?patterns=application');
  await expect(page.getByText('Shared workspace components')).toBeVisible();
  const search = page.getByRole('textbox', { name: 'Search students' });
  await search.fill('Example');
  await expect(page.getByRole('button', { name: 'Clear search' })).toBeVisible();
  async function assertAffixes() {
    const groups = await page.locator('.sk-input-group').evaluateAll(elements => elements.map(group => {
      const input = group.querySelector('input, select')!;
      const r = input.getBoundingClientRect();
      return Array.from(group.querySelectorAll(':scope > [data-field-affix]')).every(affix => {
        const a = affix.getBoundingClientRect();
        return a.right <= r.left + 1 || a.left >= r.right - 1;
      });
    }));
    expect(groups.length).toBeGreaterThanOrEqual(2);
    expect(groups.every(Boolean)).toBe(true);
  }
  await assertAffixes();
  const backgrounds = await page.locator('.sk-input-group').evaluateAll(groups => groups.flatMap(group =>
    Array.from(group.querySelectorAll(':scope > input, :scope > select, :scope > [data-field-affix]')).map(child => getComputedStyle(child).backgroundColor)
  ));
  expect(backgrounds.every(color => color === 'rgba(0, 0, 0, 0)')).toBe(true);
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(search).toHaveValue('');
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(page.getByLabel('Password with an action')).toHaveAttribute('type', 'text');
  await page.setViewportSize({ width: 360, height: 800 });
  await assertAffixes();
  await page.getByRole('button', { name: 'Switch direction' }).click();
  await assertAffixes();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/design-system/application-patterns-phone-rtl.png', fullPage: true });
});
