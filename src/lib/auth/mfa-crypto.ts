import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { JWT_SECRET } from "./secret";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function newAuthenticatorSecret() {
  return Array.from(randomBytes(32), n => alphabet[n & 31]).join("");
}
function decodeBase32(secret: string) {
  let bits = "";
  for (const char of secret) bits += alphabet.indexOf(char).toString(2).padStart(5, "0");
  return Buffer.from(bits.match(/.{8}/g)!.map(byte => parseInt(byte, 2)));
}
export function totp(secret: string, step = Math.floor(Date.now() / 30_000)) {
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", decodeBase32(secret)).update(counter).digest();
  const offset = digest[19] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

/** Strips the spaces and dashes authenticator apps and recovery sheets display ("123 456", "ABCD-EF01-…"). */
export function normalizeMfaCode(code: unknown) {
  return String(code ?? "").replace(/[\s-]/g, "");
}
/** Recovery codes are 10 random bytes shown as 20 hex characters. */
export function looksLikeRecoveryCode(code: unknown) {
  return /^[0-9a-f]{20}$/i.test(normalizeMfaCode(code));
}

/** Accepted drift: the current 30 s step and one either side. */
const TOTP_WINDOW = 1;
/** Matches up to this many steps in the past are reported as clock skew, never accepted. */
const TOTP_SKEW_PROBE = 10;
export type TotpCheck = { ok: true; step: number } | { ok: false; reason: "invalid" | "reused" | "skew" };

/**
 * Verifies a TOTP code against the current step ±1, refusing any step at or
 * before `lastStep` (replay guard). A code that only matches 2–10 steps in the
 * PAST is rejected with `skew` so the user can be told to fix a slow device
 * clock. Future steps are never probed: reporting them would tell a guesser
 * that the code becomes valid within minutes, so they fall through as `invalid`.
 */
export function checkTotp(secret: string, code: string, lastStep = -1, now = Date.now()): TotpCheck {
  const value = normalizeMfaCode(code);
  if (!/^\d{6}$/.test(value)) return { ok: false, reason: "invalid" };
  const given = Buffer.from(value);
  const current = Math.floor(now / 30_000);
  const matchesStep = (step: number) => step >= 0 && timingSafeEqual(Buffer.from(totp(secret, step)), given);
  let reused = false;
  for (const step of [current, current - TOTP_WINDOW, current + TOTP_WINDOW]) {
    if (!matchesStep(step)) continue;
    if (step > lastStep) return { ok: true, step };
    reused = true;
  }
  if (reused) return { ok: false, reason: "reused" };
  for (let distance = TOTP_WINDOW + 1; distance <= TOTP_SKEW_PROBE; distance++) {
    if (matchesStep(current - distance)) return { ok: false, reason: "skew" };
  }
  return { ok: false, reason: "invalid" };
}
export function verifyTotp(secret: string, code: string, lastStep = -1, now = Date.now()) {
  const result = checkTotp(secret, code, lastStep, now);
  return result.ok ? result.step : null;
}

/** The stored authenticator secret could not be decrypted with any configured key. */
export class MfaSecretUnavailableError extends Error {
  constructor() {
    super("Stored authenticator secret cannot be decrypted with the configured keys");
    this.name = "MfaSecretUnavailableError";
  }
}
const deriveKey = (material: string | Uint8Array) => createHash("sha256").update(material).digest();
/**
 * Encryption keys, primary first: MFA_ENCRYPTION_KEY, then MFA_ENCRYPTION_KEY_PREVIOUS
 * (rotation), then the AUTH_SECRET-derived key every secret was encrypted with
 * before MFA_ENCRYPTION_KEY existed.
 */
function keyring() {
  const keys: Buffer[] = [];
  if (process.env.MFA_ENCRYPTION_KEY) keys.push(deriveKey(process.env.MFA_ENCRYPTION_KEY));
  if (process.env.MFA_ENCRYPTION_KEY_PREVIOUS) keys.push(deriveKey(process.env.MFA_ENCRYPTION_KEY_PREVIOUS));
  keys.push(deriveKey(JWT_SECRET));
  return keys;
}
export function protectSecret(secret: string) {
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", keyring()[0], iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}
export function revealSecret(value: string) {
  const bytes = Buffer.from(value, "base64url");
  if (bytes.length <= 28) throw new MfaSecretUnavailableError();
  for (const key of keyring()) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
      decipher.setAuthTag(bytes.subarray(12, 28));
      return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8");
    } catch {
      // Wrong key: the GCM tag does not verify. Try the next one.
    }
  }
  throw new MfaSecretUnavailableError();
}
export function recoveryHash(code: string) { return createHash("sha256").update(code.replace(/[-\s]/g, "").toUpperCase()).digest("hex"); }
export function newRecoveryCodes() { return Array.from({ length: 10 }, () => randomBytes(10).toString("hex").toUpperCase().match(/.{4}/g)!.join("-")); }
export function requiresMfa(user: { role: string; isInstitutionOwner?: boolean; canManageMemberships?: boolean; canPurchaseSubscription?: boolean }) {
  return Boolean(user.isInstitutionOwner || user.canManageMemberships || user.canPurchaseSubscription || ["APP_OWNER", "SUPER_ADMIN", "ADMIN", "CAMPUS_ADMIN", "PRINCIPAL"].includes(user.role));
}
