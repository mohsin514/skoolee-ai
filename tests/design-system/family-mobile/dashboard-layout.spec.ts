import { test, expect, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PUBLISHED_EXAM_TITLE } from './dashboard-data-mock';
import { translateUi } from '../../../src/lib/locale/ui-messages';
const toolRequire = createRequire(createRequire(path.join(process.cwd(), "package.json")).resolve("tsx"));
const { build } = toolRequire("esbuild");
const { compile } = toolRequire("@tailwindcss/node");
const { Scanner } = toolRequire("@tailwindcss/oxide");
let js: string, css: string;
test.beforeAll(async () => {
  const root = process.cwd(), fixture = path.join(root, "tests/design-system/family-mobile"), mock = path.join(fixture, "boundary-mock.tsx");
  const bundled = await build({ entryPoints: [path.join(fixture, "dashboard-fixture.tsx")], outfile: path.join(fixture, "unused-output.js"), bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"development"', "process.env": "{}" }, alias: {
    "@/components/chat": mock, "@/components/settings/SettingsModalHost": mock, "@/hooks/use-notifications": mock,
    "@/app/actions/locale": path.join(root, "tests/design-system/component-adoption/locale-mock.ts"),
    "@/app/actions/dashboard": path.join(root, "tests/design-system/navigation-foundation/dashboard-action.ts"),
    "next/navigation": path.join(root, "tests/design-system/navigation-foundation/navigation-mock.tsx"), "next/link": path.join(root, "tests/design-system/navigation-foundation/navigation-mock.tsx"),
  }, plugins: [{ name: "synthetic-family-data", setup(plugin: { onResolve: (options: { filter: RegExp }, callback: () => { path: string }) => void }) {
    plugin.onResolve({ filter: /(?:parent|student)-data-context$/ }, () => ({ path: path.join(fixture, "dashboard-data-mock.tsx") }));
  } }] });
  js = bundled.outputFiles.find((file: { path: string }) => file.path.endsWith(".js")).text;
  const moduleCss = bundled.outputFiles.filter((file: { path: string }) => file.path.endsWith(".css")).map((file: { text: string }) => file.text).join("\n");
  const compiler = await compile(await readFile(path.join(root, "src/app/globals.css"), "utf8"), { base: path.join(root, "src/app"), onDependency() {} });
  css = compiler.build(new Scanner({ sources: [{ base: root, pattern: "src/components/**/*.{ts,tsx}", negated: false }, { base: root, pattern: "src/app/{parent,student}/*.{ts,tsx}", negated: false }, { base: root, pattern: "tests/design-system/family-mobile/*.tsx", negated: false }] }).scan()) + "\n" + moduleCss;
});

async function verifyPublishedReport(page: Page, screenshotName: string) {
  const panel = page.getByRole('heading', { name: 'Latest Report Card', exact: true }).locator('..').locator('..');
  const title = panel.getByText(PUBLISHED_EXAM_TITLE, { exact: true });
  const score = panel.getByText('80%', { exact: true });
  await expect(title).toBeVisible(); await expect(score).toBeVisible();
  const width = page.viewportSize()!.width;
  for (const field of [title, score]) {
    const box = (await field.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width);
  }
  const titleBox = (await title.boundingBox())!, scoreBox = (await score.boundingBox())!;
  expect(scoreBox.y).toBeGreaterThanOrEqual(titleBox.y + titleBox.height);
  const resultsLink = panel.getByRole('link', { name: 'View all results', exact: true });
  await resultsLink.scrollIntoViewIfNeeded(); await resultsLink.focus();
  expect(await resultsLink.evaluate(element => { const box = element.getBoundingClientRect(); const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2); return hit === element || element.contains(hit); })).toBe(true);
  await panel.screenshot({ path: test.info().outputPath(screenshotName) });
}

