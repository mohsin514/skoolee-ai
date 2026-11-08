/**
 * Settings → Security core (src/lib/auth/mfa-manage.ts) against the in-memory
 * Prisma fake, with the REAL /api/auth/mfa sign-in route used to prove which
 * factors still sign in after each step. Date is mocked so the clock can move
 * +25 h / +7 d. Covers design AC11–15 and AC17–19.
 */
import { after, afterEach, before, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { format } from "node:util";
import bcrypt from "bcryptjs";
import type { User } from "@prisma/client";
import { createFakePrisma } from "./fake-prisma";
import { SCHOOL, loadMfa, newUser, stepAt, type CallResult } from "./harness";

const AUTH_SECRET = "mfa-manage-test-auth-secret-0123456789abcdef01234";
Object.assign(process.env, { NODE_ENV: "test", AUTH_SECRET, DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused" });
delete process.env.MFA_ENCRYPTION_KEY;
delete process.env.MFA_ENCRYPTION_KEY_PREVIOUS;

const fake = createFakePrisma({ schools: [{ ...SCHOOL }] });
(globalThis as { prisma?: unknown }).prisma = fake;

const T0 = Date.UTC(2026, 1, 3, 10, 0, 5);
const HOUR = 3_600_000;
const PASSWORD = "Manage-test-password-1";
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);

let mfa: Awaited<ReturnType<typeof loadMfa>>;
let core: typeof import("@/lib/auth/mfa-manage");
let failures: typeof import("@/lib/auth/mfa-failure");
const logs: string[] = [];
const sensitive = new Set<string>();
const originalConsole = { log: console.log, warn: console.warn, error: console.error, info: console.info };

before(async () => {
  for (const level of ["log", "warn", "error", "info"] as const) console[level] = (...args: unknown[]) => { logs.push(format(...args)); };
  mfa = await loadMfa();
  core = await import("@/lib/auth/mfa-manage");
  failures = await import("@/lib/auth/mfa-failure");
});
after(() => Object.assign(console, originalConsole));
beforeEach(() => mock.timers.enable({ apis: ["Date"], now: T0 }));
afterEach(() => mock.timers.reset());

type StoredMfa = { mfaSecret: string | null; mfaPendingSecret: string | null; mfaPendingTicket: string | null; mfaEnrolledAt: Date | null };
const deps = () => ({ db: fake as never, now: () => new Date(), compare: bcrypt.compare });
const row = (id: string) => {
  const found = fake.state.users.find(candidate => candidate.id === id);
  if (!found) throw new Error(`no user ${id}`);
  return found as Omit<ReturnType<typeof newUser>, keyof StoredMfa> & StoredMfa;
};
/** A fresh read, as the route does at the start of every request. */
const read = (id: string) => structuredClone(row(id)) as unknown as User;
const show = (result: CallResult) => `${result.status} ${JSON.stringify(result.json)}`;
const auditsOf = (id: string) => fake.state.auditLogs.filter(entry => entry.userId === id).map(entry => entry.newValue as { action: string; reason?: string });

function track(...values: (string | null | undefined)[]) {
  for (const value of values) if (value) sensitive.add(value);
}
function code(secret: string, offset = 0) {
  const value = mfa.crypto.totp(secret, stepAt(Date.now()) + offset);
  track(value);
  return value;
}
function wrongCode(secret: string) {
  const near = new Set(Array.from({ length: 21 }, (_, i) => mfa.crypto.totp(secret, stepAt(Date.now()) + i - 10)));
  for (let n = 0; ; n++) { const candidate = String(n).padStart(6, "0"); if (!near.has(candidate)) return candidate; }
}
function assertEnabled(id: string, step: string) {
  assert.equal(row(id).mfaEnabled, true, `mfaEnabled must stay true: ${step}`);
}

function seedEnrolled(id: string, overrides: Record<string, unknown> = {}) {
  const secret = mfa.crypto.newAuthenticatorSecret();
  const codes = mfa.crypto.newRecoveryCodes();
  const protectedSecret = mfa.crypto.protectSecret(secret);
  const hashes = codes.map(mfa.crypto.recoveryHash);
  track(secret, protectedSecret, ...codes, ...hashes);
  fake.state.users.push(newUser(id, { password: PASSWORD_HASH, mfaEnabled: true, mfaSecret: protectedSecret, recoveryCodeHashes: hashes, ...overrides }));
  return { secret, codes };
}
function seedOptional(id: string) {
  fake.state.users.push(newUser(id, { role: "TEACHER", isInstitutionOwner: false, password: PASSWORD_HASH }));
}

async function signIn(id: string, body: Record<string, unknown>) {
  return mfa.call("POST", await mfa.signIn(fake, id), { action: "challenge", ...body });
}

/** Expects the core call to fail with `reason`; returns nothing so the caller can't use a partial result. */
async function rejects(promise: Promise<unknown>, reason: string) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof failures.MfaFailure, `expected MfaFailure, got ${String(error)}`);
    assert.equal(error.reason, reason);
    return true;
  });
}

