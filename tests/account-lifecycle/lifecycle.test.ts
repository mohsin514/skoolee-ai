import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { totp, verifyTotp, requiresMfa, newAuthenticatorSecret, protectSecret, revealSecret } from '../../src/lib/auth/mfa-crypto';
import { USER_ROLES } from '../../src/lib/roles';
import { acceptInvite } from '../../src/app/actions/invite';
import { invitationContext } from '../../src/lib/auth/invitation-context';
import { redis } from '../../src/lib/queue/connection';
import { prisma } from '../../src/lib/db/prisma';
import { SignJWT } from 'jose';
import { hashSessionToken } from '../../src/lib/auth/session-cookie';
const dbUrl = new URL(process.env.DATABASE_URL || 'http://invalid');
if (dbUrl.hostname !== '127.0.0.1' || dbUrl.port !== '55409' || dbUrl.pathname !== '/postgres') throw Error('Only isolated local database on 55409 is allowed');
const base = 'http://localhost:3209'; const raw = new PrismaClient();
const schoolId = `lifecycle-${randomUUID()}`, campusId = randomUUID(), campusB = randomUUID();
const password = 'SyntheticPass209!'; const accounts = new Map<string, { id: string; email: string }>();
function cookie(r: Response, name: string) { return r.headers.getSetCookie().find(v => v.startsWith(`${name}=`))?.split(';')[0] || ''; }
async function post(path: string, body: unknown, session = '') { return fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', cookie: session }, body: JSON.stringify(body), redirect: 'manual' }); }
async function login(role: string) { return post('/api/auth/login', { email: accounts.get(role)!.email, password }); }
async function mfa(session: string, body: unknown) { return post('/api/auth/mfa', body, session); }
async function sessionCheck(session: string) { return fetch(base + '/api/auth/session', { headers: { cookie: session }, redirect: 'manual' }); }
before(async () => {
 await raw.school.create({ data: { id: schoolId, name: 'Synthetic lifecycle school', slug: schoolId, regId: schoolId, contactEmail: 'synthetic@example.invalid', city: 'Synthetic', status: 'ACTIVE', plan: 'PRO' } });
 for (const id of [campusId, campusB]) await raw.campus.create({ data: { id, schoolId, name: 'Synthetic campus', city: 'Synthetic', regId: id } });
 const hash = await bcrypt.hash(password, 12);
 for (const role of USER_ROLES) { const id = randomUUID(), email = `${id}@example.invalid`; await raw.user.create({ data: { id, email, password: hash, schoolId, campusId, fullName: 'Synthetic tester', role, isInstitutionOwner: role === 'SUPER_ADMIN', isActive: true, onboardingComplete: true } }); accounts.set(role, { id, email }); }
 await raw.authAttempt.deleteMany({});
});
after(async () => { await raw.school.delete({ where: { id: schoolId } }); await raw.$disconnect(); await prisma.$disconnect(); redis.disconnect(); });
test('TOTP known RFC 6238 vector and replay/clock boundary', () => { const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; assert.equal(totp(secret, 1), '287082'); assert.equal(verifyTotp(secret, '287082', -1, 59_000), 1); assert.equal(verifyTotp(secret, '287082', 1, 59_000), null); const s = newAuthenticatorSecret(); assert.equal(revealSecret(protectSecret(s)), s); assert.throws(() => revealSecret('bad')); });
for (const role of USER_ROLES) test(`login grants only appropriate access: ${role}`, async () => { const r = await login(role); assert.equal(r.status, 200, await r.clone().text()); if (requiresMfa({ role })) { assert.equal((await r.json()).mfaRequired, true); assert.ok(cookie(r, 'skoolee-mfa')); assert.equal(await sessionCheck(cookie(r, 'skoolee-mfa')).then(r => r.status), 401); } else { assert.equal(await sessionCheck(cookie(r, 'skoolee_token')).then(r => r.status), 200); } });
let recovery: string[] = [], ownerSession = '';
test('MFA requires challenge then recovery acknowledgement; secrets not retrievable', async () => {
 const ticket = cookie(await login('SUPER_ADMIN'), 'skoolee-mfa');
 const setup = await mfa(ticket, { action: 'setup' }); assert.equal(setup.status, 200, await setup.clone().text()); const { secret } = await setup.json();
 assert.equal((await mfa(ticket, { action: 'acknowledge', acknowledged: true })).status, 400);
 assert.equal((await mfa(ticket, { action: 'verify-setup', code: 'invalid' })).status, 400);
 const verified = await mfa(ticket, { action: 'verify-setup', code: totp(secret) }); assert.equal(verified.status, 200, await verified.clone().text()); recovery = (await verified.json()).recoveryCodes; assert.equal(recovery.length, 10);
 assert.equal((await raw.user.findUniqueOrThrow({ where: { id: accounts.get('SUPER_ADMIN')!.id } })).mfaEnabled, false);
 assert.equal((await mfa(ticket, { action: 'verify-setup', code: totp(secret) })).status, 400);
 const status = await fetch(base + '/api/auth/mfa', { headers: { cookie: ticket } }).then(r => r.json()); assert.equal(status.secret, undefined); assert.equal(status.recoveryCodes, undefined);
 const complete = await mfa(ticket, { action: 'acknowledge', acknowledged: true }); assert.equal(complete.status, 200, await complete.clone().text()); ownerSession = cookie(complete, 'skoolee_token'); assert.equal((await sessionCheck(ownerSession)).status, 200);
 const user = await raw.user.findUniqueOrThrow({ where: { id: accounts.get('SUPER_ADMIN')!.id } }); assert.ok(user.mfaEnabled); assert.notEqual(user.mfaSecret, secret); assert.equal(user.mfaPendingSecret, null); assert.ok(!user.recoveryCodeHashes.includes(recovery[0]));
});
test('same recovery code in separate browser sessions succeeds exactly once and revokes previous sessions', async () => {
 await raw.authAttempt.deleteMany({});
 const one = cookie(await login('SUPER_ADMIN'), 'skoolee-mfa'), two = cookie(await login('SUPER_ADMIN'), 'skoolee-mfa');
 const responses = await Promise.all([mfa(one, { action: 'challenge', recovery: true, code: recovery[0] }), mfa(two, { action: 'challenge', recovery: true, code: recovery[0] })]);
 const recoveredSession = cookie(responses.find(r => r.status === 200)!, "skoolee_token");
 assert.equal(responses.filter(r => r.status === 200).length, 1, await Promise.all(responses.map(r => r.clone().text())).then(x => x.join('\n'))); assert.equal((await sessionCheck(ownerSession)).status, 401); ownerSession = recoveredSession;
 const ticket = cookie(await login('SUPER_ADMIN'), 'skoolee-mfa'); assert.notEqual((await mfa(ticket, { action: 'challenge', recovery: true, code: recovery[0] })).status, 200);
});
test('deactivation stops session, marks, messaging, AI and report requests immediately', async () => {
 const c = cookie(await login('TEACHER'), 'skoolee_token'); assert.equal((await sessionCheck(c)).status, 200);
 const removed = await fetch(base + '/api/staff', { method: 'PATCH', headers: { cookie: ownerSession, 'content-type': 'application/json' }, body: JSON.stringify({ userId: accounts.get('TEACHER')!.id }) }); assert.equal(removed.status, 200, await removed.text());
 for (const [path, method] of [['/api/auth/session','GET'], ['/api/marks','POST'], ['/api/chat/conversations','GET'], ['/api/reports/download?reportCardId=unknown','GET'], ['/api/ai/generate-remarks','POST']]) {
 const r = await fetch(base + path, { method, headers: { cookie: c, 'content-type': 'application/json' }, ...(method === 'POST' ? { body: '{}' } : {}) }); assert.ok([401,403].includes(r.status), `${path}: ${r.status} ${await r.text()}`);
 }
});
test('role/campus version change and missing session rows deny prior tokens', async () => {
 const c = cookie(await login('ACCOUNTANT'), 'skoolee_token'); const changed = await fetch(base + '/api/memberships', { method: 'PUT', headers: { cookie: ownerSession, 'content-type': 'application/json' }, body: JSON.stringify({ userId: accounts.get('ACCOUNTANT')!.id, campusId: campusB, role: 'ACCOUNTANT', isActive: true, canPurchaseSubscription: false, canManageMemberships: false, expectedVersion: 0, reviewed: true }) }); assert.equal(changed.status, 200, await changed.text()); assert.equal((await sessionCheck(c)).status, 401);
 const user = accounts.get('LIBRARIAN')!; const token = await new SignJWT({ userId: user.id, schoolId, role: 'LIBRARIAN', accessVersion: 0 }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('1h').sign(new TextEncoder().encode(process.env.AUTH_SECRET)); assert.equal((await sessionCheck(`skoolee_token=${token}`)).status, 401);
});
test('own sessions can be revoked; another user cannot revoke them', async () => {
 const one = cookie(await login('RECEPTIONIST'), 'skoolee_token'), other = cookie(await login('PARENT'), 'skoolee_token');
 const list = await fetch(base + '/api/auth/sessions', { headers: { cookie: one } }).then(r => r.json()); assert.ok(list.sessions.length); assert.equal(list.sessions[0].tokenHash, undefined); const id = list.sessions[0].id;
 const revoke = (c: string) => fetch(base + '/api/auth/sessions', { method: 'DELETE', headers: { cookie: c, 'content-type': 'application/json' }, body: JSON.stringify({ id }) }); assert.equal((await revoke(other)).status, 404); assert.equal((await revoke(one)).status, 200);
 const ended = await raw.loginSession.findUniqueOrThrow({ where: { id } }); assert.equal(ended.isActive, false);
});
test('invitations require reviewed context and one atomic claim; expired context changes cannot activate', async () => {
 const invite = await raw.staffInvitation.create({ data: { schoolId, campusId, email: `${randomUUID()}@example.invalid`, role: 'LIBRARIAN', token: randomUUID(), expiresAt: new Date(Date.now() + 60_000) } });
 await assert.rejects(acceptInvite(invite.token, password, 'Synthetic', 'wrong'), /details changed/);
 const results = await Promise.allSettled([acceptInvite(invite.token, password, 'Synthetic', invitationContext(invite)), acceptInvite(invite.token, password, 'Synthetic', invitationContext(invite))]); assert.equal(results.filter(r => r.status === 'fulfilled').length, 1, JSON.stringify(results)); assert.equal(await raw.user.count({ where: { schoolId, email: invite.email } }), 1);
 const expired = await raw.staffInvitation.create({ data: { schoolId, campusId, email: `${randomUUID()}@example.invalid`, role: 'TEACHER', token: randomUUID(), expiresAt: new Date(0) } });
 await raw.staffInvitation.update({ where: { id: expired.id }, data: { campusId: campusB } }); await assert.rejects(acceptInvite(expired.token, password, 'Synthetic', invitationContext(expired)), /details changed/); assert.equal(await raw.user.count({ where: { email: expired.email } }), 0);
 const r = await post('/api/invite/reissue', { token: expired.token }); assert.equal(r.status, 200); const current = await raw.staffInvitation.findUniqueOrThrow({ where: { id: expired.id } }); assert.notEqual(current.token, expired.token); assert.equal(current.campusId, campusB); assert.equal(await raw.staffInvitation.count({ where: { email: expired.email } }), 1);
});
test('MFA rate limit is shared in persistent store', async () => { const ticket = cookie(await login('PRINCIPAL'), 'skoolee-mfa'); let status = 0; for (let i = 0; i < 11; i++) status = (await mfa(ticket, { action: 'challenge', code: 'bad' })).status; assert.equal(status, 429); assert.ok(await raw.authAttempt.count()); });

test('lost authenticator replacement requires password plus unused second factor and revokes all sessions', async () => {
 await raw.authAttempt.deleteMany({});
 const invalid = await post('/api/auth/mfa/replace', { password, code: 'bad' }, ownerSession); assert.equal(invalid.status, 400);
 const response = await post('/api/auth/mfa/replace', { password, code: recovery[1] }, ownerSession); assert.equal(response.status, 200, await response.clone().text());
 assert.ok(cookie(response, 'skoolee-mfa')); assert.equal((await sessionCheck(ownerSession)).status, 401);
 const user=await raw.user.findUniqueOrThrow({where:{id:accounts.get('SUPER_ADMIN')!.id}}); assert.equal(user.mfaEnabled,false); assert.equal(user.mfaSecret,null); assert.deepEqual(user.recoveryCodeHashes,[]);
});
test('password change revokes previous sessions on the next request', async () => {
 const session = cookie(await login('LIBRARIAN'), 'skoolee_token');
 const response = await fetch(base + '/api/auth/change-password', { method: 'PUT', headers: { cookie: session, 'content-type': 'application/json' }, body: JSON.stringify({ currentPassword: password, newPassword: 'UpdatedSynthetic209!' }) });
 assert.equal(response.status, 200, await response.text()); assert.equal((await sessionCheck(session)).status, 401);
});
test('forced password change rotates to a recorded session and revokes the prior token', async () => {
 await raw.user.update({ where: { id: accounts.get('RECEPTIONIST')!.id }, data: { mustChangePassword: true } });
 const session = cookie(await login('RECEPTIONIST'), 'skoolee_token');
 const response = await fetch(base + '/api/auth/first-password', { method: 'PUT', headers: { cookie: session, 'content-type': 'application/json' }, body: JSON.stringify({ newPassword: 'UpdatedSynthetic209!' }) });
 assert.equal(response.status, 200, await response.clone().text()); assert.equal((await sessionCheck(session)).status, 401); assert.equal((await sessionCheck(cookie(response, 'skoolee_token'))).status, 200);
});