for (const language of ['en','ar','ur'] as const) for (const role of ['parent','student'] as const) {
  test(`${language} ${role}: actual dashboard cards and calendar reflow at320/200%`, async ({ page }) => {
    const t = (text: string) => translateUi(text, language);
    await page.route('**/*', route => route.request().url().startsWith('http://family-dashboard.test/') ? route.fulfill({ contentType: 'text/html', body: `<html lang="${language}" dir="${language === 'en' ? 'ltr' : 'rtl'}"><body><div id="root"></div></body></html>` }) : route.abort());
    await page.route('**/api/navigation/access', route => route.fulfill({ json: { access: { reports: true, attendance: true, fees: true, timetable: true, students: true, exams: true, ai: true } } }));
    await page.route('**/api/profile', route => route.fulfill({ json: { profile: null } }));
    await page.route('**/api/academic-cycle', route => route.fulfill({ json: { active: null, data: [] } }));
    await page.route('**/api/timetable/class', route => route.fulfill({ json: { success: true, data: { slots: [] } } }));
    await page.route('**/api/exams?**', route => route.fulfill({ json: { success: true, exams: [] } }));
    await page.route('**/api/academic/calendar/unified?**', route => route.fulfill({ json: { success: true, data: { weekStartsOn: 1, weekends: [6,7], holidays: [{ id: 'holiday-one', name: 'Family learning day with a readable complete title', fromDate: `${new Date().getFullYear()}-12-20`, toDate: `${new Date().getFullYear()}-12-20` }], terms: [], exams: [] } } }));
    let aiCalls = 0; await page.route('**/api/ai/**', route => { aiCalls++; return route.abort(); });
    await page.goto(`http://family-dashboard.test/${role}`); await page.addStyleTag({ content: css + '\nhtml {font-size:200% !important;}' }); await page.addScriptTag({ content: js });
    await expect(page.locator('main h1')).toBeVisible();
    if (role === 'parent') await expect(page.getByText(PUBLISHED_EXAM_TITLE, { exact: true }).last()).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const name of ['Results by subject','Attendance','Exam by exam']) {
      const heading = page.getByRole('heading', { name, exact: true });
      await heading.scrollIntoViewIfNeeded();
      const geometry = await heading.evaluate(element => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height, line: parseFloat(getComputedStyle(element).lineHeight) }));
      expect(geometry.width).toBeGreaterThanOrEqual(150); expect(geometry.height).toBeLessThanOrEqual(geometry.line * 3 + 1);
    }
    const results = page.getByRole('region', { name: 'Results by subject', exact: true });
    await results.scrollIntoViewIfNeeded(); await page.screenshot({ path: test.info().outputPath(`${role}-${language}-insights.png`) });
    const table = results.getByRole('button', { name: 'Show table', exact: true }); await table.focus(); await page.keyboard.press('Enter'); await expect(results.getByRole('table')).toBeVisible();
    await expect(results.getByRole('cell', { name: 'Mathematics', exact: true })).toBeVisible();
    const agenda = page.getByRole('button', { name: t("What's next"), exact: true }); await expect(agenda).toHaveAttribute('aria-pressed','true');
    await agenda.scrollIntoViewIfNeeded(); await page.screenshot({ path: test.info().outputPath(`${role}-${language}-agenda.png`) });
    const month = page.getByRole('button', { name: t('Month'), exact: true }); await month.focus(); await page.keyboard.press('Enter');
    const calendar = page.getByRole('region', { name: t('Month calendar. Scroll horizontally to see all days.'), exact: true }); await expect(calendar).toBeVisible();
    const first = calendar.getByRole('button').first(); const last = calendar.getByRole('button').last();
    const box = (await first.boundingBox())!; expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
    await last.focus(); await expect(last).toBeFocused();
    const bounds = (await last.boundingBox())!; expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
    await page.screenshot({ path: test.info().outputPath(`${role}-${language}-month.png`) });
    await page.setViewportSize({ width: 768, height: 1024 }); await expect(month).toHaveAttribute('aria-pressed','true'); await page.setViewportSize({ width: 320, height: 720 }); await expect(month).toHaveAttribute('aria-pressed','true');
    await agenda.click(); await expect(page.getByText('Family learning day with a readable complete title')).toBeVisible();
    if (role === 'student') {
      const context = page.getByRole('textbox', { name: 'Context for Explain Report', exact: true }); await context.scrollIntoViewIfNeeded(); await context.fill('Readable synthetic draft');
      expect((await context.boundingBox())!.width).toBeGreaterThanOrEqual(180);
      const run = page.getByRole('button', { name: 'Run AI', exact: true }); await run.scrollIntoViewIfNeeded(); await run.focus();
      expect(await run.evaluate(element => { const r = element.getBoundingClientRect(); const hit = document.elementFromPoint(r.x+r.width/2,r.y+r.height/2); return hit === element || element.contains(hit); })).toBe(true);
      await page.screenshot({ path: test.info().outputPath(`${role}-${language}-ai.png`) });
    }
    if (role === 'parent') await verifyPublishedReport(page, `${role}-${language}-published-report.png`);
    expect(aiCalls).toBe(0); await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

