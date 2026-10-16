import { test, expect, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { translateUi } from '../../../src/lib/locale/ui-messages';
const toolRequire = createRequire(createRequire(path.join(process.cwd(), 'package.json')).resolve('tsx'));
const { build } = toolRequire('esbuild'); const { compile } = toolRequire('@tailwindcss/node'); const { Scanner } = toolRequire('@tailwindcss/oxide');
let js: string, css: string;
test.beforeAll(async () => {
  const root = process.cwd(); const fixture = path.join(root, 'tests/design-system/navigation-foundation');
  const bundled = await build({ entryPoints: [path.join(fixture, 'fixture.tsx')], outfile: path.join(root, 'test-results/navigation-fixture.js'), bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"', 'process.env': '{}' }, alias: {
    '@/components/chat': path.join(root, 'tests/design-system/component-adoption/chat-mock.ts'),
    '@/app/actions/dashboard': path.join(fixture, 'dashboard-action.ts'),
    '@/app/actions/locale': path.join(root, 'tests/design-system/component-adoption/locale-mock.ts'),
    '@/components/teacher/teacher-components': path.join(fixture, 'teacher-helper.ts'),
    'next/navigation': path.join(fixture, 'navigation-mock.tsx'), 'next/link': path.join(fixture, 'navigation-mock.tsx'),
  } });
  js = bundled.outputFiles.find((file: { path: string }) => file.path.endsWith('.js')).text;
  const moduleCss = bundled.outputFiles.filter((file: { path: string }) => file.path.endsWith('.css')).map((file: { text: string }) => file.text).join('\n');
  const compiler = await compile(await readFile(path.join(root, 'src/app/globals.css'), 'utf8'), { base: path.join(root, 'src/app'), onDependency() {} });
  css = compiler.build(new Scanner({ sources: [{ base: root, pattern: 'src/components/**/*.{ts,tsx}', negated: false }, { base: root, pattern: 'tests/design-system/navigation-foundation/*.tsx', negated: false }] }).scan()) + '\n' + moduleCss;
});
async function mount(page: Page, language: 'en'|'ar'|'ur' = 'en', teacher = false, remote = false) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/*', route => route.request().url().startsWith('http://navigation.test/') ? route.fulfill({ contentType: 'text/html', body: `<html lang="${language}" dir="${language === 'en' ? 'ltr' : 'rtl'}"><head><title>Shared navigation synthetic fixture</title></head><body><div id="root"></div></body></html>` }) : route.abort());
  if (remote) await page.route('**/api/navigation/access', route => route.fulfill({ json: { access: { reports: true, attendance: true, students: false, exams: false, timetable: false, ai: false } } }));
  await page.goto(`http://navigation.test/${teacher ? 'teacher/reports?role=teacher' : 'parent/results?role=parent'}${remote ? '&remote=1' : ''}`);
  await page.addStyleTag({ content: css }); await page.addScriptTag({ content: js });
  await expect(page.locator('main h1')).toBeVisible();
}
const formCopy = {
  en: { name: 'Record name', review: 'Review changes', save: 'Save example changes', dialog: 'Review example changes', saved: 'Example changes saved', domains: ['Admissions', 'Reports', 'Fees'] },
  ar: { name: 'اسم السجل', review: 'مراجعة التغييرات', save: 'حفظ تغييرات المثال', dialog: 'مراجعة تغييرات المثال', saved: 'تم حفظ تغييرات المثال', domains: ['القبول', 'التقارير', 'الرسوم'] },
  ur: { name: 'ریکارڈ کا نام', review: 'تبدیلیوں کا جائزہ', save: 'مثالی تبدیلیاں محفوظ کریں', dialog: 'مثالی تبدیلیوں کا جائزہ', saved: 'مثالی تبدیلیاں محفوظ ہو گئیں', domains: ['داخلے', 'رپورٹس', 'فیس'] },
};
for (const language of ['en', 'ar', 'ur'] as const) {
  const t = (text: string) => translateUi(text, language);
  test(`${language}: directory keyboard, filtered destinations and focus return`, async ({ page }) => {
    await mount(page, language);
    const nav = page.getByRole('navigation', { name: t('Primary navigation'), exact: true });
    await expect(nav.getByRole('link', { name: t('Results'), exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('link', { name: t('Fees'), exact: true })).toHaveCount(0);
    await expect(nav.getByRole('button', { name: 'Hidden group' })).toHaveCount(0);
    const trigger = page.getByRole('button', { name: t('Find a workspace'), exact: true }); await trigger.focus();
    await page.keyboard.press('Alt+Shift+KeyK');
    const dialog = page.getByRole('dialog', { name: t('Navigation'), exact: true });
    const input = dialog.getByRole('searchbox', { name: t('Find a workspace'), exact: true }); await expect(input).toBeFocused();
    await input.fill('zz-no-workspace'); await expect(dialog.getByRole('status')).toHaveText(t('No available workspaces match your search.'));
    await dialog.getByRole('button', { name: t('Clear search') }).click(); await expect(input).toBeFocused();
    await input.fill(t('Attendance')); await expect(dialog.getByRole('link', { name: t('Attendance'), exact: true })).toBeVisible();
    await expect(dialog.getByRole('link', { name: t('Results'), exact: true })).toHaveCount(0);
    await page.keyboard.press('Shift+Tab'); expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`directory-${language}-desktop.png`), fullPage: true });
    await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
    await expect(trigger).toHaveCSS('outline-style', 'solid');
  });
  test(`${language}: two-module family at320/390/768, large text and reduced motion`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 }); await mount(page, language);
    const copy = formCopy[language]; await page.getByRole('textbox', { name: copy.name, exact: true }).fill('Synthetic draft محفوظ');
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: width === 768 ? 1024 : width === 320 ? 720 : 844 });
      const trigger = width < 768 ? page.getByRole('button', { name: t('More'), exact: true }) : page.getByRole('button', { name: t('Find a workspace'), exact: true });
      await trigger.click(); const dialog = page.getByRole('dialog', { name: t('Navigation'), exact: true });
      await expect(dialog.getByRole('link', { name: t('Fees'), exact: true })).toHaveCount(0);
      await expect(dialog.getByRole('link', { name: t('Results'), exact: true })).toBeVisible();
      await expect(dialog.getByRole('link', { name: t('Attendance'), exact: true })).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await dialog.evaluate(element => parseFloat(getComputedStyle(element).animationDuration) || 0)).toBeLessThanOrEqual(.01);
      if (width === 320) await page.screenshot({ path: test.info().outputPath(`directory-${language}-320.png`), fullPage: true });
      await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
    }
    await page.setViewportSize({ width: 320, height: 720 }); await page.evaluate(() => document.documentElement.style.fontSize = '200%');
    await expect(page.getByRole('textbox', { name: copy.name, exact: true })).toHaveValue('Synthetic draft محفوظ');
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: t('More'), exact: true }).click();
    await expect(page.getByRole('searchbox', { name: t('Find a workspace'), exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const result = page.getByRole('dialog').getByRole('link', { name: t('Results'), exact: true }); await result.focus();
    const bounds = (await result.boundingBox())!; expect(bounds.y).toBeGreaterThanOrEqual(0); expect(bounds.y + bounds.height).toBeLessThanOrEqual(720);
    await page.screenshot({ path: test.info().outputPath(`directory-${language}-320-large-text.png`), fullPage: true });
  });
  test(`${language}: equivalent admission/report/fee validate-edit-review journeys`, async ({ page }) => {
    await mount(page, language); const copy = formCopy[language];
    for (const domain of copy.domains) {
      await page.locator('[aria-label="Synthetic equivalent workflows"]').getByRole('button', { name: domain, exact: true }).click();
      const review = page.getByRole('button', { name: copy.review, exact: true }); await review.focus(); await page.keyboard.press('Enter');
      const field = page.getByRole('textbox', { name: copy.name, exact: true }); await expect(field).toBeFocused(); await expect(field).toHaveAttribute('aria-invalid', 'true'); await expect(field).toHaveAccessibleDescription(/2026/);
      await field.fill(`${domain} · Synthetic record`); await review.focus(); await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog', { name: copy.dialog, exact: true }); await expect(dialog).toBeVisible();
      await page.keyboard.press('Escape'); await expect(review).toBeFocused(); await expect(field).toHaveValue(`${domain} · Synthetic record`);
      await field.fill(`${domain} · Edited`); await review.focus(); await page.keyboard.press('Enter');
      await dialog.getByRole('button', { name: copy.save }).focus(); await page.keyboard.press('Enter'); await expect(page.getByRole('status').filter({ hasText: copy.saved })).toBeVisible();
      await expect(review).toBeFocused();
    }
    const selection = page.getByRole('checkbox', { name: `${t('Select')} ${copy.domains[2]}`, exact: true }); await selection.focus(); await page.keyboard.press('Space'); await expect(selection).toBeChecked();
    await page.getByRole('button', { name: t('Open'), exact: true }).focus(); await page.keyboard.press('Enter'); await expect(page.getByRole('textbox', { name: copy.name, exact: true })).toHaveValue('SYN-2026-001');
    await page.screenshot({ path: test.info().outputPath(`form-${language}-desktop.png`), fullPage: true });
  });
}
test('teacher palette excludes unavailable sections, class actions and student identities', async ({ page }) => {
  await mount(page, 'en', true, true); await page.keyboard.press('Control+k'); const dialog = page.getByRole('dialog', { name: 'Quick switcher' }); await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: /^Reports/ })).toBeVisible(); await expect(dialog.getByRole('button', { name: /^Marks|^My Students|^Students/ })).toHaveCount(0);
  const search = dialog.getByRole('textbox'); await search.fill('Synthetic Restricted'); await expect(dialog.getByText('Nothing matches your search.')).toBeVisible();
  await search.fill('Grade 5'); await expect(dialog.getByRole('button', { name: /Attendance/ })).toBeVisible(); await expect(dialog.getByRole('button', { name: /Marks|Students/ })).toHaveCount(0);
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
});
test('new route is fenced before effects; a stale response cannot restore access', async ({ page }) => {
  await mount(page, 'en', true, true); const field = page.getByRole('textbox', { name: 'Record name', exact: true }); await field.fill('Kept draft');
  let release: (() => void) | undefined;
  await page.route('**/api/navigation/access', async route => { await new Promise<void>(resolve => { release = resolve; }); await route.fulfill({ json: { access: { reports: true, students: false } } }); });
  await page.getByRole('button', { name: 'Synthetic route transition' }).click();
  await expect(page.getByRole('status', { name: 'Checking workspace access' })).toBeVisible(); await expect(field).toBeHidden();
  const frames = await page.evaluate(() => (window as unknown as { accessFrames: { pathname: string; status: string }[] }).accessFrames.filter(frame => frame.pathname === '/teacher/students')); expect(frames.length).toBeGreaterThan(0); expect(frames[0].status).toBe('loading');
  await expect.poll(() => Boolean(release)).toBe(true); release!();
  await expect(page.getByText('This workspace is not available with your current access. Choose an available section.')).toBeVisible(); await expect(field).toBeHidden();
  await page.route('**/api/navigation/access', route => route.fulfill({ json: { access: { reports: true, students: false } } })); await page.goBack(); await expect(field).toHaveValue('Kept draft');
});
test('stalled access check offers retry and preserves the mounted draft', async ({ page }) => {
  await mount(page, 'en', true, true); const field = page.getByRole('textbox', { name: 'Record name', exact: true }); await field.fill('Recoverable draft');
  await page.clock.install(); let release: (() => void) | undefined;
  await page.route('**/api/navigation/access', async route => { await new Promise<void>(resolve => { release = resolve; }); await route.fulfill({ json: { access: { reports: true } } }).catch(() => {}); });
  await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await expect(page.getByRole('status', { name: 'Checking workspace access' })).toBeVisible();
  await page.clock.fastForward(10_050); await expect(page.getByRole('button', { name: 'Retry access check' })).toBeVisible(); await expect(field).toBeHidden();
  release?.(); await page.route('**/api/navigation/access', route => route.fulfill({ json: { access: { reports: true } } }));
  await page.getByRole('button', { name: 'Retry access check' }).click(); await expect(field).toHaveValue('Recoverable draft');
});
test('URL workspace allowlist supports Back/Forward, refresh and forged-view fallback', async ({ page }) => {
  await mount(page); const tasks = page.locator('[aria-label="Synthetic equivalent workflows"]');
  await tasks.getByRole('button', { name: 'Admissions' }).click(); await expect(page).toHaveURL(/view=admissions/);
  await tasks.getByRole('button', { name: 'Fees' }).click(); await expect(page.locator('main h1')).toHaveText('Fees');
  await page.goBack(); await expect(page.locator('main h1')).toHaveText('Admissions');
  await page.goForward(); await expect(page.locator('main h1')).toHaveText('Fees');
  await page.reload(); await page.addStyleTag({ content: css }); await page.addScriptTag({ content: js }); await expect(page.locator('main h1')).toHaveText('Fees');
  await page.goto('http://navigation.test/parent/results?view=platform-secrets'); await page.addStyleTag({ content: css }); await page.addScriptTag({ content: js }); await expect(page.locator('main h1')).toHaveText('Reports');
});
test('shared controls retain contrast and visible keyboard focus across normal, disabled and error states', async ({ page }) => {
  await mount(page); const action = page.getByRole('button', { name: 'Review changes', exact: true }); await action.focus(); await page.keyboard.press('Enter');
  const field = page.getByRole('textbox', { name: 'Record name', exact: true }); await expect(field).toBeFocused(); await expect(field).not.toHaveCSS('box-shadow', 'none');
  const contrast = await page.evaluate(() => {
    const rgb = (color: string) => { const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1; const ctx = canvas.getContext('2d')!; ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1); return Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3); };
    const luminance = (color: string) => rgb(color).map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
    const ratio = (foreground: string, background: string) => { const a = luminance(foreground), b = luminance(background); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05); };
    const button = document.querySelector('form button[type=submit]')!; const disabled = document.querySelector('form button:disabled')!; const error = document.querySelector('[data-form-field="record"] [id$="-error"]')!;
    const defaultStyle = getComputedStyle(button), disabledStyle = getComputedStyle(disabled), errorStyle = getComputedStyle(error);
    return { normal: ['#8c36d5', '#7423ba'].map(fill => ratio(defaultStyle.color, fill)), disabled: ratio(disabledStyle.color, disabledStyle.backgroundColor), error: ratio(errorStyle.color, '#ffffff') };
  });
  for (const value of [...contrast.normal, contrast.disabled, contrast.error]) expect(value).toBeGreaterThanOrEqual(4.5);
  const checkbox = page.getByRole('checkbox', { name: 'Select Reports', exact: true }); await checkbox.focus(); await page.keyboard.press('Space'); await expect(checkbox).toBeChecked(); await expect(checkbox).toHaveCSS('outline-style', 'solid');
  await page.getByRole('button', { name: 'Open', exact: true }).focus(); await page.keyboard.press('Enter'); await expect(field).toHaveValue('SYN-2026-001'); await expect(field).toBeFocused();
});

