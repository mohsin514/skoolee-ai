import { test, expect, type Page, type Route } from '@playwright/test';
import { createRequire } from 'node:module';
import path from 'node:path';
// SKAI-1566 AC6: component coverage for roster/source load failures, empty results and scoped retry.
const toolRequire = createRequire(createRequire(path.join(process.cwd(), 'package.json')).resolve('tsx'));
const { build } = toolRequire('esbuild');
let script: string;
test.beforeAll(async () => {
  const root = process.cwd(), dir = path.join(root, 'tests/design-system/script-intake'), stub = path.join(dir, 'stubs.tsx');
  const result = await build({ entryPoints: [path.join(dir, 'fixture.tsx')], bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"', 'process.env': '{}' }, plugins: [{ name: 'stub-unused', setup(b: { onResolve: (f: { filter: RegExp }, cb: () => { path: string }) => void }) {
    b.onResolve({ filter: /^(next\/image|\.\/script-response-proposal|\.\/script-qr-reader|\.\/assessment-extensions)$/ }, () => ({ path: stub }));
    b.onResolve({ filter: /^@\/app\/actions\/locale$/ }, () => ({ path: path.join(root, 'tests/design-system/foundation-b/locale-action.ts') }));
  } }] });
  script = result.outputFiles[0].text;
});
type Reply = { status: number; body: string };
const ok = (data: unknown): Reply => ({ status: 200, body: JSON.stringify(data) });
const fail: Reply = { status: 500, body: '<html>Internal error</html>' };
const roster = (names: string[]) => ok({ accommodations: { students: names.map((n, i) => ({ id: `s${i}`, fullName: n, rollNo: `R${i}` })) } });
const sources = (titles: string[]) => ok({ records: titles.map((title, i) => ({ id: `src${i}`, version: 1, title, data: { documentKind: 'answer_script', subjectId: 'qa01-subject', classId: 'qa01-class', extractedText: 'x' } })) });
async function mount(page: Page, rosterReplies: Reply[], sourceReplies: Reply[]) {
  const calls = { roster: 0, sources: 0 };
  const serve = (key: 'roster' | 'sources', replies: Reply[]) => (route: Route) => { const r = replies[Math.min(calls[key]++, replies.length - 1)]; return route.fulfill({ status: r.status, contentType: r.status === 200 ? 'application/json' : 'text/html', body: r.body }); };
  await page.route('**/api/school-ai/exams/qa01-exam/accommodations', serve('roster', rosterReplies));
  await page.route('**/api/school-ai/workspace?**', serve('sources', sourceReplies));
  await page.route('**/api/school-ai/exams/qa01-exam/scripts', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: { student: { fullName: 'QA-01 Student A', rollNo: 'R0' }, paperVersion: 1 } }) }));
  await page.route('http://script-intake.test/', route => route.fulfill({ contentType: 'text/html', body: '<html lang="en"><head><title>Script intake fixture</title></head><body><div id="root"></div></body></html>' }));
  await page.goto('http://script-intake.test/'); await page.addScriptTag({ content: script });
  await page.getByText('Match scanned script').click();
  return calls;
}
const student = (page: Page) => page.getByRole('combobox', { name: 'Print script identification' });
const source = (page: Page) => page.getByRole('combobox', { name: 'Reviewed source record ID' });
const rosterAlert = (page: Page) => page.locator('[data-script-roster-failed]');
const sourceAlert = (page: Page) => page.locator('[data-script-sources-failed]');
async function verify(page: Page) { await page.getByRole('textbox', { name: 'Script matching code' }).fill('qa01-token'); await page.getByRole('button', { name: 'Verify matching code' }).click(); await expect(source(page)).toBeVisible(); }

test('roster-only failure shows an error while sources stay usable', async ({ page }) => {
  await mount(page, [fail], [sources(['QA-01 scan'])]);
  await expect(rosterAlert(page)).toBeVisible(); await expect(student(page).locator('option')).toHaveCount(1);
  await verify(page); await expect(sourceAlert(page)).toHaveCount(0); await expect(source(page).locator('option', { hasText: 'QA-01 scan' })).toHaveCount(1);
});
test('source-only failure shows an error while the roster stays usable', async ({ page }) => {
  await mount(page, [roster(['QA-01 Student A'])], [fail]);
  await expect(student(page).locator('option', { hasText: 'QA-01 Student A' })).toHaveCount(1); await expect(rosterAlert(page)).toHaveCount(0);
  await verify(page); await expect(sourceAlert(page)).toBeVisible(); await expect(source(page).locator('option')).toHaveCount(1);
});
test('both failures show both errors', async ({ page }) => {
  await mount(page, [fail], [{ status: 403, body: '{"error":"denied"}' }]);
  await expect(rosterAlert(page)).toBeVisible(); await verify(page); await expect(sourceAlert(page)).toBeVisible();
});
test('successful empty responses render empty selectors without errors', async ({ page }) => {
  await mount(page, [roster([])], [sources([])]);
  await expect(student(page).locator('option')).toHaveCount(1); await verify(page);
  await expect(source(page).locator('option')).toHaveCount(1); await expect(page.getByRole('alert')).toHaveCount(0);
});
test('retry re-runs only the failed dependency and keeps the loaded one', async ({ page }) => {
  const calls = await mount(page, [fail, roster(['QA-01 Student B'])], [fail, sources(['QA-01 retry scan'])]);
  await expect(rosterAlert(page)).toBeVisible(); await rosterAlert(page).getByRole('button', { name: 'Refresh' }).click();
  await expect(rosterAlert(page)).toHaveCount(0); await expect(student(page).locator('option', { hasText: 'QA-01 Student B' })).toHaveCount(1);
  expect(calls).toEqual({ roster: 2, sources: 1 });
  await verify(page); await sourceAlert(page).getByRole('button', { name: 'Refresh' }).click();
  await expect(sourceAlert(page)).toHaveCount(0); await expect(source(page).locator('option', { hasText: 'QA-01 retry scan' })).toHaveCount(1);
  expect(calls).toEqual({ roster: 2, sources: 2 }); await expect(student(page).locator('option', { hasText: 'QA-01 Student B' })).toHaveCount(1);
});
