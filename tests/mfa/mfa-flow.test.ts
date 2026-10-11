/**
 * Route-level reproduction of "the authenticator code worked the first time,
 * a day later neither the authenticator code nor the recovery codes are
 * accepted".
 *
 * Runs the REAL /api/auth/mfa handlers against an in-memory Prisma fake (no
 * database), with Date mocked so the clock can move forward more than 24 h,
 * and a child process standing in for a server restart (same or a different
 * AUTH_SECRET, nothing loaded from .env).
 */
import { after, afterEach, before, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { format } from "node:util";
import { createFakePrisma, deserializeState, serializeState } from "./fake-prisma";
import { SCHOOL, loadMfa, newUser, stepAt, type CallResult } from "./harness";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";

const AUTH_SECRET = "mfa-test-auth-secret-0123456789abcdef0123456789";
const OTHER_AUTH_SECRET = "mfa-test-other-deployment-secret-9876543210fedcba";
Object.assign(process.env, { NODE_ENV: "test", AUTH_SECRET, DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused" });
delete process.env.MFA_ENCRYPTION_KEY;
delete process.env.MFA_ENCRYPTION_KEY_PREVIOUS;

const fake = createFakePrisma({ schools: [{ ...SCHOOL }] });
(globalThis as { prisma?: unknown }).prisma = fake;

const T0 = Date.UTC(2026, 0, 15, 9, 0, 10);
const HOUR = 3_600_000;
const CHILD = join(__dirname, "restart-child.ts");

let mfa: Awaited<ReturnType<typeof loadMfa>>;
const logs: string[] = [];
/** Every secret, ciphertext, code and hash the tests handle; none may reach a log or audit row. */
const sensitive = new Set<string>();
const originalConsole = { log: console.log, warn: console.warn, error: console.error, info: console.info };

before(async () => {
  for (const level of ["log", "warn", "error", "info"] as const) console[level] = (...args: unknown[]) => { logs.push(format(...args)); };
  mfa = await loadMfa();
});
after(() => Object.assign(console, originalConsole));
beforeEach(() => mock.timers.enable({ apis: ["Date"], now: T0 }));
afterEach(() => mock.timers.reset());

const user = (id: string) => {
  const row = fake.state.users.find(candidate => candidate.id === id);
  if (!row) throw new Error(`no user ${id}`);
  return row as ReturnType<typeof newUser> & { mfaSecret: string | null; mfaPendingSecret: string | null };
};
const sessionsOf = (id: string) => fake.state.loginSessions.filter(session => session.userId === id);
const show = (result: CallResult) => `${result.status} ${JSON.stringify(result.json)}`;

function track(...values: (string | null | undefined)[]) {
  for (const value of values) if (value) sensitive.add(value);
}

/** A 6-digit code for the current step plus `offset` steps. */
function code(secret: string, offset = 0) {
  const value = mfa.crypto.totp(secret, stepAt(Date.now()) + offset);
  track(value);
  return value;
}

/** A 6-digit code that matches no step within ±10 of now. */
function wrongCode(secret: string) {
  const near = new Set(Array.from({ length: 21 }, (_, i) => mfa.crypto.totp(secret, stepAt(Date.now()) + i - 10)));
  for (let n = 0; ; n++) { const candidate = String(n).padStart(6, "0"); if (!near.has(candidate)) return candidate; }
}

function seedEnrolled(id: string) {
  const secret = mfa.crypto.newAuthenticatorSecret();
  const codes = mfa.crypto.newRecoveryCodes();
  const protectedSecret = mfa.crypto.protectSecret(secret);
  const hashes = codes.map(mfa.crypto.recoveryHash);
  track(secret, protectedSecret, ...codes, ...hashes);
  fake.state.users.push(newUser(id, { mfaEnabled: true, mfaSecret: protectedSecret, recoveryCodeHashes: hashes }));
  return { secret, codes };
}

async function challenge(id: string, body: Record<string, unknown>) {
  return mfa.call("POST", await mfa.signIn(fake, id), { action: "challenge", ...body });
}

function issuedSession(result: CallResult) {
  return result.setCookies.some(cookie => cookie.startsWith(`${SESSION_COOKIE_NAME}=`) && !cookie.startsWith(`${SESSION_COOKIE_NAME}=;`));
}

type ChildStep = { op: "signIn" } | { op: "get" } | { op: "post"; body: unknown } | { op: "tick"; ms: number };

/** Simulates a server restart: a fresh process with only the given environment, sharing the stored state. */
function restart(userId: string, steps: ChildStep[], authSecret = AUTH_SECRET): CallResult[] {
  const child = spawnSync(process.execPath, ["--import", "tsx", CHILD], {
    cwd: process.cwd(),
    input: JSON.stringify({ state: serializeState(fake.state), now: Date.now(), userId, steps }),
    env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, NODE_ENV: "test", AUTH_SECRET: authSecret },
    encoding: "utf8",
    timeout: 60_000,
  });
  assert.equal(child.status, 0, `restart child failed: ${child.stderr}`);
  const out = JSON.parse(child.stdout.trim().split("\n").pop()!) as { results: CallResult[]; state: string; logs: string[] };
  Object.assign(fake.state, deserializeState(out.state));
  logs.push(...out.logs);
  return out.results;
}

describe("MFA sign-in across days, restarts and deployments", () => {
  it("(a) enrol, then TOTP after +25 h and a restart, single-use recovery code, replay rejected", async () => {
    const id = "user-a";
    fake.state.users.push(newUser(id));
    const cookie = await mfa.signIn(fake, id);
    const setup = await mfa.call("POST", cookie, { action: "setup" });
    assert.equal(setup.status, 200, show(setup));
    const secret = setup.json.secret as string;
    track(secret, user(id).mfaPendingSecret);
    const verify = await mfa.call("POST", cookie, { action: "verify-setup", code: code(secret) });
    assert.equal(verify.status, 200, show(verify));
    const codes = verify.json.recoveryCodes as string[];
    assert.equal(codes.length, 10);
    track(...codes, ...codes.map(mfa.crypto.recoveryHash));
    const ack = await mfa.call("POST", cookie, { action: "acknowledge", acknowledged: true });
    assert.equal(ack.status, 200, show(ack));
    assert.ok(issuedSession(ack));
    assert.equal(user(id).mfaEnabled, true);

    mock.timers.tick(30_000);
    const immediate = await challenge(id, { code: code(secret) });
    assert.equal(immediate.status, 200, show(immediate));

    mock.timers.tick(25 * HOUR);
    const versionBefore = user(id).accessVersion;
    const totpStep = stepAt(Date.now());
    const totpCode = code(secret);
    const [totpResult, recovery, recoveryReuse, replay] = restart(id, [
      { op: "signIn" }, { op: "post", body: { action: "challenge", code: totpCode } },
      { op: "signIn" }, { op: "post", body: { action: "challenge", code: codes[0], recovery: true } },
      { op: "signIn" }, { op: "post", body: { action: "challenge", code: codes[0], recovery: true } },
      { op: "signIn" }, { op: "post", body: { action: "challenge", code: totpCode } },
    ]);
    assert.equal(totpResult.status, 200, `TOTP after +25 h and restart: ${show(totpResult)}`);
    assert.ok(issuedSession(totpResult));
    assert.equal(recovery.status, 200, `unused recovery code: ${show(recovery)}`);
    assert.ok(issuedSession(recovery));
    assert.equal(user(id).accessVersion, versionBefore + 1, "recovery use bumps accessVersion");
    assert.equal(user(id).recoveryCodeHashes.length, 9, "recovery code consumed");
    const sessions = sessionsOf(id);
    assert.equal(sessions.length, 4);
    assert.ok(sessions.slice(0, 3).every(session => session.isActive === false), "sessions before recovery use are revoked");
    assert.equal(sessions[3].isActive, true, "the recovery sign-in's own session is live");
    assert.ok(recoveryReuse.status >= 400 && recoveryReuse.status < 500, `recovery reuse rejected: ${show(recoveryReuse)}`);
    assert.ok(!issuedSession(recoveryReuse));
    assert.ok(replay.status >= 400 && replay.status < 500, `TOTP replay rejected: ${show(replay)}`);
    assert.ok(!issuedSession(replay));
    assert.equal(user(id).mfaLastStep, totpStep);
  });

  it("(b) a recovery code typed into the default field (recovery:false) is accepted after +25 h", async () => {
    const id = "user-b";
    const { codes } = seedEnrolled(id);
    mock.timers.tick(25 * HOUR);
    const typed = await challenge(id, { code: codes[0], recovery: false });
    assert.equal(typed.status, 200, show(typed));
    assert.equal(user(id).recoveryCodeHashes.length, 9);
    assert.equal(user(id).accessVersion, 1);
    const loose = await challenge(id, { code: codes[1].replace(/-/g, "").toLowerCase() });
    assert.equal(loose.status, 200, `lower-case, no dashes: ${show(loose)}`);
    assert.equal(user(id).recoveryCodeHashes.length, 8);
  });

  it("(c) a TOTP code with a space, as authenticator apps display it, is accepted", async () => {
    const id = "user-c";
    const { secret } = seedEnrolled(id);
    mock.timers.tick(25 * HOUR);
    const value = code(secret);
    const spaced = await challenge(id, { code: `${value.slice(0, 3)} ${value.slice(3)}` });
    assert.equal(spaced.status, 200, show(spaced));
    assert.equal(user(id).mfaLastStep, stepAt(Date.now()));
  });

  it("(d) verified but unacknowledged enrolment can be finished on a later sign-in with the authenticator", async () => {
    const id = "user-d";
    fake.state.users.push(newUser(id));
    const cookie = await mfa.signIn(fake, id);
    const setup = await mfa.call("POST", cookie, { action: "setup" });
    const secret = setup.json.secret as string;
    const verify = await mfa.call("POST", cookie, { action: "verify-setup", code: code(secret) });
    assert.equal(verify.status, 200, show(verify));
    const pendingSecret = user(id).mfaPendingSecret;
    track(secret, pendingSecret, ...(verify.json.recoveryCodes as string[]));

    mock.timers.tick(25 * HOUR);
    const next = await mfa.signIn(fake, id);
    const status = await mfa.call("GET", next);
    assert.equal(status.status, 200, show(status));
    assert.equal(status.json.enrolled, false);
    assert.equal(status.json.resumeChallenge, true, `GET must report a challengeable state: ${show(status)}`);
    const resumed = await mfa.call("POST", next, { action: "challenge", code: code(secret) });
    assert.equal(resumed.status, 200, show(resumed));
    assert.ok(issuedSession(resumed));
    const row = user(id);
    assert.equal(row.mfaEnabled, true);
    assert.equal(row.mfaSecret, pendingSecret);
    assert.equal(row.mfaPendingSecret, null);
    assert.equal(row.mfaPendingVerified, false);
    assert.equal(row.recoveryCodeHashes.length, 10, "the recovery codes the user saved stay valid");
  });

  it("(d) verified but unacknowledged enrolment can be finished with a saved recovery code", async () => {
    const id = "user-d2";
    fake.state.users.push(newUser(id));
    const cookie = await mfa.signIn(fake, id);
    const setup = await mfa.call("POST", cookie, { action: "setup" });
    const secret = setup.json.secret as string;
    const verify = await mfa.call("POST", cookie, { action: "verify-setup", code: code(secret) });
    const codes = verify.json.recoveryCodes as string[];
    track(secret, user(id).mfaPendingSecret, ...codes);

    mock.timers.tick(25 * HOUR);
    const resumed = await challenge(id, { code: codes[3] });
    assert.equal(resumed.status, 200, show(resumed));
    const row = user(id);
    assert.equal(row.mfaEnabled, true);
    assert.equal(row.recoveryCodeHashes.length, 9);
    assert.equal(row.accessVersion, 1, "recovery use bumps accessVersion");
    assert.ok(sessionsOf(id).slice(0, -1).every(session => session.isActive === false));
  });

  it("(e) a deployment with a different AUTH_SECRET returns secret_unavailable (not 500) and recovery codes still work", async () => {
    const id = "user-e";
    const { secret, codes } = seedEnrolled(id);
    mock.timers.tick(25 * HOUR);
    const auditBefore = fake.state.auditLogs.length;
    const [totpResult, recovery] = restart(id, [
      { op: "signIn" }, { op: "post", body: { action: "challenge", code: code(secret) } },
      { op: "signIn" }, { op: "post", body: { action: "challenge", code: codes[0], recovery: true } },
    ], OTHER_AUTH_SECRET);
    assert.equal(totpResult.status, 400, show(totpResult));
    assert.equal(totpResult.json.reason, "secret_unavailable");
    assert.ok(typeof totpResult.json.error === "string" && !String(totpResult.json.error).includes("[auth/mfa]"));
    assert.ok(fake.state.auditLogs.slice(auditBefore).some(row => (row.newValue as { reason?: string }).reason === "secret_unavailable"));
    assert.equal(recovery.status, 200, show(recovery));
    assert.equal(user(id).recoveryCodeHashes.length, 9);
  });

  describe("(f) every rejection carries a reason", () => {
    it("wrong code → 400 invalid_code", async () => {
      const id = "user-f-wrong";
      const { secret } = seedEnrolled(id);
      const result = await challenge(id, { code: wrongCode(secret) });
      assert.equal(result.status, 400, show(result));
      assert.equal(result.json.reason, "invalid_code");
      assert.equal(user(id).mfaLastStep, -1);
    });

    it("code 5 steps behind → 400 clock_skew and not accepted", async () => {
      const id = "user-f-skew5";
      const { secret } = seedEnrolled(id);
      const result = await challenge(id, { code: code(secret, -5) });
      assert.equal(result.status, 400, show(result));
      assert.equal(result.json.reason, "clock_skew");
      assert.ok(!issuedSession(result));
      assert.equal(user(id).mfaLastStep, -1);
      assert.equal(sessionsOf(id).length, 0);
    });

    it("a future-step code (+2..+10) is indistinguishable from a wrong code, so a guess is never disclosed", async () => {
      const id = "user-f-future";
      const { secret } = seedEnrolled(id);
      const wrong = await challenge(id, { code: wrongCode(secret) });
      assert.equal(wrong.status, 400, show(wrong));
      assert.equal(wrong.json.reason, "invalid_code");
      for (const offset of [2, 3, 5, 10]) {
        const result = await challenge(id, { code: code(secret, offset) });
        assert.equal(result.status, wrong.status, `+${offset}: ${show(result)}`);
        assert.deepEqual(result.json, wrong.json, `+${offset} must look exactly like a wrong code`);
        assert.ok(!issuedSession(result));
      }
      assert.equal(user(id).mfaLastStep, -1);
      assert.equal(sessionsOf(id).length, 0);
      const audits = fake.state.auditLogs.filter(row => row.userId === id);
      assert.ok(audits.length >= 5, "each rejection is audited");
      assert.ok(audits.every(row => (row.newValue as { reason?: string }).reason !== "clock_skew"), "no clock_skew recorded for future steps");
    });

    it("±1 step is accepted, -2 is rejected as clock_skew and +2 as invalid_code", async () => {
      const behind = "user-f-minus1";
      const ahead = "user-f-plus1";
      const behindSecret = seedEnrolled(behind).secret;
      const aheadSecret = seedEnrolled(ahead).secret;
      const minusOne = await challenge(behind, { code: code(behindSecret, -1) });
      assert.equal(minusOne.status, 200, show(minusOne));
      const plusOne = await challenge(ahead, { code: code(aheadSecret, 1) });
      assert.equal(plusOne.status, 200, show(plusOne));

      const id = "user-f-skew2";
      const { secret } = seedEnrolled(id);
      for (const [offset, reason] of [[2, "invalid_code"], [-2, "clock_skew"]] as const) {
        const result = await challenge(id, { code: code(secret, offset) });
        assert.equal(result.status, 400, `${offset}: ${show(result)}`);
        assert.equal(result.json.reason, reason);
      }
      assert.equal(user(id).mfaLastStep, -1);
    });

    it("replaying an accepted step → 409 code_reused", async () => {
      const id = "user-f-replay";
      const { secret } = seedEnrolled(id);
      const value = code(secret);
      assert.equal((await challenge(id, { code: value })).status, 200);
      const replay = await challenge(id, { code: value });
      assert.equal(replay.status, 409, show(replay));
      assert.equal(replay.json.reason, "code_reused");
    });

    it("garbage or expired ticket → 401 session_expired", async () => {
      const id = "user-f-ticket";
      const { secret } = seedEnrolled(id);
      for (const method of ["GET", "POST"] as const) {
        const result = await mfa.call(method, "skoolee-mfa=garbage", method === "POST" ? { action: "challenge", code: "123456" } : undefined);
        assert.equal(result.status, 401, `${method}: ${show(result)}`);
        assert.equal(result.json.reason, "session_expired");
      }
      const cookie = await mfa.signIn(fake, id);
      mock.timers.tick(11 * 60_000);
      const expired = await mfa.call("POST", cookie, { action: "challenge", code: code(secret) });
      assert.equal(expired.status, 401, show(expired));
      assert.equal(expired.json.reason, "session_expired");
    });

    it("unknown or already-used recovery code → 400 recovery_invalid", async () => {
      const id = "user-f-recovery";
      const { codes } = seedEnrolled(id);
      for (const body of [{ code: "ABCD-ABCD-ABCD-ABCD-ABCD", recovery: true }, { code: "abcdabcdabcdabcdabcd" }]) {
        const result = await challenge(id, body);
        assert.equal(result.status, 400, show(result));
        assert.equal(result.json.reason, "recovery_invalid");
      }
      assert.equal((await challenge(id, { code: codes[0], recovery: true })).status, 200);
      const reused = await challenge(id, { code: codes[0], recovery: true });
      assert.equal(reused.status, 400, show(reused));
      assert.equal(reused.json.reason, "recovery_invalid");
    });

    it("too many attempts → 429 rate_limited", async () => {
      const id = "user-f-rate";
      const { secret } = seedEnrolled(id);
      const wrong = wrongCode(secret);
      let last: CallResult | undefined;
      for (let attempt = 0; attempt < 11; attempt++) last = await challenge(id, { code: wrong });
      assert.equal(last!.status, 429, show(last!));
      assert.equal(last!.json.reason, "rate_limited");
    });

    it("no log line or audit row contains a code, secret or hash", () => {
      assert.ok(sensitive.size > 20, "the suite tracked the values it handled");
      const audits = fake.state.auditLogs.map(row => JSON.stringify(row.newValue));
      for (const line of [...logs, ...audits]) {
        for (const value of sensitive) assert.ok(!line.includes(value), `sensitive value leaked into: ${line.slice(0, 120)}`);
      }
      for (const row of fake.state.auditLogs) assert.deepEqual(Object.keys(row.newValue as object).sort().filter(key => !["action", "reason", "sessionsRevoked"].includes(key)), []);
    });
  });
});
