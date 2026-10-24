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
  const password = page.getByLabel('Password with an action');
  await password.focus();
  await expect(password).toBeFocused();
  const appearance = () => password.evaluate(input => {
    const group = input.closest('.sk-input-group')!;
    const style = getComputedStyle(group);
    return { background: style.backgroundColor, border: style.borderColor, outline: style.outlineStyle, shadow: style.boxShadow };
  });
  await expect.poll(appearance).toEqual({ background: 'rgb(238, 242, 255)', border: 'rgb(155, 122, 184)', outline: 'none', shadow: 'rgb(155, 122, 184) 0px 0px 0px 1px inset, rgba(155, 122, 184, 0.22) 0px 0px 0px 3px, rgba(155, 122, 184, 0.24) 0px 0px 16px 2px' });
  await expect(page.locator('.sk-input-group').filter({ has: password }).locator('[data-field-affix="start"]')).toHaveCSS('color', 'rgb(129, 39, 207)');
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


test('login keeps blue email and pink password fills, reserving error fill for invalid fields', async ({ page }) => {
  await page.goto('/login');
  const email = page.locator('#email');
  const password = page.locator('#password');
  await expect(email).toBeVisible();
  const groupColor = (field: typeof email) => field.evaluate(input => getComputedStyle(input.closest('.sk-input-group')!).backgroundColor);
  expect(await groupColor(email)).toBe('rgb(239, 246, 255)');
  expect(await groupColor(password)).toBe('rgb(253, 242, 248)');
  await password.focus();
  expect(await groupColor(password)).toBe('rgb(253, 242, 248)');
  await expect(page.locator('.sk-input-group').filter({ has: password }).locator('[data-field-affix="start"]')).toHaveCSS('color', 'rgb(129, 39, 207)');
});
