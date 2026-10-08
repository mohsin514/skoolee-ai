import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const evidence = 'test-results/design-system/evidence';
test.beforeEach(async ({ page }) => {
  await mkdir(evidence, { recursive: true });
  await page.goto('/design-system');
  await expect(page.getByRole('heading', { name: 'Work that needs attention' })).toBeVisible();
  // Historical audit requires real layout before accepting any browser checks.
  expect((await page.getByRole('heading', { level: 1 }).boundingBox())!.width).toBeGreaterThan(0);
});
test('staff task → validation → draft → stale recovery → review receipt', async ({ page }) => {
  await expect(page.getByRole('link', { name: 'Unavailable fees' })).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Select Review report batch' }).check();
  await page.getByLabel('Search tasks').fill('report');
  await expect(page.getByText('1 selected · Selection does not approve records')).toBeVisible();
  await page.getByLabel('Search tasks').fill('');
  await expect(page).toHaveScreenshot('staff-workspace.png', { fullPage: true, mask: [page.locator('nextjs-portal')] });
  await page.screenshot({ path: `${evidence}/01-staff-workspace.png`, fullPage: true });
  await page.getByRole('button', { name: 'Review next', exact: true }).click();
  await page.getByRole('button', { name: 'Review changes', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Campus', exact: true })).toBeFocused();
  await expect(page.getByRole('combobox', { name: 'Campus', exact: true })).toHaveAttribute('aria-invalid', 'true');
  await expect(page).toHaveScreenshot('form-recovery.png', { fullPage: true, mask: [page.locator('nextjs-portal')] });
  await page.screenshot({ path: `${evidence}/02-form-recovery.png`, fullPage: true });
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('Example draft saved in this tab. Nothing has been published.')).toBeVisible();
  await page.getByRole('combobox', { name: 'Campus', exact: true }).selectOption('north');
  await page.getByLabel('Simulate a stale version on save').check();
  await page.getByRole('button', { name: 'Review changes', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Review example changes' })).toBeVisible();
  await page.getByRole('button', { name: 'Save example changes' }).click();
  await expect(page.getByText(/This record changed while/)).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Record name', exact: true })).toHaveValue('Autumn report review');
  await page.getByLabel('Simulate a stale version on save').uncheck();
  await page.getByRole('button', { name: 'Review changes', exact: true }).click();
  await page.getByRole('button', { name: 'Save example changes' }).click();
  await expect(page.getByRole('heading', { name: 'Example changes saved' })).toBeVisible();
});
test('phone family flow and mobile dialog keyboard recovery', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.getByRole('button', { name: 'More', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Navigation', exact: true });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Shift+Tab');
  expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'More', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('dialog', { name: 'Navigation', exact: true }).getByRole('button', { name: 'Family view', exact: true }).click();
  await page.screenshot({ path: `${evidence}/03-family-phone.png`, fullPage: true });
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await expect(page.getByRole('button', { name: 'Open summary' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `${evidence}/05-family-large-text.png`, fullPage: true });
});
test('Arabic direction, full state set, and preserved filters', async ({ page }) => {
  await page.getByLabel('Arabic / RTL layout').check();
  await page.getByLabel('Search tasks').fill('attendance');
  for (const state of ['loading', 'empty', 'error', 'permission', 'success']) {
    await page.getByLabel('Reference state').selectOption(state);
    await expect(page.locator('main [role="status"], main [role="alert"]').first()).toBeVisible();
  }
  await page.getByLabel('Reference state').selectOption('ready');
  await expect(page.getByLabel('Search tasks')).toHaveValue('attendance');
  const sidebar = page.getByRole('navigation', { name: 'Primary navigation', exact: true });
  expect((await sidebar.boundingBox())!.x).toBeGreaterThan(1000);
  await page.screenshot({ path: `${evidence}/04-rtl-workspace.png`, fullPage: true });
});

test('shared neutral tokens and control contrast', async ({ page }) => {
  const colors = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const button = [...document.querySelectorAll('button')].find((el) => el.textContent === 'Review next')!;
    return { background: root.getPropertyValue('--background').trim(), color: getComputedStyle(button).color, fill: getComputedStyle(button).backgroundColor };
  });
  expect(colors.background).toBe('240 5% 97%');
  await expect(page.getByLabel('Reference state')).toHaveCSS('appearance', 'base-select');
  const luminance = (rgb: string) => {
    const values = rgb.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((value) => value / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
  };
  // Both branded gradient endpoints must retain readable white text.
  for (const fill of [colors.fill, 'rgb(140, 54, 213)', 'rgb(116, 35, 186)']) {
    const a = luminance(colors.color), b = luminance(fill);
    expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeGreaterThanOrEqual(4.5);
  }
});

test('server access failure stays closed and retry restores only allowed modules', async ({ page }) => {
  let fail = true;
  await page.route('**/api/navigation/access', async (route) => {
    if (fail) await route.fulfill({ status: 503, json: { error: 'Unavailable' } });
    else await route.fulfill({ status: 200, json: { access: { reports: true, attendance: true, fees: false } } });
  });
  await page.goto('/design-system?access=remote');
  await expect(page.getByRole('button', { name: 'Retry access check' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Primary navigation', exact: true }).getByRole('button', { name: 'Review', exact: true })).toHaveCount(0);
  fail = false;
  await page.getByRole('button', { name: 'Retry access check' }).click();
  await expect(page.getByRole('navigation', { name: 'Primary navigation', exact: true }).getByRole('button', { name: 'Review', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Unavailable fees' })).toHaveCount(0);
});

test('styled dropdown and calendar selection, keyboard recovery and phone layout', async ({ page }) => {
  const state = page.getByLabel('Reference state');
  await state.click();
  await page.screenshot({ path: `${evidence}/06-dropdown-open.png` });
  await page.keyboard.press('Escape');
  await expect(state).toBeFocused();
  await page.getByRole('button', { name: 'Review next', exact: true }).click();
  const trigger = page.getByRole('button', { name: 'Choose effective date' });
  await trigger.click();
  const calendar = page.getByRole('dialog', { name: 'Choose date', exact: true });
  await expect(calendar).toBeVisible();
  await page.screenshot({ path: `${evidence}/07-calendar-open.png` });
  await calendar.getByRole('button', { name: 'Monday, October 12, 2026' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(calendar.getByRole('button', { name: 'Tuesday, October 13, 2026' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel(/^Effective date/)).toHaveValue('2026-10-13');
  await expect(trigger).toBeFocused();
  await trigger.click();
  await calendar.getByRole('button', { name: 'Next month' }).click();
  await expect(calendar.getByText('November 2026')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await page.setViewportSize({ width: 360, height: 800 });
  await trigger.click();
  await expect(calendar).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `${evidence}/08-calendar-phone.png`, fullPage: true });
});


test('task actions, month-end keyboard navigation and high-contrast controls', async ({ page }) => {
  await page.getByRole('button', { name: 'Open Check attendance', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Record name', exact: true })).toHaveValue('Check attendance');
  await page.getByLabel(/^Effective date/).fill('2028-01-31');
  await page.getByRole('button', { name: 'Choose effective date' }).click();
  const calendar = page.getByRole('dialog', { name: 'Choose date', exact: true });
  await calendar.getByRole('button', { name: 'Monday, January 31, 2028' }).focus();
  await page.keyboard.press('PageDown');
  await expect(calendar.getByRole('button', { name: 'Tuesday, February 29, 2028' })).toBeFocused();
  await page.keyboard.press('Shift+PageDown');
  await expect(calendar.getByRole('button', { name: 'Wednesday, February 28, 2029' })).toBeFocused();
  await page.keyboard.press('Home');
  // The default locale starts the week on Monday (weekStartsOn: 1).
  await expect(calendar.getByRole('button', { name: 'Monday, February 26, 2029' })).toBeFocused();
  await page.keyboard.press('End');
  await expect(calendar.getByRole('button', { name: 'Sunday, March 4, 2029' })).toBeFocused();
  await page.keyboard.press('Escape');
  await page.emulateMedia({ forcedColors: 'active' });
  await expect(page.getByLabel('Reference state')).toHaveCSS('appearance', 'auto');
  await expect(page.getByRole('checkbox', { name: 'Arabic / RTL layout' })).toHaveCSS('appearance', 'auto');
  await page.emulateMedia({ forcedColors: 'none' });
  await page.getByRole('button', { name: 'Back to workspace' }).click();
  await page.setViewportSize({ width: 360, height: 800 });
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('Arabic calendar localizes labels and digits while preserving ISO dates', async ({ page }) => {
  await page.getByRole('button', { name: 'Review next', exact: true }).click();
  await page.getByLabel('Arabic / RTL layout').check();
  await expect(page.locator('h1 [lang="ar"]')).toBeVisible();
  await page.getByRole('button', { name: 'اختيار تاريخ السريان' }).click();
  const calendar = page.getByRole('dialog', { name: 'اختيار التاريخ', exact: true });
  await expect(calendar.getByRole('button', { name: 'الشهر التالي' })).toBeVisible();
  const selectedDay = calendar.locator('[data-date="2026-10-12"]');
  await expect(selectedDay).toHaveText('١٢');
  await expect(selectedDay).toHaveAttribute('aria-label', /أكتوبر/);
  await selectedDay.focus();
  await page.keyboard.press('Home');
  await expect(calendar.locator('[data-date="2026-10-10"]')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(calendar.locator('[data-date="2026-10-11"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel(/^Effective date/)).toHaveValue('2026-10-11');
  await page.setViewportSize({ width: 320, height: 800 });
  await page.getByRole('button', { name: 'اختيار تاريخ السريان' }).click();
  await expect(calendar).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `${evidence}/09-arabic-calendar.png` });
  await page.keyboard.press('Escape');
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