/** begin → confirm with the new app's code, tracking every secret it handles. */
async function swap(id: string, input: { mode: "change" | "enable"; password: string; code?: string; recovery?: boolean }) {
  const before = read(id);
  const started = await core.beginChange(before, input, deps());
  track(started.secret, row(id).mfaPendingSecret as string);
  const grant = { userId: id, schoolId: SCHOOL.id, accessVersion: before.accessVersion, nonce: started.nonce, mode: input.mode };
  const confirmed = await core.confirmChange(read(id), grant, code(started.secret), deps());
  track(...confirmed.recoveryCodes, ...confirmed.recoveryCodes.map(mfa.crypto.recoveryHash), row(id).mfaSecret as string);
  return { started, confirmed, grant };
}

describe("change authenticator in place", () => {
  it("AC11: old factor works until confirm, then only the new one; mfaEnabled never false", async () => {
    const id = "manage-ac11";
    const old = seedEnrolled(id);
    fake.state.loginSessions.push({ id: "s-ac11", userId: id, schoolId: SCHOOL.id, tokenHash: "h", isActive: true, loginAt: new Date(), expiresAt: new Date(Date.now() + 7 * 24 * HOUR) });
    assertEnabled(id, "seeded");

    const before = read(id);
    const started = await core.beginChange(before, { mode: "change", password: PASSWORD, code: code(old.secret) }, deps());
    track(started.secret, row(id).mfaPendingSecret as string);
    assertEnabled(id, "after begin");
    assert.equal(row(id).mfaPendingTicket, started.nonce);
    assert.equal(row(id).accessVersion, before.accessVersion, "begin does not touch accessVersion");
    assert.ok(started.uri.startsWith("otpauth://totp/Skoolee%3Amanage-ac11%40example.test?secret="));

    mock.timers.tick(30_000);
    const stillOld = await signIn(id, { code: code(old.secret) });
    assert.equal(stillOld.status, 200, `old TOTP still signs in before confirm: ${show(stillOld)}`);
    assertEnabled(id, "after sign-in with old factor");

    const grant = { userId: id, schoolId: SCHOOL.id, accessVersion: before.accessVersion, nonce: started.nonce, mode: "change" as const };
    const lastStepBefore = row(id).mfaLastStep;
    const confirmed = await core.confirmChange(read(id), grant, code(started.secret), deps());
    track(...confirmed.recoveryCodes, ...confirmed.recoveryCodes.map(mfa.crypto.recoveryHash));
    assertEnabled(id, "after confirm");
    const after = row(id);
    assert.equal(confirmed.recoveryCodes.length, 10);
    assert.equal(after.accessVersion, before.accessVersion + 1);
    assert.equal(after.mfaPendingSecret, null);
    assert.equal(after.mfaPendingTicket, null);
    assert.ok(after.mfaEnrolledAt instanceof Date && (after.mfaEnrolledAt as Date).getTime() === Date.now());
    assert.equal(after.mfaLastStep, Math.max(lastStepBefore, stepAt(Date.now())), "replay floor is monotonic");
    assert.equal(mfa.crypto.revealSecret(after.mfaSecret as string), started.secret);
    assert.ok(fake.state.loginSessions.filter(session => session.userId === id).every(session => session.isActive === false), "every session revoked");
    assert.equal(confirmed.user.accessVersion, after.accessVersion, "returns the re-read user");

    mock.timers.tick(30_000);
    const oldTotp = await signIn(id, { code: code(old.secret) });
    assert.equal(oldTotp.json.reason, "invalid_code", `old TOTP rejected: ${show(oldTotp)}`);
    const oldRecovery = await signIn(id, { code: old.codes[5], recovery: true });
    assert.equal(oldRecovery.json.reason, "recovery_invalid", `old recovery code rejected: ${show(oldRecovery)}`);
    const newTotp = await signIn(id, { code: code(started.secret) });
    assert.equal(newTotp.status, 200, `new TOTP accepted: ${show(newTotp)}`);
    const newRecovery = await signIn(id, { code: confirmed.recoveryCodes[0], recovery: true });
    assert.equal(newRecovery.status, 200, `new recovery code accepted: ${show(newRecovery)}`);
    assertEnabled(id, "after sign-ins with the new factor");
    assert.deepEqual(auditsOf(id).filter(entry => entry.action.startsWith("mfa.change") || entry.action === "mfa.authenticator.changed").map(entry => entry.action), ["mfa.change.started", "mfa.authenticator.changed"]);
  });

  it("AC12: two concurrent confirms of one pending change → exactly one succeeds", async () => {
    const id = "manage-ac12";
    const old = seedEnrolled(id);
    const before = read(id);
    const started = await core.beginChange(before, { mode: "change", password: PASSWORD, code: code(old.secret) }, deps());
    track(started.secret);
    const grant = { userId: id, schoolId: SCHOOL.id, accessVersion: before.accessVersion, nonce: started.nonce, mode: "change" as const };
    const snapshot = read(id);
    const results = await Promise.allSettled([
      core.confirmChange(snapshot, grant, code(started.secret), deps()),
      core.confirmChange(snapshot, grant, code(started.secret), deps()),
    ]);
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    const loser = results.find(result => result.status === "rejected") as PromiseRejectedResult;
    assert.ok(["state_changed", "setup_expired"].includes((loser.reason as InstanceType<typeof failures.MfaFailure>).reason));
    for (const result of results) if (result.status === "fulfilled") track(...result.value.recoveryCodes);
    assert.equal(row(id).accessVersion, before.accessVersion + 1, "only one swap committed");
    assertEnabled(id, "after concurrent confirms");
    // A later read with the stale grant is refused too.
    await rejects(core.confirmChange(read(id), grant, code(started.secret, 1), deps()), "state_changed");
  });

  it("a second begin in another tab supersedes the first: the earlier grant → setup_expired", async () => {
    const id = "manage-two-tabs";
    const old = seedEnrolled(id);
    const first = await core.beginChange(read(id), { mode: "change", password: PASSWORD, code: code(old.secret) }, deps());
    mock.timers.tick(30_000);
    const second = await core.beginChange(read(id), { mode: "change", password: PASSWORD, code: code(old.secret) }, deps());
    track(first.secret, second.secret);
    const grant = { userId: id, schoolId: SCHOOL.id, accessVersion: 0, nonce: first.nonce, mode: "change" as const };
    await rejects(core.confirmChange(read(id), grant, code(first.secret), deps()), "setup_expired");
    assertEnabled(id, "after superseded confirm");
  });

  it("a pending change expires after 10 minutes and cancel clears it idempotently", async () => {
    const id = "manage-expire";
    const old = seedEnrolled(id);
    const started = await core.beginChange(read(id), { mode: "change", password: PASSWORD, code: code(old.secret) }, deps());
    track(started.secret);
    const grant = { userId: id, schoolId: SCHOOL.id, accessVersion: 0, nonce: started.nonce, mode: "change" as const };
    mock.timers.tick(11 * 60_000);
    await rejects(core.confirmChange(read(id), grant, code(started.secret), deps()), "setup_expired");
    await core.cancelChange(read(id), grant, deps());
    assert.equal(row(id).mfaPendingSecret, null);
    assert.equal(row(id).mfaPendingTicket, null);
    await core.cancelChange(read(id), grant, deps());
    assertEnabled(id, "after cancel");
    assert.equal(mfa.crypto.revealSecret(row(id).mfaSecret as string), old.secret, "cancel leaves the current authenticator alone");
  });
});

