import { test, expect, type Locator, type Page } from "@playwright/test";
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NEXT_TASK_TITLE, PUBLISHED_EXAM_TITLE, parentInboxPayload, studentTodayPayload } from './dashboard-data-mock';
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

/**
 * Home (family) and Today (learner) after the role re-architecture (role-ux §4.4, M96–M99): one PageHeader with
 * one contextual primary action, the family inbox / StudentToday first, and no stat rows, quick-access tiles,
 * calendar or AI panel on the landing screen. These checks reflow both screens at 320 px with 200 % text.
 */
async function mount(page: Page, role: 'parent' | 'student', language: 'en' | 'ar' | 'ur', style: string) {
  await page.route('**/*', route => route.request().url().startsWith('http://family-dashboard.test/') ? route.fulfill({ contentType: 'text/html', body: `<html lang="${language}" dir="${language === 'en' ? 'ltr' : 'rtl'}"><body><div id="root"></div></body></html>` }) : route.abort());
  await page.route('**/api/navigation/access', route => route.fulfill({ json: { access: { reports: true, attendance: true, fees: true, timetable: true, students: true, exams: true, ai: true } } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { profile: null } }));
  await page.route('**/api/academic-cycle', route => route.fulfill({ json: { active: null, data: [] } }));
  await page.route('**/api/parent/inbox', route => route.fulfill({ json: parentInboxPayload() }));
  await page.route('**/api/parent/invitations', route => route.fulfill({ json: { success: true, invitations: [] } }));
  await page.route('**/api/student/today**', route => route.fulfill({ json: studentTodayPayload() }));
  const aiCalls = { count: 0 };
  await page.route('**/api/ai/**', route => { aiCalls.count++; return route.abort(); });
  await page.goto(`http://family-dashboard.test/${role}`); await page.addStyleTag({ content: css + style }); await page.addScriptTag({ content: js });
  await expect(page.locator('main h1')).toBeVisible();
  return aiCalls;
}

async function assertReachable(page: Page, locator: Locator) {
  // Centred, so the fixed mobile navigation never sits over the control being hit-tested.
  await locator.evaluate(element => element.scrollIntoView({ block: 'center' }));
  const width = page.viewportSize()!.width;
  const box = (await locator.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(-1); expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
  expect(await locator.evaluate(element => { const r = element.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return hit === element || element.contains(hit); })).toBe(true);
}

async function verifyLatestResult(page: Page, language: 'en' | 'ar' | 'ur', screenshotName: string) {
  const panel = page.locator('section[aria-labelledby="home-latest-result"]');
  await expect(panel.getByRole('heading', { name: translateUi('Latest result', language), exact: true })).toBeVisible();
  const title = panel.getByText(PUBLISHED_EXAM_TITLE, { exact: true });
  const score = panel.getByText('80%', { exact: true });
  await expect(title).toBeVisible(); await expect(score).toBeVisible();
  const width = page.viewportSize()!.width;
  for (const field of [title, score]) {
    const box = (await field.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width);
  }
  // At phone width with enlarged text the score wraps under the title instead of squeezing it.
  const titleBox = (await title.boundingBox())!, scoreBox = (await score.boundingBox())!;
  expect(scoreBox.y).toBeGreaterThanOrEqual(titleBox.y + titleBox.height);
  const resultsLink = panel.getByRole('link', { name: translateUi('All results', language) });
  await resultsLink.focus(); await assertReachable(page, resultsLink);
  await panel.screenshot({ path: test.info().outputPath(screenshotName) });
}

for (const language of ['en', 'ar', 'ur'] as const) for (const role of ['parent', 'student'] as const) {
  test(`${language} ${role}: landing screen reflows at320/200% with one primary action`, async ({ page }) => {
    const t = (text: string) => translateUi(text, language);
    const aiCalls = await mount(page, role, language, '\nhtml {font-size:200% !important;}');
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    // Exactly one primary action, in the page header (§4.3, §4.4).
    const primary = page.locator('[data-tour="page.primary-action"]');
    await expect(primary).toHaveCount(1);
    await assertReachable(page, primary);
    if (role === 'parent') {
      // Home: the top family request is the primary action; the inbox is the one queue (M96).
      await expect(primary).toContainText(t('Pay {0}').replace('{0}', 'USD 45.00'));
      const inbox = page.locator('[data-tour="parent.home.inbox"]');
      await expect(inbox.locator('[data-inbox-item]')).toHaveCount(1);
      await assertReachable(page, inbox.locator('[data-inbox-open]').first());
      await page.screenshot({ path: test.info().outputPath(`${role}-${language}-home.png`) });
      for (const removed of ['Quick Access', 'Results by subject', 'Exam by exam']) await expect(page.getByRole('heading', { name: removed, exact: true })).toHaveCount(0);
      await verifyLatestResult(page, language, `${role}-${language}-latest-result.png`);
    } else {
      // Today: StudentToday only; its next step is the header's "Continue: …" (M99).
      await expect(primary).toContainText(NEXT_TASK_TITLE);
      const next = page.locator('[data-tour="student.today.next"]');
      await expect(next.locator('[data-next-action="NEXT_DUE"]')).toBeVisible();
      await assertReachable(page, page.locator('[data-today-lessons] li').first());
      await expect(page.getByRole('button', { name: 'Run AI', exact: true })).toHaveCount(0);
      await page.screenshot({ path: test.info().outputPath(`${role}-${language}-today.png`) });
    }
    expect(aiCalls.count).toBe(0);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

for (const language of ['en', 'ar', 'ur'] as const) for (const role of ['parent', 'student'] as const) for (const mechanism of ['root-text', 'css-zoom'] as const) {
  test(`${language} ${role}: zoom audit ${mechanism} immediate and settled layout`, async ({ page }) => {
    const width = mechanism === 'css-zoom' ? 640 : 320;
    await page.setViewportSize({ width, height: mechanism === 'css-zoom' ? 1440 : 720 });
    const aiCalls = await mount(page, role, language, '');
    const landing = role === 'parent' ? page.locator('[data-tour="parent.home.inbox"]') : page.locator('[data-student-today]');
    await expect(landing).toBeVisible();
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
    await landing.scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath(`${role}-${language}-${mechanism}-landing.png`) });
    const heading = page.locator('main h1');
    const headingGeometry = await heading.evaluate(element => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height, line: parseFloat(getComputedStyle(element).lineHeight) * Number(getComputedStyle(document.documentElement).zoom || 1) }));
    expect(headingGeometry.width).toBeGreaterThan(0);
    expect(headingGeometry.height).toBeLessThanOrEqual(headingGeometry.line * 3 + 1);
    if (role === 'parent') await verifyLatestResult(page, language, `${role}-${language}-${mechanism}-latest-result.png`);
    const final = report.at(-1)!;
    expect(final.rootZoom).toBe(mechanism === 'css-zoom' ? '2' : '1');
    expect(final.rootFont).toBe(mechanism === 'root-text' ? '32px' : '16px');
    expect(final.scrollWidth, JSON.stringify(final)).toBeLessThanOrEqual(final.clientWidth);
    expect(aiCalls.count).toBe(0);
  });
}
