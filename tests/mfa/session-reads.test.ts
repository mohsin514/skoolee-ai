/**
 * SKAI-1973: the MFA "do it later" and challenge sign-ins reuse the school the ticket check already loaded instead of
 * reading it again in issueSession, still write the login_sessions row and the deferral audit row, and set last_login
 * on the user's own row only (scoped to its school). Real /api/auth/mfa handlers against the in-memory Prisma fake.
 */
import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createFakePrisma } from "./fake-prisma";
import { SCHOOL, loadMfa, newUser, stepAt } from "./harness";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";

Object.assign(process.env, { NODE_ENV: "test", AUTH_SECRET: "mfa-session-reads-secret-0123456789abcdef0123456789", DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused" });
delete process.env.MFA_ENCRYPTION_KEY;
delete process.env.MFA_ENCRYPTION_KEY_PREVIOUS;

const OTHER = { id: "school-2", name: "Second School", slug: "second-school", status: "ACTIVE" };
const fake = createFakePrisma({ schools: [{ ...SCHOOL }, { ...OTHER }] });
(globalThis as { prisma?: unknown }).prisma = fake;
const schoolReads: string[] = [];
const readSchool = fake.school.findUniqueOrThrow;
fake.school.findUniqueOrThrow = async (args) => { schoolReads.push(String(args.where.id)); return readSchool(args); };

let mfa: Awaited<ReturnType<typeof loadMfa>>;
before(async () => { console.warn = () => undefined; mfa = await loadMfa(); });

const row = (id: string) => fake.state.users.find(user => user.id === id)!;
const issued = (cookies: string[]) => cookies.some(cookie => cookie.startsWith(`${SESSION_COOKIE_NAME}=`) && !cookie.startsWith(`${SESSION_COOKIE_NAME}=;`));

describe("MFA sign-in reuses the loaded school", () => {
  it("defer: no second schools read, per school; session, audit row and last_login are written", async () => {
    for (const school of [SCHOOL, OTHER]) {
      const id = `defer-${school.id}`;
      fake.state.users.push(newUser(id, { schoolId: school.id }));
      fake.state.users.push(newUser(`${id}-twin`, { schoolId: school.id === SCHOOL.id ? OTHER.id : SCHOOL.id }));
      schoolReads.length = 0;
      const result = await mfa.call("POST", await mfa.signIn(fake, id), { action: "defer" });
      assert.equal(result.status, 200, JSON.stringify(result.json));
      assert.ok(issued(result.setCookies));
      assert.equal((result.json.user as { schoolName: string }).schoolName, school.name);
      assert.deepEqual(schoolReads, [], "issueSession reused context()'s school");
      assert.equal(fake.state.loginSessions.filter(s => s.userId === id && s.schoolId === school.id).length, 1);
      assert.ok(fake.state.auditLogs.some(a => a.userId === id && (a.newValue as { action?: string }).action === "mfa.setup.deferred"), "deferral stays audited");
      assert.ok(row(id).lastLogin instanceof Date);
      assert.equal(row(`${id}-twin`).lastLogin, null, "only the signed-in user's row is touched");
    }
  });

  it("challenge: no second schools read and the session carries the user's school", async () => {
    const secret = mfa.crypto.newAuthenticatorSecret();
    fake.state.users.push(newUser("enrolled-2", { schoolId: OTHER.id, mfaEnabled: true, mfaSecret: mfa.crypto.protectSecret(secret) }));
    schoolReads.length = 0;
    const result = await mfa.call("POST", await mfa.signIn(fake, "enrolled-2"), { action: "challenge", code: mfa.crypto.totp(secret, stepAt(Date.now())) });
    assert.equal(result.status, 200, JSON.stringify(result.json));
    assert.equal((result.json.user as { schoolName: string }).schoolName, OTHER.name);
    assert.deepEqual(schoolReads, []);
    assert.ok(row("enrolled-2").lastLogin instanceof Date);
  });
});