test('teacher scope remount starts closed and ignores late previous-campus responses', async ({ page }) => {
  await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<html lang="en"><body><div id="root"></div></body></html>' }));
  const pending: (() => void)[] = []; let count = 0;
  await page.route('**/synthetic/teacher-dashboard', async route => {
    const request = ++count;
    if (request > 1) await new Promise<void>(resolve => pending.push(resolve));
    await route.fulfill({ json: { teacherName: request === 3 ? 'South campus roster' : 'North campus roster' } });
  });
  await page.goto('http://navigation.test/teacher?provider=1'); await page.addStyleTag({ content: css }); await page.addScriptTag({ content: js });
  const roster = page.getByTestId('scoped-roster'); await expect(roster).toHaveText('North campus roster');
  await page.getByRole('button', { name: 'Refetch scope' }).click(); await expect.poll(() => pending.length).toBe(1);
  await page.getByRole('button', { name: 'Switch scoped provider' }).click(); await expect(roster).toHaveCount(0); await expect.poll(() => pending.length).toBe(2);
  pending[0](); await expect(page.getByRole('status')).toHaveText('Checking current scope'); await expect(roster).toHaveCount(0);
  pending[1](); await expect(roster).toHaveText('South campus roster');
  await page.getByRole('button', { name: 'Switch scoped provider' }).click(); await expect(roster).toHaveCount(0); await expect.poll(() => pending.length).toBe(3);
  pending[2](); await expect(roster).toHaveText('North campus roster'); expect(count).toBe(4);
});

