/** Run only against a disposable local app/database; never reads .env profiles.
 * TEST_BASE_URL=http://localhost:3208 TEST_DATABASE_URL=postgresql://.../sko208 node scripts/qa/design-system-role-audit.cjs
 */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { mkdirSync, writeFileSync } = require('node:fs');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { chromium, expect } = require('@playwright/test');

const origin = process.env.TEST_BASE_URL;
const databaseUrl = process.env.TEST_DATABASE_URL;
const local = value => ['localhost', '127.0.0.1', '[::1]'].includes(new URL(value).hostname);
assert(origin && databaseUrl && local(origin) && local(databaseUrl), 'Explicit loopback app and database URLs are required');
assert(new URL(databaseUrl).pathname.startsWith('/sko208'), 'Use a disposable sko208-prefixed database');
const db = new PrismaClient({ datasourceUrl: databaseUrl });
const routes = { APP_OWNER: '/owner', SUPER_ADMIN: '/super', CAMPUS_ADMIN: '/admin', ADMIN: '/admin', PRINCIPAL: '/principal', TEACHER: '/teacher', PARENT: '/parent', STUDENT: '/student', ACCOUNTANT: '/accountant', LIBRARIAN: '/librarian', RECEPTIONIST: '/receptionist' };
const run = randomUUID();
const password = `QA-${randomUUID()}!`;
const output = 'test-results/design-system/roles';
mkdirSync(output, { recursive: true });
let school, browser;
const results = [];
async function fits(page) {
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Horizontal page overflow: ${page.url()}`);
}
async function visit(page, path) {
  const response = await page.goto(origin + path);
  assert(response.ok(), `${path}: HTTP ${response.status()}`);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('body')).not.toContainText('Application error:');
}
(async () => {
  school = await db.school.create({ data: { name: 'Synthetic Navigation QA', slug: `sko208-${run}`, status: 'ACTIVE', plan: 'PRO', city: 'QA', regId: run, contactEmail: `${run}@example.invalid` } });
  const campus = await db.campus.create({ data: { schoolId: school.id, name: 'QA Campus', city: 'QA', regId: `${run}-campus` } });
  const users = {};
  for (const role of Object.keys(routes)) users[role] = await db.user.create({ data: { schoolId: school.id, campusId: campus.id, email: `${run}-${role}@example.invalid`, fullName: `QA ${role}`, role, password: await bcrypt.hash(password, 10), onboardingComplete: true } });
  const classroom = await db.class.create({ data: { schoolId: school.id, campusId: campus.id, name: 'QA Class', academicYear: 2026, classTeacherId: users.TEACHER.id } });
  await db.student.create({ data: { schoolId: school.id, campusId: campus.id, classId: classroom.id, studentUserId: users.STUDENT.id, parentUserId: users.PARENT.id, fullName: 'Synthetic Learner', rollNo: 'QA01', gender: 'MALE' } });
  // The real family portal gets just two enabled modules from its actual DB policy.
  for (const permissionModule of ['students','fees','payroll','leave','attendance','timetable','exams','reports','staff','admissions','accounts','ai','library','front-desk','transport','inventory','dormitory']) {
    await db.rolePermission.create({ data: { schoolId: school.id, role: 'PARENT', module: permissionModule, canView: ['reports', 'attendance'].includes(permissionModule) } });
  }
  browser = await chromium.launch();
  for (const [role, path] of Object.entries(routes)) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    const login = await context.request.post(origin + '/api/auth/login', { data: { email: users[role].email, password } });
    assert.equal(login.status(), 200, `Login ${role}`);
    // Prove the app is connected to this fixture database, not merely another local server.
    const session = await context.request.get(origin + '/api/auth/session');
    assert((await session.text()).includes(users[role].id), 'App/database fixture mismatch');
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await visit(page, path);
    assert.equal(new URL(page.url()).pathname, path);
    await expect(page.getByRole('navigation', { name: 'Primary navigation', exact: true })).toBeVisible();
    await expect(page.locator('nav[aria-label="Primary navigation"] [aria-current="page"]').first()).toBeVisible();
    await fits(page);
    await page.screenshot({ path: `${output}/${role}-desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 768, height: 1024 });
    await fits(page);
    await page.screenshot({ path: `${output}/${role}-tablet.png`, fullPage: true });
    await page.setViewportSize({ width: 360, height: 800 });
    await fits(page);
    const more = page.getByRole('button', { name: 'More', exact: true });
    await more.click();
    await expect(page.getByRole('dialog', { name: 'Navigation', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(more).toBeFocused();
    if (role === 'PARENT') {
      await expect(page.locator('nav a[href*="/parent/fees"]')).toHaveCount(0);
      await expect(page.locator('nav a[href*="/parent/timetable"]')).toHaveCount(0);
      await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
      await fits(page);
      await visit(page, '/parent/fees');
      await expect(page.getByText(/not available with your current access/)).toBeVisible();
    }
    await page.screenshot({ path: `${output}/${role}-phone.png`, fullPage: true });
    if (role === 'ADMIN') {
      for (const extra of ['/dashboard/students', '/messages']) {
        await visit(page, extra);
        assert.equal(new URL(page.url()).pathname, extra);
        await fits(page);
        await page.screenshot({ path: `${output}/${extra.replaceAll('/', '-')}.png`, fullPage: true });
      }
    }
    assert.deepEqual(errors, [], `${role} browser errors`);
    results.push({ role, route: path, login: 200, desktop: 1280, tablet: 768, phone: 360, activeNavigation: true, keyboardDrawer: true, pageErrors: errors });
    console.log(`PASS ${role}: real login, desktop/tablet/phone, active navigation, keyboard drawer`);
    await context.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await browser?.close();
  if (school) {
    const users = await db.user.findMany({ where: { schoolId: school.id }, select: { id: true } });
    await db.superAdminAuditLog.deleteMany({ where: { userId: { in: users.map(user => user.id) } } });
    await db.student.deleteMany({ where: { schoolId: school.id } });
    await db.class.deleteMany({ where: { schoolId: school.id } });
    await db.user.deleteMany({ where: { schoolId: school.id } });
    await db.school.delete({ where: { id: school.id } });
    assert.equal(await db.user.count({ where: { schoolId: school.id } }), 0);
  }
  await db.$disconnect();
  writeFileSync(`${output}/results.json`, JSON.stringify({ run, results, fixturesRemoved: true }, null, 2));
});