describe("re-authentication", () => {
  it("AC13: a recovery code used at re-auth is consumed; a TOTP used at re-auth can't be replayed at sign-in", async () => {
    const id = "manage-ac13";
    const old = seedEnrolled(id);
    const started = await core.beginChange(read(id), { mode: "change", password: PASSWORD, code: old.codes[2], recovery: true }, deps());
    track(started.secret);
    assert.equal(row(id).recoveryCodeHashes.length, 9);
    assertEnabled(id, "after recovery-code begin");
    const reuseAtSignIn = await signIn(id, { code: old.codes[2], recovery: true });
    assert.equal(reuseAtSignIn.json.reason, "recovery_invalid", show(reuseAtSignIn));
    await rejects(core.beginChange(read(id), { mode: "change", password: PASSWORD, code: old.codes[2] }, deps()), "recovery_invalid");

    const totpAtReauth = code(old.secret);
    await core.beginChange(read(id), { mode: "change", password: PASSWORD, code: totpAtReauth }, deps());
    assert.equal(row(id).mfaLastStep, stepAt(Date.now()));
    const replay = await signIn(id, { code: totpAtReauth });
    assert.equal(replay.status, 409, show(replay));
    assert.equal(replay.json.reason, "code_reused");
  });

  it("AC17: password first, then the code; past skew → clock_skew; future +2..+10 → invalid_code", async () => {
    const id = "manage-ac17";
    const old = seedEnrolled(id);
    const auditStart = auditsOf(id).length;

    await rejects(core.beginChange(read(id), { mode: "change", password: "wrong", code: code(old.secret) }, deps()), "password_invalid");
    await rejects(core.beginChange(read(id), { mode: "change", password: "wrong", code: old.codes[0], recovery: true }, deps()), "password_invalid");
    await rejects(core.disableMfa(read(id), { password: "wrong", code: old.codes[0] }, deps()), "mfa_required");
    assert.equal(row(id).mfaLastStep, -1, "wrong password evaluates no code");
    assert.equal(row(id).recoveryCodeHashes.length, 10, "wrong password consumes no recovery code");

    await rejects(core.beginChange(read(id), { mode: "change", password: PASSWORD, code: wrongCode(old.secret) }, deps()), "invalid_code");
    await rejects(core.beginChange(read(id), { mode: "change", password: PASSWORD, code: code(old.secret, -5) }, deps()), "clock_skew");
    for (const offset of [2, 3, 5, 10]) {
      await rejects(core.beginChange(read(id), { mode: "change", password: PASSWORD, code: code(old.secret, offset) }, deps()), "invalid_code");
    }
    await rejects(core.regenerateCodes(read(id), { password: PASSWORD, code: code(old.secret, 4) }, deps()), "invalid_code");
    assert.equal(row(id).mfaLastStep, -1);
    assertEnabled(id, "after rejected re-auth attempts");

    const audits = auditsOf(id).slice(auditStart);
    assert.deepEqual(audits.map(entry => entry.reason), ["password_invalid", "password_invalid", "mfa_required", "invalid_code", "clock_skew", "invalid_code", "invalid_code", "invalid_code", "invalid_code", "invalid_code"]);
    assert.deepEqual([...new Set(audits.map(entry => entry.action))], ["mfa.change.failed", "mfa.disable.refused", "mfa.regenerate.failed"]);
  });

  it("confirm with a skewed or wrong new-app code is audited by mode and leaves the old factor live", async () => {
    const id = "manage-confirm-skew";
    const old = seedEnrolled(id);
    const started = await core.beginChange(read(id), { mode: "change", password: PASSWORD, code: code(old.secret) }, deps());
    track(started.secret);
    const grant = { userId: id, schoolId: SCHOOL.id, accessVersion: 0, nonce: started.nonce, mode: "change" as const };
    await rejects(core.confirmChange(read(id), grant, code(started.secret, -4), deps()), "clock_skew");
    await rejects(core.confirmChange(read(id), grant, code(started.secret, 6), deps()), "invalid_code");
    assert.deepEqual(auditsOf(id).slice(-2), [{ action: "mfa.change.failed", reason: "clock_skew" }, { action: "mfa.change.failed", reason: "invalid_code" }]);
    assertEnabled(id, "after failed confirms");
    assert.equal(mfa.crypto.revealSecret(row(id).mfaSecret as string), old.secret);
  });

  it("an unreadable secret → secret_unavailable; a recovery code still re-authenticates the swap", async () => {
    const id = "manage-unreadable";
    const { codes } = seedEnrolled(id, { mfaSecret: "QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVowMTIzNDU2Nzg5" });
    assert.equal(core.mfaStatus(read(id)).authenticatorReadable, false);
    await rejects(core.beginChange(read(id), { mode: "change", password: PASSWORD, code: "123456" }, deps()), "secret_unavailable");
    assert.deepEqual(auditsOf(id).at(-1), { action: "mfa.secret.unavailable", reason: "secret_unavailable" });
    const { confirmed } = await swap(id, { mode: "change", password: PASSWORD, code: codes[0] });
    assert.equal(confirmed.recoveryCodes.length, 10);
    assert.equal(core.mfaStatus(read(id)).authenticatorReadable, true, "the swap re-encrypts under this deployment's key");
    assertEnabled(id, "after recovering an unreadable authenticator");
  });
});

