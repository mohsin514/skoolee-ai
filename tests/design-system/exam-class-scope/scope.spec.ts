import { test, expect, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type {} from './fixture';
const toolRequire = createRequire(createRequire(path.join(process.cwd(), 'package.json')).resolve('tsx'));
const { build } = toolRequire('esbuild'); const { compile } = toolRequire('@tailwindcss/node'); const { Scanner } = toolRequire('@tailwindcss/oxide');
let script: string, css: string;
test.beforeAll(async () => {
  const root = process.cwd(), fixture = path.join(root, 'tests/design-system/exam-class-scope');
  const result = await build({ entryPoints: [path.join(fixture, 'fixture.tsx')], outfile: path.join(root, 'test-results/exam-class-scope.js'), bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"', 'process.env': '{}' }, alias: {
    '@/components/role-dashboard': path.join(root, 'src/components/role-dashboard/BrandButton.tsx'),
    '@/app/actions/locale': path.join(root, 'tests/design-system/foundation-b/locale-action.ts'),
    '@/components/academic-year/CycleGate': path.join(fixture, 'unused-board.tsx'),
    '@/components/academic/exams/ExamDetailDialog': path.join(fixture, 'unused-board.tsx'),
    '@/components/academic/ExamBoardCard': path.join(fixture, 'unused-board.tsx'),
    '@/components/academic/ExamTableView': path.join(fixture, 'unused-board.tsx'),
    '@/components/academic/ExamTimelineView': path.join(fixture, 'unused-board.tsx'),
  }, plugins: [{ name: 'export-actual-private-modal', setup(builder: { onLoad: (filter: { filter: RegExp }, callback: (args: { path: string }) => Promise<unknown>) => void }) {
    builder.onLoad({ filter: /ExamCycleManager\.tsx$/ }, async ({ path: sourcePath }) => ({ contents: `${await readFile(sourcePath, 'utf8')}\nexport { CreateExamModal };`, loader: 'tsx', resolveDir: path.dirname(sourcePath) }));
  } }] });
  script = result.outputFiles.find((file: { path: string }) => file.path.endsWith('.js')).text;
  const compiler = await compile(await readFile(path.join(root, 'src/app/globals.css'), 'utf8'), { base: path.join(root, 'src/app'), onDependency() {} });
  css = compiler.build(new Scanner({ sources: [{ base: root, pattern: 'src/components/**/*.{ts,tsx}', negated: false }] }).scan());
});
test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<html lang="en"><head><title>Exam class scope fixture</title></head><body><div id="root"></div></body></html>' }));
  await page.goto('http://exam-class-scope.test/'); await page.addStyleTag({ content: css }); await page.addScriptTag({ content: script }); await expect(page.getByRole('dialog', { name: 'Create Test' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.examClassFixture.requests.length)).toBe(1);
});
const classData = (campus: string) => ({ data: [{ id: `${campus}-class`, name: `${campus.toUpperCase()} synthetic class`, section: 'A' }] });
async function complete(page: Page, id: number, campus: string) { await page.evaluate(({ id, data }) => window.examClassFixture.resolve(id, data), { id, data: classData(campus) }); }
async function selectNorth(page: Page) { await complete(page, 1, 'north'); await page.getByRole('combobox', { name: 'Class', exact: true }).selectOption('north-class'); await page.getByRole('textbox', { name: 'Exam Title', exact: true }).fill('Synthetic scoped test'); await expect(page.getByRole('button', { name: 'Create Test', exact: true })).toBeEnabled(); }

