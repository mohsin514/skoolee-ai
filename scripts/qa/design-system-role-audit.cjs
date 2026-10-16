/** Run only against a disposable local app/database; never reads .env profiles.
 * TEST_BASE_URL=http://localhost:3208 TEST_DATABASE_URL=postgresql://.../sko208 node scripts/qa/design-system-role-audit.cjs
 */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { randomUUID } = crypto;
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
// Privileged roles (APP_OWNER/SUPER_ADMIN/ADMIN/CAMPUS_ADMIN/PRINCIPAL) require a second
// factor at sign-in (added after SKO-196). The original inline helper sent email+password
// only, so those roles never obtained a real session. The harness now completes the genuine
// /api/auth/mfa enrolment/challenge; no navigation or accessibility assertion is changed.
const MFA_AUTH_SECRET = process.env.AUTH_SECRET || 'dev-secret-change-me';
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const mfaSecrets = new Map();
const sha256 = value => crypto.createHash('sha256').update(value).digest();
function decodeBase32(secret) { let bits = ''; for (const char of secret) bits += B32.indexOf(char).toString(2).padStart(5, '0'); return Buffer.from(bits.match(/.{8}/g).map(byte => parseInt(byte, 2))); }
function totp(secret, step) { const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(step)); const digest = crypto.createHmac('sha1', decodeBase32(secret)).update(counter).digest(); const offset = digest[19] & 15; return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0'); }
function revealSecret(value) { const bytes = Buffer.from(value, 'base64url'); const decipher = crypto.createDecipheriv('aes-256-gcm', sha256(Buffer.from(MFA_AUTH_SECRET)), bytes.subarray(0, 12)); decipher.setAuthTag(bytes.subarray(12, 28)); return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'); }
const mfaPost = (context, body) => context.request.post(origin + '/api/auth/mfa', { data: body });
async function completeMfa(context, user, role) {
  const status = await (await context.request.get(origin + '/api/auth/mfa')).json();
  let secret = mfaSecrets.get(user.email);
  if (!secret && status.enrolled) { const row = await db.user.findUnique({ where: { id: user.id } }); if (row && row.mfaSecret) secret = revealSecret(row.mfaSecret); }
  if (!secret) {
    const setup = await mfaPost(context, { action: 'setup' }); assert.equal(setup.status(), 200, `MFA setup ${role}`);
    secret = (await setup.json()).secret; mfaSecrets.set(user.email, secret);
    const verify = await mfaPost(context, { action: 'verify-setup', code: totp(secret, Math.floor(Date.now() / 30000)) });
    assert.equal(verify.status(), 200, `MFA verify-setup ${role}: ${await verify.text()}`);
    const ack = await mfaPost(context, { action: 'acknowledge', acknowledged: true });
    assert.equal(ack.status(), 200, `MFA acknowledge ${role}: ${await ack.text()}`); return;
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const challenge = await mfaPost(context, { action: 'challenge', code: totp(secret, Math.floor(Date.now() / 30000) + 1) });
    if (challenge.status() === 200) return;
    await new Promise(resolve => setTimeout(resolve, (31 - (Date.now() / 1000) % 30) * 1000));
  }
  assert.fail(`MFA challenge did not succeed for ${role}`);
}
async function login(context, user, role) {
  const response = await context.request.post(origin + '/api/auth/login', { data: { email: user.email, password } });
  assert.equal(response.status(), 200, `Login ${role}`);
  const body = await response.json();
  if (body.mfaRequired) await completeMfa(context, user, role);
}
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
  const student = await db.student.create({ data: { schoolId: school.id, campusId: campus.id, classId: classroom.id, studentUserId: users.STUDENT.id, parentUserId: users.PARENT.id, fullName: 'Synthetic Learner', rollNo: 'QA01', gender: 'MALE' } });
  // The family portal authorizes a guardian through a verified, child-specific
  // relationship plus a current permission version (guardian access intervals),
  // not through the legacy student.parentUserId link. Seed the current model so
  // the PARENT role is exercised as a real guardian would be.
  const guardianship = await db.guardianRelationship.create({ data: { schoolId: school.id, campusId: campus.id, studentId: student.id, guardianUserId: users.PARENT.id, createdByUserId: users.ADMIN.id, fullName: 'QA PARENT', email: users.PARENT.email, relationship: 'father', status: 'ACTIVE', verifiedAt: new Date(), validFrom: new Date(Date.now() - 60_000) } });
  await db.guardianAccessVersion.create({ data: { schoolId: school.id, relationshipId: guardianship.id, createdByUserId: users.ADMIN.id, reason: 'QA fixture: current guardian rights', permissions: { learningRecords: false, attendance: true, finances: false, communication: false, pickup: false, consents: { medicalTreatment: false, fieldTrips: false, mediaPublication: false, offsiteTravel: false } } } });
  // The family portal is now governed by the verified guardian permission version above
  // (reports/exams/timetable follow learningRecords, fees follows finances). The guardian
  // is granted attendance only, so the fee and timetable links stay hidden — the exact
  // denial this branch checks. The school's PARENT module policy below remains the ceiling.
  for (const permissionModule of ['students','fees','payroll','leave','attendance','timetable','exams','reports','staff','admissions','accounts','ai','library','front-desk','transport','inventory','dormitory']) {
    await db.rolePermission.create({ data: { schoolId: school.id, role: 'PARENT', module: permissionModule, canView: ['reports', 'attendance'].includes(permissionModule) } });
  }
  browser = await chromium.launch();
  for (const [role, path] of Object.entries(routes)) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    await login(context, users[role], role);
    // Prove the app is connected to this fixture database, not merely another local server.
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await visit(page, path);
    // Browser fetch honors Secure cookies on trustworthy loopback in production.
    const session = await page.evaluate(async () => (await fetch('/api/auth/session')).json());
    assert.equal(session.user?.id, users[role].id, 'App/database fixture mismatch');
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
    await db.studentEnrollment.deleteMany({ where: { schoolId: school.id } });
    await db.guardianAccessVersion.deleteMany({ where: { schoolId: school.id } });
    await db.guardianRelationship.deleteMany({ where: { schoolId: school.id } });
    await db.student.deleteMany({ where: { schoolId: school.id } });
    await db.class.deleteMany({ where: { schoolId: school.id } });
    await db.user.deleteMany({ where: { schoolId: school.id } });
    await db.school.delete({ where: { id: school.id } });
    assert.equal(await db.user.count({ where: { schoolId: school.id } }), 0);
  }
  await db.$disconnect();
  writeFileSync(`${output}/results.json`, JSON.stringify({ run, results, fixturesRemoved: true }, null, 2));
});