describe("regenerate, enable, disable", () => {
  it("AC14 + AC19: regenerate replaces codes atomically (TOTP only); new codes work after +25 h", async () => {
    const id = "manage-ac14";
    const old = seedEnrolled(id);
    await rejects(core.regenerateCodes(read(id), { password: PASSWORD, code: old.codes[0] }, deps()), "invalid_code");
    assert.equal(row(id).recoveryCodeHashes.length, 10, "a recovery code is not accepted for regenerate and is not consumed");
    const versionBefore = row(id).accessVersion;
    const { recoveryCodes } = await core.regenerateCodes(read(id), { password: PASSWORD, code: code(old.secret) }, deps());
    track(...recoveryCodes, ...recoveryCodes.map(mfa.crypto.recoveryHash));
    assert.equal(recoveryCodes.length, 10);
    assert.equal(row(id).accessVersion, versionBefore, "sessions and accessVersion untouched");
    assertEnabled(id, "after regenerate");
    assert.equal(core.mfaStatus(read(id)).recoveryCodesRemaining, 10);
    assert.ok(!JSON.stringify(core.mfaStatus(read(id))).includes(recoveryCodes[0]), "status shows only the count");

    mock.timers.tick(25 * HOUR);
    const oldCode = await signIn(id, { code: old.codes[1], recovery: true });
    assert.equal(oldCode.json.reason, "recovery_invalid", show(oldCode));
    const newCode = await signIn(id, { code: recoveryCodes[1], recovery: true });
    assert.equal(newCode.status, 200, show(newCode));
    assert.equal(auditsOf(id).filter(entry => entry.action === "mfa.recovery.regenerated").length, 1);
  });

  it("AC19: after a swap, the new TOTP signs in at +25 h and a new recovery code at +7 d", async () => {
    const id = "manage-ac19";
    const old = seedEnrolled(id);
    const { started, confirmed } = await swap(id, { mode: "change", password: PASSWORD, code: code(old.secret) });
    mock.timers.tick(25 * HOUR);
    const day = await signIn(id, { code: code(started.secret) });
    assert.equal(day.status, 200, `+25 h: ${show(day)}`);
    mock.timers.tick(6 * 24 * HOUR);
    const week = await signIn(id, { code: confirmed.recoveryCodes[3], recovery: true });
    assert.equal(week.status, 200, `+7 d: ${show(week)}`);
    mock.timers.tick(30_000);
    const weekTotp = await signIn(id, { code: code(started.secret) });
    assert.equal(weekTotp.status, 200, `+7 d TOTP: ${show(weekTotp)}`);
    assertEnabled(id, "a week after the swap");
  });

  it("AC15/AC16: an optional user turns 2FA on (password only), then off; mandatory users are refused", async () => {
    const id = "manage-optional";
    seedOptional(id);
    assert.equal(mfa.crypto.needsMfaChallenge(row(id)), false);
    await rejects(core.beginChange(read(id), { mode: "change", password: PASSWORD, code: "123456" }, deps()), "invalid_request");
    const { started, confirmed } = await swap(id, { mode: "enable", password: PASSWORD });
    assert.equal(row(id).mfaEnabled, true);
    assert.equal(row(id).accessVersion, 1, "enable bumps accessVersion so unverified sessions end");
    assert.equal(mfa.crypto.needsMfaChallenge(row(id)), true, "next sign-in requires the code");
    assert.equal(confirmed.recoveryCodes.length, 10);
    assert.deepEqual(auditsOf(id).map(entry => entry.action), ["mfa.enable.started", "mfa.enabled"]);
    await rejects(core.beginChange(read(id), { mode: "enable", password: PASSWORD }, deps()), "invalid_request");

    fake.state.loginSessions.push({ id: "s-optional", userId: id, schoolId: SCHOOL.id, tokenHash: "h2", isActive: true, loginAt: new Date(), expiresAt: new Date(Date.now() + 7 * 24 * HOUR) });
    mock.timers.tick(30_000);
    await rejects(core.disableMfa(read(id), { password: PASSWORD, code: wrongCode(started.secret) }, deps()), "invalid_code");
    const { user: after } = await core.disableMfa(read(id), { password: PASSWORD, code: code(started.secret) }, deps());
    const stored = row(id);
    assert.equal(stored.mfaEnabled, false);
    assert.equal(stored.mfaSecret, null);
    assert.equal(stored.mfaLastStep, -1);
    assert.deepEqual(stored.recoveryCodeHashes, []);
    assert.equal(stored.mfaEnrolledAt, null);
    assert.equal(stored.accessVersion, 2);
    assert.equal(after.accessVersion, 2);
    assert.ok(fake.state.loginSessions.filter(session => session.userId === id).every(session => session.isActive === false), "other sessions revoked");
    assert.equal(mfa.crypto.needsMfaChallenge(stored), false, "next sign-in has no MFA step");
    assert.deepEqual(auditsOf(id).slice(-2), [{ action: "mfa.disable.failed", reason: "invalid_code" }, { action: "mfa.disabled" }]);
    await rejects(core.disableMfa(read(id), { password: PASSWORD, code: "123456" }, deps()), "invalid_request");
  });

  it("an optional user can turn 2FA off with a recovery code", async () => {
    const id = "manage-optional-recovery";
    seedOptional(id);
    const { confirmed } = await swap(id, { mode: "enable", password: PASSWORD });
    await core.disableMfa(read(id), { password: PASSWORD, code: confirmed.recoveryCodes[0] }, deps());
    assert.equal(row(id).mfaEnabled, false);
    assert.deepEqual(row(id).recoveryCodeHashes, [], "disableData wins over the consumed-code list");
  });

  it("AC15: mandatory roles can't turn 2FA off (403 mfa_required, audited) and can't use enable mode", async () => {
    const mandatory: [string, Record<string, unknown>][] = [
      ["APP_OWNER", { role: "APP_OWNER" }], ["SUPER_ADMIN", { role: "SUPER_ADMIN" }], ["ADMIN", { role: "ADMIN" }],
      ["CAMPUS_ADMIN", { role: "CAMPUS_ADMIN" }], ["PRINCIPAL", { role: "PRINCIPAL" }],
      ["owner", { role: "TEACHER", isInstitutionOwner: true }],
      ["memberships", { role: "ACCOUNTANT", isInstitutionOwner: false, canManageMemberships: true }],
      ["purchase", { role: "RECEPTIONIST", isInstitutionOwner: false, canPurchaseSubscription: true }],
    ];
    for (const [label, overrides] of mandatory) {
      const id = `manage-mandatory-${label}`;
      const { secret } = seedEnrolled(id, overrides);
      await assert.rejects(core.disableMfa(read(id), { password: PASSWORD, code: code(secret) }, deps()), (error: unknown) => {
        assert.ok(error instanceof failures.MfaFailure);
        assert.equal(error.reason, "mfa_required");
        assert.equal(error.status, 403);
        return true;
      });
      assertEnabled(id, `${label} after refused disable`);
      assert.equal(row(id).mfaLastStep, -1, `${label}: the code was not consumed`);
      assert.deepEqual(auditsOf(id).at(-1), { action: "mfa.disable.refused", reason: "mfa_required" });
      assert.equal(core.mfaStatus(read(id)).required, true);
    }
    const id = "manage-mandatory-enable";
    fake.state.users.push(newUser(id, { role: "PRINCIPAL", password: PASSWORD_HASH }));
    await rejects(core.beginChange(read(id), { mode: "enable", password: PASSWORD }, deps()), "invalid_request");
  });
});