test('campus changes fence selected class and submit in the first commit before effects', async ({ page }) => {
  await selectNorth(page); await page.evaluate(() => window.examClassFixture.setScope('south'));
  await expect.poll(() => page.evaluate(() => window.examClassFixture.requests.length)).toBe(2);
  const frame = await page.evaluate(() => window.examClassFixture.frames.find(frame => frame.campus === 'south'));
  expect(frame).toBeDefined(); expect(frame!.disabled).toBe(true); expect(frame!.options).not.toContain('north-class');
  await expect(page.getByRole('button', { name: 'Create Test', exact: true })).toBeDisabled();
  await complete(page, 2, 'south'); await expect(page.getByRole('combobox', { name: 'Class', exact: true })).toHaveValue(''); await expect(page.getByRole('textbox', { name: 'Exam Title', exact: true })).toHaveValue('Synthetic scoped test');
  await expect(page.locator('option[value="north-class"]')).toHaveCount(0); await page.getByRole('combobox', { name: 'Class', exact: true }).selectOption('south-class');
  await page.getByRole('button', { name: 'Create Test', exact: true }).click(); await expect(page.getByRole('status')).toHaveText('Created: 1');
  const posts = await page.evaluate(() => window.examClassFixture.posts); expect(posts).toHaveLength(1); expect(posts[0]).toMatchObject({ classId: 'south-class' });
  await page.screenshot({ path: test.info().outputPath('current-campus-selection.png') });
});
test('late previous-campus results cannot overwrite the current list even if transport ignores abort', async ({ page }) => {
  await page.evaluate(() => { window.examClassFixture.ignoreAborts = true; window.examClassFixture.setScope('south'); });
  await expect.poll(() => page.evaluate(() => window.examClassFixture.requests.length)).toBe(2); await complete(page, 2, 'south'); await complete(page, 1, 'north');
  await expect(page.locator('option[value="south-class"]')).toHaveCount(1); await expect(page.locator('option[value="north-class"]')).toHaveCount(0);
  const requests = await page.evaluate(() => window.examClassFixture.requests); expect(requests[0].aborted).toBe(true); expect(requests.every(request => request.cache === 'no-store')).toBe(true);
});
test('remount in the same campus fetches fresh access and refuses the old cached class list', async ({ page }) => {
  await selectNorth(page); await page.evaluate(() => window.examClassFixture.setOpen(false)); await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.evaluate(() => window.examClassFixture.setOpen(true)); await expect.poll(() => page.evaluate(() => window.examClassFixture.requests.length)).toBe(2);
  await expect(page.locator('option[value="north-class"]')).toHaveCount(0); await page.evaluate(() => window.examClassFixture.resolve(2, { error: 'Current campus access denied' }, 403));
  await expect(page.getByText('Current campus access denied')).toBeVisible(); await expect(page.getByRole('button', { name: 'Create Test', exact: true })).toBeDisabled(); await expect(page.locator('option[value="north-class"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Retry', exact: true }).click(); await expect.poll(() => page.evaluate(() => window.examClassFixture.requests.length)).toBe(3); await complete(page, 3, 'north-refreshed');
  await expect(page.locator('option[value="north-refreshed-class"]')).toHaveCount(1); await expect(page.locator('option[value="north-class"]')).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('fresh-class-after-access-retry.png') });
});
test('class request timeout exposes retry and keeps submission closed', async ({ page }) => {
  // The first request timer was created before clock installation, so remount
  // under the controlled clock to test the actual 20-second timeout.
  await page.evaluate(() => window.examClassFixture.setOpen(false)); await page.clock.install(); await page.evaluate(() => window.examClassFixture.setOpen(true));
  await expect.poll(() => page.evaluate(() => window.examClassFixture.requests.length)).toBe(2); await page.clock.fastForward(20_050);
  await expect(page.getByText('Classes took too long to load')).toBeVisible(); await expect(page.getByRole('button', { name: 'Create Test', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Retry', exact: true }).click(); await expect.poll(() => page.evaluate(() => window.examClassFixture.requests.length)).toBe(3); await complete(page, 3, 'north');
  await expect(page.getByRole('combobox', { name: 'Class', exact: true })).toHaveValue(''); await expect(page.getByRole('button', { name: 'Create Test', exact: true })).toBeDisabled();
});