test('teacher rejected refresh clears the current roster and retry waits for fresh data', async ({ page }) => {
  await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<html lang="en"><body><div id="root"></div></body></html>' }));
  let count = 0; let release: (() => void) | undefined;
  await page.route('**/synthetic/teacher-dashboard', async route => {
    const request = ++count;
    if (request === 2) { await new Promise<void>(resolve => { release = resolve; }); await route.fulfill({ status: 403, json: { error: 'Denied' } }); }
    else await route.fulfill({ json: { teacherName: request === 1 ? 'Previously permitted roster' : 'Fresh permitted roster' } });
  });
  await page.goto('http://navigation.test/teacher?provider=1'); await page.addStyleTag({ content: css }); await page.addScriptTag({ content: js });
  const roster = page.getByTestId('scoped-roster'); await expect(roster).toHaveText('Previously permitted roster');
  await page.getByRole('button', { name: 'Refetch scope' }).click(); await expect(roster).toHaveCount(0); await expect.poll(() => Boolean(release)).toBe(true); release!();
  await expect(page.getByRole('alert')).toBeVisible(); await expect(roster).toHaveCount(0);
  await page.getByRole('button', { name: 'Refetch scope' }).click(); await expect(roster).toHaveText('Fresh permitted roster'); await expect(page.getByRole('alert')).toHaveCount(0);
});