describe("status and secrecy", () => {
  it("AC10: status has no secret, code or hash", async () => {
    const id = "manage-status";
    seedEnrolled(id, { mfaEnrolledAt: new Date(T0 - 24 * HOUR) });
    const status = core.mfaStatus(read(id));
    assert.deepEqual(status, { enabled: true, required: true, enrolledAt: new Date(T0 - 24 * HOUR).toISOString(), recoveryCodesRemaining: 10, recoveryCodesTotal: 10, authenticatorReadable: true });
    seedOptional("manage-status-off");
    assert.deepEqual(core.mfaStatus(read("manage-status-off")), { enabled: false, required: false, enrolledAt: null, recoveryCodesRemaining: 0, recoveryCodesTotal: 10, authenticatorReadable: null });
  });

  it("AC18: audit rows are {action} or {action, reason}; no log line or audit row contains a code, secret or hash", () => {
    assert.ok(sensitive.size > 50, "the suite tracked the values it handled");
    const allowed = new Set(["mfa.change.started", "mfa.enable.started", "mfa.authenticator.changed", "mfa.enabled", "mfa.recovery.regenerated", "mfa.disabled",
      "mfa.change.failed", "mfa.enable.failed", "mfa.regenerate.failed", "mfa.disable.failed", "mfa.disable.refused", "mfa.secret.unavailable",
      // written by the real sign-in route these tests use as the oracle
      "mfa.challenge.succeeded", "mfa.challenge.failed", "mfa.recovery.used", "mfa.recovery.failed"]);
    for (const entry of fake.state.auditLogs) {
      const value = entry.newValue as Record<string, unknown>;
      assert.ok(allowed.has(value.action as string), `unexpected audit action ${String(value.action)}`);
      assert.deepEqual(Object.keys(value).filter(key => key !== "action" && key !== "reason"), []);
      assert.equal(entry.tableName, "account_security");
    }
    for (const line of [...logs, ...fake.state.auditLogs.map(entry => JSON.stringify(entry.newValue))]) {
      for (const value of sensitive) assert.ok(!line.includes(value), `sensitive value leaked into: ${line.slice(0, 120)}`);
    }
  });
});
