import { test, expect, type Locator, type Page } from '@playwright/test';

// One muted-purple token drives the border AND the halo of every focused field.
const FOCUS = 'rgb(155, 122, 184)';
const HALO = 'rgb(155, 122, 184) 0px 0px 0px 1px inset, rgba(155, 122, 184, 0.22) 0px 0px 0px 3px, rgba(155, 122, 184, 0.24) 0px 0px 16px 2px';
const ERROR = 'rgb(175, 29, 29)';
const ERROR_HALO = 'rgb(175, 29, 29) 0px 0px 0px 1px inset, rgba(175, 29, 29, 0.16) 0px 0px 0px 3px, rgba(175, 29, 29, 0.16) 0px 0px 16px 2px';
const HOVER = 'rgb(179, 154, 203)';
const INVALID_FILL = 'rgb(255, 245, 245)';
const STRONG_VIOLETS = ['rgb(131, 39, 206)', 'rgb(129, 39, 207)'];

/** Computed paint of the field itself, or of its enclosing InputGroup. */
function paint(field: Locator, target: 'self' | 'group' = 'self') {
  return field.evaluate((node, target) => {
    const el = target === 'group' ? node.closest('.sk-input-group')! : node;
    const s = getComputedStyle(el);
    return {
      border: s.borderTopColor, shadow: s.boxShadow, outline: s.outlineStyle, outlineColor: s.outlineColor,
      outlineOffset: s.outlineOffset, outlineWidth: s.outlineWidth, background: s.backgroundColor,
      borderWidth: s.borderTopWidth, opacity: s.opacity, color: s.color,
    };
  }, target);
}
const focusVisible = (el: Locator) => el.evaluate((node) => node.matches(':focus-visible'));
/** Moves focus away and back by keyboard so :focus-visible reflects real keyboard use. */
async function keyboardFocus(page: Page, el: Locator) {
  await el.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(el).toBeFocused();
}
const luminance = (rgb: string) => {
  const [r, g, b] = rgb.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((v) => v / 255).map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const hex = (value: string) => `rgb(${value.match(/[0-9a-f]{2}/gi)!.map((part) => parseInt(part, 16)).join(', ')})`;

test.describe('shared field focus contract', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/design-system?patterns=application');
    await expect(page.getByRole('heading', { name: 'Field states' })).toBeVisible();
  });

  test('standalone input, select, textarea and date share one muted-purple border and halo', async ({ page }) => {
    for (const name of ['Standalone text', 'Standalone select', 'Standalone notes', 'Date field']) {
      const field = page.getByLabel(name, { exact: true });
      await field.focus();
      await expect.poll(() => paint(field), { message: name }).toMatchObject({ border: FOCUS, shadow: HALO, outline: 'none' });
    }
  });

  test('date trigger gets an inset outline while the date field keeps its ring', async ({ page }) => {
    const date = page.getByLabel('Date field', { exact: true });
    const trigger = page.getByRole('button', { name: 'Choose date', exact: true });
    // Tab walks the native date segments first, so reach the trigger from the next control.
    await keyboardFocus(page, trigger);
    expect(await focusVisible(trigger)).toBe(true);
    await expect.poll(() => paint(trigger)).toMatchObject({ outline: 'solid', outlineColor: FOCUS, outlineOffset: '-2px', shadow: 'none' });
    await expect.poll(() => paint(date)).toMatchObject({ border: FOCUS, shadow: HALO, outline: 'none' });
  });

  test('input groups paint exactly one ring and keep their surface', async ({ page }) => {
    const password = page.getByLabel('Password with an action');
    await password.focus();
    await expect.poll(() => paint(password, 'group')).toMatchObject({ border: FOCUS, shadow: HALO, outline: 'none', background: 'rgb(238, 242, 255)' });
    await expect.poll(() => paint(password)).toMatchObject({ shadow: 'none', borderWidth: '0px', outline: 'none' });

    await page.keyboard.press('Tab');
    const toggle = page.getByRole('button', { name: 'Show password' });
    await expect(toggle).toBeFocused();
    expect(await focusVisible(toggle)).toBe(true);
    await expect.poll(() => paint(toggle)).toMatchObject({ outline: 'solid', outlineColor: FOCUS, outlineOffset: '-2px', shadow: 'none' });
    await expect.poll(() => paint(password, 'group')).toMatchObject({ border: FOCUS, shadow: HALO });

    const date = page.getByLabel('Grouped date', { exact: true });
    expect((await paint(date, 'group')).background).toBe('rgb(239, 246, 255)');
    await date.focus();
    await expect.poll(() => paint(date, 'group')).toMatchObject({ border: FOCUS, shadow: HALO, outline: 'none', background: 'rgb(239, 246, 255)' });
    await expect.poll(() => paint(date)).toMatchObject({ shadow: 'none', borderWidth: '0px', outline: 'none' });
    const trigger = page.getByRole('button', { name: 'Choose grouped date' });
    await keyboardFocus(page, trigger);
    expect(await focusVisible(trigger)).toBe(true);
    await expect.poll(() => paint(trigger)).toMatchObject({ outline: 'solid', outlineColor: FOCUS, outlineOffset: '-2px' });
    await expect.poll(() => paint(date, 'group')).toMatchObject({ border: FOCUS, shadow: HALO });
    await expect.poll(() => paint(date)).toMatchObject({ shadow: 'none', outline: 'none' });

    // No grouped child ever paints its own boundary, in any state.
    const children = await page.locator('.sk-input-group .sk-field').evaluateAll((fields) => fields.map((field) => {
      const s = getComputedStyle(field);
      return { shadow: s.boxShadow, outline: s.outlineStyle, border: s.borderTopWidth };
    }));
    expect(children.length).toBeGreaterThanOrEqual(5);
    for (const child of children) expect(child).toEqual({ shadow: 'none', outline: 'none', border: '0px' });
  });

  test('invalid fields use the error hue for both border and halo', async ({ page }) => {
    const invalid = page.getByLabel('Invalid text', { exact: true });
    const rest = await paint(invalid);
    expect(rest.border).toBe(ERROR);
    expect(rest.shadow).not.toContain('0px 0px 0px 3px');
    await invalid.hover();
    await expect.poll(async () => (await paint(invalid)).border).toBe(ERROR);
    await invalid.focus();
    await expect.poll(() => paint(invalid)).toMatchObject({ border: ERROR, shadow: ERROR_HALO, outline: 'none' });

    const grouped = page.getByLabel('Invalid group', { exact: true });
    const groupRest = await paint(grouped, 'group');
    expect(groupRest).toMatchObject({ border: ERROR, background: INVALID_FILL });
    expect(groupRest.shadow).not.toContain('0px 0px 0px 3px');
    await grouped.focus();
    await expect.poll(() => paint(grouped, 'group')).toMatchObject({ border: ERROR, shadow: ERROR_HALO, outline: 'none', background: INVALID_FILL });
    await expect.poll(() => paint(grouped)).toMatchObject({ shadow: 'none', outline: 'none', borderWidth: '0px' });
  });

  test('disabled fields are solid: no halo and no opacity fade', async ({ page }) => {
    const opaque = (color: string) => !/rgba\(.*,\s*0?\.\d+\)$/.test(color);
    // Tailwind's shadow-none composes transparent layers; none of them may be visible.
    const invisible = (shadow: string) => shadow === 'none' || shadow.split(/,(?![^(]*\))/).every((layer) => layer.trim().startsWith('rgba(0, 0, 0, 0)'));
    const disabled = await paint(page.getByLabel('Disabled text', { exact: true }));
    expect(invisible(disabled.shadow), disabled.shadow).toBe(true);
    expect(disabled.border).toBe('rgb(206, 195, 213)');
    expect(disabled.opacity).toBe('1');
    expect(opaque(disabled.color)).toBe(true);
    const groupField = page.getByLabel('Disabled group', { exact: true });
    const group = await paint(groupField, 'group');
    expect(group).toMatchObject({ shadow: 'none', opacity: '1' });
    expect(opaque((await paint(groupField)).color)).toBe(true);
  });

  test('hover on an unfocused field uses the hover token', async ({ page }) => {
    const field = page.getByLabel('Standalone text', { exact: true });
    expect((await paint(field)).border).toBe('rgb(216, 207, 229)');
    await field.hover();
    await expect.poll(async () => (await paint(field)).border).toBe(HOVER);
  });

  test('buttons share the focus token, and dark surfaces switch it to white', async ({ page }) => {
    const button = page.getByRole('button', { name: 'Switch direction' });
    await keyboardFocus(page, button);
    expect(await focusVisible(button)).toBe(true);
    await expect.poll(() => paint(button)).toMatchObject({ outline: 'solid', outlineWidth: '2px', outlineColor: FOCUS });
    expect(STRONG_VIOLETS).not.toContain((await paint(button)).outlineColor);

    const dark = page.getByRole('button', { name: 'Dark surface action' });
    await keyboardFocus(page, dark);
    expect(await focusVisible(dark)).toBe(true);
    await expect.poll(() => paint(dark)).toMatchObject({ outline: 'solid', outlineColor: 'rgb(255, 255, 255)' });
  });

  test('right-to-left groups keep the same focus values', async ({ page }) => {
    await page.getByRole('button', { name: 'Switch direction' }).click();
    await expect(page.locator('main[dir="rtl"]')).toBeVisible();
    const password = page.getByLabel('Password with an action');
    await password.focus();
    await expect.poll(() => paint(password, 'group')).toMatchObject({ border: FOCUS, shadow: HALO, outline: 'none', background: 'rgb(238, 242, 255)' });
    await page.keyboard.press('Tab');
    await expect.poll(() => paint(page.getByRole('button', { name: 'Show password' }))).toMatchObject({ outline: 'solid', outlineColor: FOCUS, outlineOffset: '-2px' });
    const grouped = page.getByLabel('Invalid group', { exact: true });
    await grouped.focus();
    await expect.poll(() => paint(grouped, 'group')).toMatchObject({ border: ERROR, shadow: ERROR_HALO });
  });

  test('focus token meets 3:1 on every field surface and is exposed on :root', async ({ page }) => {
    for (const surface of ['#ffffff', '#fcfaff', '#eff6ff', '#fdf2f8', '#f3f4f9']) {
      expect(contrast(FOCUS, hex(surface)), surface).toBeGreaterThanOrEqual(3);
    }
    const tokens = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      return ['--field-focus-border', '--field-focus-ring', '--field-error-border', '--field-error-ring', '--focus-color'].map((name) => root.getPropertyValue(name).trim());
    });
    for (const value of tokens) expect(value).not.toBe('');
  });
});

test('login groups keep their fills and brand icons through the shared focus ring', async ({ page }) => {
  await page.goto('/login');
  const email = page.locator('#email');
  const password = page.locator('#password');
  await expect(email).toBeVisible();
  for (const [field, fill] of [[email, 'rgb(239, 246, 255)'], [password, 'rgb(253, 242, 248)']] as const) {
    expect((await paint(field, 'group')).background).toBe(fill);
    await field.focus();
    await expect.poll(() => paint(field, 'group')).toMatchObject({ border: FOCUS, shadow: HALO, outline: 'none', background: fill });
    await expect.poll(() => paint(field)).toMatchObject({ shadow: 'none', outline: 'none' });
    await expect(page.locator('.sk-input-group').filter({ has: field }).locator('[data-field-affix="start"]')).toHaveCSS('color', 'rgb(129, 39, 207)');
  }
});