async function mountQueryAccess(page: Page) {
  await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<html lang="en"><body><div id="root"></div></body></html>' }));
  await page.route('**/api/navigation/access', route => route.fulfill({ json: { access: { reports: true, fees: true } } }));
  await page.goto('http://navigation.test/principal?query-access=1'); await page.addStyleTag({ content: css }); await page.addScriptTag({ content: js });
  await expect(page.getByRole('heading', { name: 'Reports workspace' })).toBeVisible();
}
test('same-path workspace change fences cached records before effects and checks revoked access', async ({ page }) => {
  await mountQueryAccess(page);
  await page.getByRole('textbox', { name: 'Console draft' }).fill('Draft survives permission checks');
  let release: (() => void) | undefined;
  await page.route('**/api/navigation/access', async route => { await new Promise<void>(resolve => { release = resolve; }); await route.fulfill({ json: { access: { reports: true, fees: false } } }); });
  await page.getByRole('navigation', { name: 'Primary navigation', exact: true }).getByRole('button', { name: 'Fees', exact: true }).click();
  await expect(page).toHaveURL(/view=fees/);
  await expect(page.getByRole('status', { name: 'Checking workspace access' })).toBeVisible();
  await expect(page.getByTestId('cached-fee-record')).toBeHidden();
  const frames = await page.evaluate(() => (window as unknown as { queryAccessFrames: { view: string; status: string; fees: boolean; visible: boolean }[] }).queryAccessFrames.filter(frame => frame.view === 'fees'));
  expect(frames.length).toBeGreaterThan(0); expect(frames[0]).toMatchObject({ status: 'loading', fees: false, visible: false });
  await expect.poll(() => Boolean(release)).toBe(true); release!();
  await expect(page.getByText('This workspace is not available with your current access. Choose an available section.')).toBeVisible();
  await expect(page.getByTestId('cached-fee-record')).toBeHidden();
  await page.route('**/api/navigation/access', route => route.fulfill({ json: { access: { reports: true, fees: false } } }));
  await page.goBack(); await expect(page.getByRole('textbox', { name: 'Console draft' })).toHaveValue('Draft survives permission checks');
});
test('same-path Back rechecks permissions and ignores an obsolete granting response', async ({ page }) => {
  await mountQueryAccess(page);
  const releases: (() => void)[] = []; let request = 0;
  await page.route('**/api/navigation/access', async route => {
    const current = ++request; await new Promise<void>(resolve => releases.push(resolve));
    await route.fulfill({ json: { access: { reports: current === 1, fees: current === 1 } } }).catch(() => {});
  });
  await page.getByRole('navigation', { name: 'Primary navigation', exact: true }).getByRole('button', { name: 'Fees', exact: true }).click();
  await expect.poll(() => releases.length).toBe(1); await page.goBack(); await expect.poll(() => releases.length).toBe(2);
  releases[0](); await expect(page.getByRole('status', { name: 'Checking workspace access' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Reports workspace' })).toBeHidden();
  releases[1](); await expect(page.getByText('This workspace is not available with your current access. Choose an available section.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Reports workspace' })).toBeHidden();
});
test('restored page rechecks revoked access without changing its URL', async ({ page }) => {
  await mountQueryAccess(page);
  await page.route('**/api/navigation/access', route => route.fulfill({ json: { access: { reports: false, fees: false } } }));
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await expect(page.getByText('This workspace is not available with your current access. Choose an available section.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Reports workspace' })).toBeHidden();
});
