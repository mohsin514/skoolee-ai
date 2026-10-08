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
export function verifyTotp(secret: string, code: string, lastStep = -1, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now / 30_000);
  for (const step of [current, current - 1, current + 1]) {
    if (step > lastStep && timingSafeEqual(Buffer.from(totp(secret, step)), Buffer.from(code))) return step;
  }
  return null;
}
const key = () => createHash("sha256").update(process.env.MFA_ENCRYPTION_KEY || JWT_SECRET).digest();
export function protectSecret(secret: string) {
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}
export function revealSecret(value: string) {
  const bytes = Buffer.from(value, "base64url"); const decipher = createDecipheriv("aes-256-gcm", key(), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8");
}
export function recoveryHash(code: string) { return createHash("sha256").update(code.replace(/[-\s]/g, "").toUpperCase()).digest("hex"); }
export function newRecoveryCodes() { return Array.from({ length: 10 }, () => randomBytes(10).toString("hex").toUpperCase().match(/.{4}/g)!.join("-")); }
export function requiresMfa(user: { role: string; isInstitutionOwner?: boolean; canManageMemberships?: boolean; canPurchaseSubscription?: boolean }) {
  return Boolean(user.isInstitutionOwner || user.canManageMemberships || user.canPurchaseSubscription || ["APP_OWNER", "SUPER_ADMIN", "ADMIN", "CAMPUS_ADMIN", "PRINCIPAL"].includes(user.role));
}