for (const language of ['en', 'ar', 'ur'] as const) for (const role of ['parent', 'student'] as const) for (const mechanism of ['root-text', 'css-zoom'] as const) {
  test(`${language} ${role}: zoom audit ${mechanism} immediate and settled layout`, async ({ page }) => {
    const width = mechanism === 'css-zoom' ? 640 : 320;
    await page.setViewportSize({ width, height: mechanism === 'css-zoom' ? 1440 : 720 });
    await page.route('**/*', route => route.request().url().startsWith('http://family-dashboard.test/') ? route.fulfill({ contentType: 'text/html', body: `<html lang="${language}" dir="${language === 'en' ? 'ltr' : 'rtl'}"><body><div id="root"></div></body></html>` }) : route.abort());
    await page.route('**/api/navigation/access', route => route.fulfill({ json: { access: { reports: true, attendance: true, fees: true, timetable: true, students: true, exams: true, ai: true } } }));
    await page.route('**/api/profile', route => route.fulfill({ json: { profile: null } }));
    await page.route('**/api/academic-cycle', route => route.fulfill({ json: { active: null, data: [] } }));
    await page.route('**/api/timetable/class', route => route.fulfill({ json: { success: true, data: { slots: [] } } }));
    await page.route('**/api/exams?**', route => route.fulfill({ json: { success: true, exams: [] } }));
    await page.route('**/api/academic/calendar/unified?**', route => route.fulfill({ json: { success: true, data: { weekStartsOn: 1, weekends: [6, 7], holidays: [], terms: [], exams: [] } } }));
    let aiCalls = 0; await page.route('**/api/ai/**', route => { aiCalls++; return route.abort(); });
    await page.goto(`http://family-dashboard.test/${role}`); await page.addStyleTag({ content: css }); await page.addScriptTag({ content: js });
    await expect(page.locator('main h1')).toBeVisible();
    if (role === 'parent') await expect(page.getByText(PUBLISHED_EXAM_TITLE, { exact: true }).last()).toBeVisible();
    await expect(page.getByRole('region', { name: 'Results by subject', exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const report = await page.evaluate(async mode => {
      const started = performance.now();
      const read = (phase: string) => {
        const root = document.documentElement;
        const bounds = Array.from(document.querySelectorAll('body *')).map(element => {
          const box = element.getBoundingClientRect();
          return { tag: element.tagName, className: element.getAttribute('class')?.slice(0, 160), label: (element.getAttribute('aria-label') || element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 70), left: Math.round(box.left), right: Math.round(box.right), width: Math.round(box.width) };
        }).filter(box => box.width > 0 && (box.left < -1 || box.right > innerWidth + 1));
        return { phase, elapsed: Math.round(performance.now() - started), innerWidth, clientWidth: root.clientWidth, scrollWidth: root.scrollWidth, bodyWidth: document.body.getBoundingClientRect().width, rootZoom: getComputedStyle(root).zoom, rootFont: getComputedStyle(root).fontSize, compactMedia: matchMedia('(max-width: 639px)').matches, navHeight: getComputedStyle(document.querySelector('[data-role-shell]')!).getPropertyValue('--mobile-nav-height'), offenders: bounds.slice(0, 12) };
      };
      document.documentElement.style.setProperty(mode === 'css-zoom' ? 'zoom' : 'font-size', mode === 'css-zoom' ? '2' : '200%', 'important');
      const samples = [read('immediate')];
      for (let frame = 1; frame <= 4; frame++) { await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); samples.push(read(`frame-${frame}`)); }
      for (const ms of [100, 1000, 3000]) { await new Promise(resolve => setTimeout(resolve, Math.max(0, ms - (performance.now() - started)))); samples.push(read(`${ms}ms`)); }
      return samples;
    }, mechanism);
    console.log(`ZOOM_AUDIT ${language} ${role} ${mechanism} ${JSON.stringify(report)}`);
    await test.info().attach(`${role}-${language}-${mechanism}-measurements`, { contentType: 'application/json', body: JSON.stringify(report, null, 2) });
    const results = page.getByRole('region', { name: 'Results by subject', exact: true });
    await results.scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath(`${role}-${language}-${mechanism}-insights.png`) });
    const heading = results.getByRole('heading', { name: 'Results by subject', exact: true });
    const headingGeometry = await heading.evaluate(element => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height, line: parseFloat(getComputedStyle(element).lineHeight) * Number(getComputedStyle(document.documentElement).zoom || 1) }));
    expect(headingGeometry.width).toBeGreaterThanOrEqual(150);
    expect(headingGeometry.height).toBeLessThanOrEqual(headingGeometry.line * 3 + 1);
    if (role === 'parent') await verifyPublishedReport(page, `${role}-${language}-${mechanism}-published-report.png`);
    const final = report.at(-1)!;
    expect(final.rootZoom).toBe(mechanism === 'css-zoom' ? '2' : '1');
    expect(final.rootFont).toBe(mechanism === 'root-text' ? '32px' : '16px');
    expect(final.scrollWidth, JSON.stringify(final)).toBeLessThanOrEqual(final.clientWidth);
    expect(aiCalls).toBe(0);
  });
}
