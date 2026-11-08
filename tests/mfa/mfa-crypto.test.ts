/**
 * Unit tests for the MFA primitives: code normalisation, the TOTP window
 * (±1 accepted, -2..-10 reported as skew, future steps never disclosed,
 * replay refused), the encryption
 * keyring, and the AUTH_SECRET production guard.
 */
import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createCipheriv, createHash, randomBytes } from "node:crypto";

const AUTH_SECRET = "mfa-crypto-test-auth-secret-0123456789abcdef";
Object.assign(process.env, { NODE_ENV: "test", AUTH_SECRET });
delete process.env.MFA_ENCRYPTION_KEY;
delete process.env.MFA_ENCRYPTION_KEY_PREVIOUS;

let crypto: typeof import("@/lib/auth/mfa-crypto");
before(async () => { crypto = await import("@/lib/auth/mfa-crypto"); });

const NOW = Date.UTC(2026, 0, 15, 9, 0, 10);
const STEP = Math.floor(NOW / 30_000);

/** Encrypts the way the original code did: sha256(material) as the AES-256-GCM key. */
function legacyEncrypt(secret: string, material: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", createHash("sha256").update(material).digest(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

function withEnv<T>(values: Record<string, string | undefined>, fn: () => T): T {
  const saved = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  try { return fn(); } finally {
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
}

describe("normalisation", () => {
  it("strips spaces and dashes", () => {
    assert.equal(crypto.normalizeMfaCode(" 123 456 "), "123456");
    assert.equal(crypto.normalizeMfaCode("123-456"), "123456");
    assert.equal(crypto.normalizeMfaCode("abcd-ef01\t2345"), "abcdef012345");
    assert.equal(crypto.normalizeMfaCode(undefined), "");
  });
  it("recognises recovery codes in any case, with or without dashes", () => {
    for (const code of crypto.newRecoveryCodes()) {
      assert.ok(crypto.looksLikeRecoveryCode(code), code);
      assert.ok(crypto.looksLikeRecoveryCode(code.replace(/-/g, "").toLowerCase()));
    }
    assert.ok(!crypto.looksLikeRecoveryCode("123456"));
    assert.ok(!crypto.looksLikeRecoveryCode("ABCD-ABCD-ABCD-ABCD-ABC"));
    assert.ok(!crypto.looksLikeRecoveryCode("ABCD-ABCD-ABCD-ABCD-ABCG"));
  });
  it("hashes a recovery code the same however it is typed", () => {
    const [code] = crypto.newRecoveryCodes();
    assert.equal(crypto.recoveryHash(code), crypto.recoveryHash(code.replace(/-/g, " ").toLowerCase()));
  });
});

describe("checkTotp", () => {
  const secret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
  const at = (offset: number) => crypto.totp(secret, STEP + offset);

  it("accepts the current step and one either side", () => {
    for (const offset of [0, -1, 1]) assert.deepEqual(crypto.checkTotp(secret, at(offset), -1, NOW), { ok: true, step: STEP + offset });
  });
  it("accepts a spaced code", () => {
    const code = at(0);
    assert.deepEqual(crypto.checkTotp(secret, `${code.slice(0, 3)} ${code.slice(3)}`, -1, NOW), { ok: true, step: STEP });
  });
  it("reports -2..-10 (a slow device clock) as skew and never accepts them", () => {
    for (const offset of [-2, -5, -10]) assert.deepEqual(crypto.checkTotp(secret, at(offset), -1, NOW), { ok: false, reason: "skew" }, `offset ${offset}`);
  });
  it("reports +2..+10 as plain invalid so a guess that becomes valid later is not disclosed", () => {
    for (const offset of [2, 3, 5, 10]) assert.deepEqual(crypto.checkTotp(secret, at(offset), -1, NOW), { ok: false, reason: "invalid" }, `offset ${offset}`);
  });
  it("treats ±11 and beyond as invalid", () => {
    for (const offset of [11, -11, 100]) {
      const result = crypto.checkTotp(secret, at(offset), -1, NOW);
      assert.equal(result.ok, false);
    }
  });
  it("refuses a step at or before lastStep as reused", () => {
    assert.deepEqual(crypto.checkTotp(secret, at(0), STEP, NOW), { ok: false, reason: "reused" });
    assert.deepEqual(crypto.checkTotp(secret, at(-1), STEP - 1, NOW), { ok: false, reason: "reused" });
    assert.deepEqual(crypto.checkTotp(secret, at(0), STEP - 1, NOW), { ok: true, step: STEP });
  });
  it("rejects malformed codes as invalid", () => {
    for (const code of ["", "12345", "1234567", "abcdef", "12345a"]) assert.deepEqual(crypto.checkTotp(secret, code, -1, NOW), { ok: false, reason: "invalid" });
  });
  it("keeps verifyTotp as a step-or-null wrapper", () => {
    assert.equal(crypto.verifyTotp(secret, at(1), -1, NOW), STEP + 1);
    assert.equal(crypto.verifyTotp(secret, at(2), -1, NOW), null);
    assert.equal(crypto.verifyTotp(secret, at(0), STEP, NOW), null);
  });
});

describe("encryption keyring", () => {
  const secret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";

  it("round-trips with the AUTH_SECRET-derived default key", () => {
    assert.equal(crypto.revealSecret(crypto.protectSecret(secret)), secret);
  });
  it("still decrypts secrets stored before MFA_ENCRYPTION_KEY was set", () => {
    const legacy = legacyEncrypt(secret, AUTH_SECRET);
    assert.equal(crypto.revealSecret(legacy), secret);
    withEnv({ MFA_ENCRYPTION_KEY: "primary-key-0123456789abcdef0123456789" }, () => assert.equal(crypto.revealSecret(legacy), secret));
  });
  it("encrypts with MFA_ENCRYPTION_KEY when set", () => {
    withEnv({ MFA_ENCRYPTION_KEY: "primary-key-0123456789abcdef0123456789" }, () => {
      const stored = crypto.protectSecret(secret);
      assert.equal(crypto.revealSecret(stored), secret);
      // Not readable by the AUTH_SECRET-derived key alone.
      withEnv({ MFA_ENCRYPTION_KEY: undefined }, () => assert.throws(() => crypto.revealSecret(stored), crypto.MfaSecretUnavailableError));
    });
  });
  it("decrypts with MFA_ENCRYPTION_KEY_PREVIOUS after rotation", () => {
    const stored = legacyEncrypt(secret, "old-key-0123456789abcdef0123456789abcd");
    withEnv({ MFA_ENCRYPTION_KEY: "new-key-0123456789abcdef0123456789abcd", MFA_ENCRYPTION_KEY_PREVIOUS: "old-key-0123456789abcdef0123456789abcd" }, () => {
      assert.equal(crypto.revealSecret(stored), secret);
    });
  });
  it("throws MfaSecretUnavailableError for an unknown key or a damaged value", () => {
    assert.throws(() => crypto.revealSecret(legacyEncrypt(secret, "some-other-deployment-secret")), crypto.MfaSecretUnavailableError);
    assert.throws(() => crypto.revealSecret("garbage"), crypto.MfaSecretUnavailableError);
    const error = (() => { try { crypto.revealSecret("garbage"); } catch (caught) { return caught as Error; } })();
    assert.ok(error && !error.message.includes(secret));
  });
});

describe("AUTH_SECRET guard", () => {
  function load(env: { NODE_ENV: "development" | "production"; AUTH_SECRET?: string }) {
    return spawnSync(process.execPath, ["--import", "tsx", "--eval", "require('./src/lib/auth/secret.ts')"], {
      cwd: process.cwd(), env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, ...env }, encoding: "utf8", timeout: 60_000,
    });
  }
  it("refuses to start in production with the development fallback value", () => {
    const result = load({ NODE_ENV: "production", AUTH_SECRET: "dev-secret-change-me" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /development fallback in production/);
  });
  it("refuses to start in production without AUTH_SECRET", () => {
    const result = load({ NODE_ENV: "production" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /AUTH_SECRET is not set in production/);
  });
  it("starts in production with a real secret", () => {
    assert.equal(load({ NODE_ENV: "production", AUTH_SECRET: "a-real-production-secret-0123456789abcdef" }).status, 0);
  });
  it("warns when falling back outside production", () => {
    const result = load({ NODE_ENV: "development" });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /AUTH_SECRET is not set; using the development fallback/);
  });
});
