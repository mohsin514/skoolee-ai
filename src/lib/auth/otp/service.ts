// SKAI-954 / SKAI-1061 [D8-02]: phone OTP service.
//
// - 6-digit codes from crypto.randomInt, stored only as HMAC-SHA256(AUTH_SECRET, challengeId:code).
// - Phone numbers are stored only as HMAC hashes. The client sends the number again when
//   it verifies or asks for the fallback, and the server checks it against the hash.
// - 5-minute TTL, 5 attempts per challenge, a new request supersedes the old one,
//   and consumption is a compare-and-set, so a code cannot be replayed.
// - Each challenge is bound to the requesting browser by an httpOnly flow nonce (only its hash is stored).
// - WhatsApp copy-code first. SMS is sent at once when WhatsApp is off or the number is
//   not on WhatsApp, and otherwise when the client asks after `fallbackAfterSeconds`
//   and WhatsApp has not reported delivery.
// - Unknown numbers get a decoy challenge with an identical response: no enumeration oracle.
// - Every send writes an OtpDelivery row (channel, cost, delivered/verified time) for V5/V6.

import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { marketConfig, normalizePhone, type OtpChannel, type OtpMarket } from "./markets";
import { senderFor, type OtpSender } from "./senders";
import { OTP_CODE_TTL_MINUTES } from "./templates";
import type { OtpLanguage } from "./copy";

export const OTP_TTL_MS = OTP_CODE_TTL_MINUTES * 60_000;
export const OTP_MAX_ATTEMPTS = 5;
export type OtpPurpose = "guardian_sign_in" | "staff_second_factor";

export type ChallengeRow = {
  id: string; purpose: string; phoneHash: string; market: string; userId: string | null; flowHash: string;
  codeHash: string; fallbackCodeHash: string | null; language: string; attempts: number; expiresAt: Date;
  verifiedAt: Date | null; consumedAt: Date | null; supersededAt: Date | null; createdAt: Date;
};
export type DeliveryRow = {
  id: string; challengeId: string; market: string; channel: string; provider: string; providerMessageId: string | null;
  isFallback: boolean; status: string; errorCode: string | null; costMicroUsd: number | null; costVerified: boolean;
  sentAt: Date; deliveredAt: Date | null; verifiedAt: Date | null;
};

/** Persistence used by the service; `prismaOtpStore` in store.ts, an in-memory fake in tests. */
export interface OtpStore {
  createChallenge(row: Omit<ChallengeRow, "attempts" | "verifiedAt" | "consumedAt" | "supersededAt" | "createdAt">): Promise<void>;
  getChallenge(id: string): Promise<ChallengeRow | null>;
  supersedeOpen(phoneHash: string, purpose: string, now: Date): Promise<void>;
  /** Atomically add one attempt if under the limit and still open; false when the limit is hit. */
  claimAttempt(id: string, max: number, now: Date): Promise<boolean>;
  setFallbackCode(id: string, hash: string): Promise<void>;
  /** Compare-and-set: true only for the one caller that consumes the challenge. */
  consume(id: string, now: Date): Promise<boolean>;
  markVerified(id: string, now: Date): Promise<void>;
  addDelivery(row: Omit<DeliveryRow, "id" | "deliveredAt" | "verifiedAt">): Promise<void>;
  deliveries(challengeId: string): Promise<DeliveryRow[]>;
  markDeliveriesVerified(challengeId: string, now: Date): Promise<void>;
  updateDeliveryStatus(providerMessageId: string, status: string, at: Date, errorCode?: string): Promise<void>;
}

export type GuardianAccount = { userId: string; schoolId: string };
export type OtpDeps = {
  store: OtpStore;
  rateLimit: (scope: string, opts: { limit: number; windowMs: number }) => Promise<{ ok: boolean }>;
  /** Active PARENT accounts holding this E.164 number (optionally in one school). */
  findGuardians: (e164: string, schoolId?: string) => Promise<GuardianAccount[]>;
  secret: string;
  env?: Record<string, string | undefined>;
  sender?: (channel: OtpChannel) => OtpSender | null;
  now?: () => Date;
  statusCallbackUrl?: string;
};

export type OtpError = "invalid_phone" | "rate_limited" | "unavailable" | "invalid_or_expired" | "wrong_code" | "too_many_attempts" | "choose_school" | "fallback_not_ready";
type Fail = { ok: false; error: OtpError; retryAfterSeconds?: number };

const hmac = (secret: string, value: string) => createHmac("sha256", secret).update(value).digest("hex");
export const phoneHash = (secret: string, e164: string) => hmac(secret, `otp-phone:${e164}`);
export const flowHash = (secret: string, nonce: string) => hmac(secret, `otp-flow:${nonce}`);
const codeHash = (secret: string, challengeId: string, code: string) => hmac(secret, `otp-code:${challengeId}:${code}`);
const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");
function sameHash(a: string, b: string | null) {
  if (!b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}
const clock = (d: OtpDeps) => (d.now ? d.now() : new Date());
const send = (d: OtpDeps) => d.sender ?? ((c: OtpChannel) => senderFor(c, d.env ?? process.env));

async function deliver(d: OtpDeps, challengeId: string, market: OtpMarket, channel: OtpChannel, to: string, code: string, language: OtpLanguage, isFallback: boolean) {
  const sender = send(d)(channel);
  const cfg = marketConfig(market, d.env ?? process.env);
  if (!sender) return { ok: false as const, notOnWhatsApp: false, error: `${channel}:disabled` };
  const result = await sender.send({ to, code, language, ttlMinutes: OTP_CODE_TTL_MINUTES, smsFrom: (d.env ?? process.env)[cfg.smsFromEnv], statusCallbackUrl: channel === "sms" ? d.statusCallbackUrl : undefined });
  const cost = cfg.cost[channel];
  await d.store.addDelivery({
    challengeId, market, channel, provider: result.provider, isFallback,
    providerMessageId: result.ok ? result.providerMessageId : null,
    status: result.ok ? "sent" : result.notOnWhatsApp ? "not_on_whatsapp" : "failed",
    errorCode: result.ok ? null : result.error,
    // Meta bills WhatsApp only on delivery, so its cost is recorded but counted in reports only once delivered.
    costMicroUsd: result.ok ? cost.microUsd : null, costVerified: cost.verified, sentAt: clock(d),
  });
  return result.ok ? { ok: true as const } : { ok: false as const, notOnWhatsApp: !!result.notOnWhatsApp, error: result.error };
}

async function sendFirst(d: OtpDeps, challengeId: string, market: OtpMarket, to: string, code: string, language: OtpLanguage) {
  const cfg = marketConfig(market, d.env ?? process.env);
  if (cfg.primary === "sms") return (await deliver(d, challengeId, market, "sms", to, code, language, false)).ok ? "sms" : null;
  const wa = await deliver(d, challengeId, market, "whatsapp", to, code, language, false);
  if (wa.ok) return "whatsapp";
  // WhatsApp is off, failed, or the number is not on WhatsApp: SMS now, with the same code.
  return (await deliver(d, challengeId, market, "sms", to, code, language, true)).ok ? "sms" : null;
}

export type RequestInput = { phone: unknown; language: OtpLanguage; ip: string; flowNonce: string; defaultMarket?: OtpMarket };
export type RequestOk = { ok: true; challengeId: string; channel: OtpChannel; fallbackAfterSeconds: number; expiresInSeconds: number };

async function throttle(d: OtpDeps, e164: string | null, ip: string): Promise<Fail | null> {
  const checks = [d.rateLimit(`otp-send-ip:${ip}`, { limit: 20, windowMs: 600_000 })];
  if (e164) checks.push(d.rateLimit(`otp-send-phone:${e164}`, { limit: 3, windowMs: 600_000 }), d.rateLimit(`otp-send-phone-day:${e164}`, { limit: 10, windowMs: 86_400_000 }));
  return (await Promise.all(checks)).every((r) => r.ok) ? null : { ok: false, error: "rate_limited", retryAfterSeconds: 600 };
}

async function openChallenge(d: OtpDeps, purpose: OtpPurpose, e164: string, market: OtpMarket, language: OtpLanguage, flowNonce: string, userId: string | null, real: boolean): Promise<RequestOk | Fail> {
  const now = clock(d), id = randomUUID(), code = newCode(), ph = phoneHash(d.secret, e164);
  await d.store.supersedeOpen(ph, purpose, now);
  await d.store.createChallenge({
    id, purpose, phoneHash: ph, market, userId, flowHash: flowHash(d.secret, flowNonce),
    // A decoy's code hash is derived from a random value nobody holds, so it can never verify.
    codeHash: codeHash(d.secret, id, real ? code : randomUUID()), fallbackCodeHash: null, language, expiresAt: new Date(now.getTime() + OTP_TTL_MS),
  });
  const cfg = marketConfig(market, d.env ?? process.env);
  let channel: OtpChannel = cfg.primary;
  if (real) {
    const sent = await sendFirst(d, id, market, e164, code, language);
    if (!sent) return { ok: false, error: "unavailable" };
    channel = sent;
  }
  return { ok: true, challengeId: id, channel, fallbackAfterSeconds: cfg.fallbackAfterSeconds, expiresInSeconds: OTP_TTL_MS / 1000 };
}

/** Guardian sign-in, step 1. The response is the same whether or not the number has an account. */
export async function requestGuardianCode(input: RequestInput, d: OtpDeps): Promise<RequestOk | Fail> {
  const phone = normalizePhone(input.phone, input.defaultMarket);
  const limited = await throttle(d, phone?.e164 ?? null, input.ip);
  if (limited) return limited;
  if (!phone) return { ok: false, error: "invalid_phone" };
  const accounts = await d.findGuardians(phone.e164);
  return openChallenge(d, "guardian_sign_in", phone.e164, phone.market, input.language, input.flowNonce, null, accounts.length > 0);
}

/** Optional staff second factor: a code to the signed-in user's own phone. */
export async function requestStaffCode(input: { user: { id: string; phone: string | null }; language: OtpLanguage; ip: string; flowNonce: string; defaultMarket?: OtpMarket }, d: OtpDeps): Promise<RequestOk | Fail> {
  const phone = normalizePhone(input.user.phone, input.defaultMarket);
  const limited = await throttle(d, phone?.e164 ?? null, input.ip);
  if (limited) return limited;
  if (!phone) return { ok: false, error: "invalid_phone" };
  return openChallenge(d, "staff_second_factor", phone.e164, phone.market, input.language, input.flowNonce, input.user.id, true);
}

async function openFor(d: OtpDeps, challengeId: unknown, flowNonce: string, purpose: OtpPurpose, e164: string | null) {
  if (typeof challengeId !== "string" || challengeId.length > 64 || !flowNonce) return null;
  const c = await d.store.getChallenge(challengeId);
  const now = clock(d);
  if (!c || c.purpose !== purpose || c.consumedAt || c.supersededAt || c.expiresAt <= now) return null;
  if (!sameHash(flowHash(d.secret, flowNonce), c.flowHash)) return null;
  if (e164 !== null && !sameHash(phoneHash(d.secret, e164), c.phoneHash)) return null;
  return c;
}

async function checkCode(d: OtpDeps, c: ChallengeRow, code: unknown): Promise<Fail | null> {
  if (!(await d.store.claimAttempt(c.id, OTP_MAX_ATTEMPTS, clock(d)))) return { ok: false, error: "too_many_attempts" };
  const given = typeof code === "string" ? code.replace(/\s/g, "") : "";
  if (!/^\d{6}$/.test(given)) return { ok: false, error: "wrong_code" };
  const h = codeHash(d.secret, c.id, given);
  return sameHash(h, c.codeHash) || sameHash(h, c.fallbackCodeHash) ? null : { ok: false, error: "wrong_code" };
}

export type VerifyGuardianInput = { challengeId: unknown; phone: unknown; code?: unknown; schoolId?: unknown; flowNonce: string; ip: string; defaultMarket?: OtpMarket };
export type VerifyGuardianResult = { ok: true; account: GuardianAccount } | { ok: false; error: "choose_school"; schoolIds: string[] } | Fail;

/**
 * Guardian sign-in, step 2. A number held by guardian accounts at several schools
 * verifies once, then picks a school (same browser, same challenge, before expiry).
 */
export async function verifyGuardianCode(input: VerifyGuardianInput, d: OtpDeps): Promise<VerifyGuardianResult> {
  if (!(await d.rateLimit(`otp-verify-ip:${input.ip}`, { limit: 30, windowMs: 600_000 })).ok) return { ok: false, error: "rate_limited", retryAfterSeconds: 600 };
  const phone = normalizePhone(input.phone, input.defaultMarket);
  if (!phone) return { ok: false, error: "invalid_or_expired" };
  const c = await openFor(d, input.challengeId, input.flowNonce, "guardian_sign_in", phone.e164);
  if (!c) return { ok: false, error: "invalid_or_expired" };
  if (!c.verifiedAt) {
    const bad = await checkCode(d, c, input.code);
    if (bad) return bad;
  }
  const accounts = await d.findGuardians(phone.e164);
  if (accounts.length === 0) return { ok: false, error: "invalid_or_expired" };
  const schoolId = typeof input.schoolId === "string" ? input.schoolId : null;
  const account = accounts.length === 1 && !schoolId ? accounts[0] : accounts.find((a) => a.schoolId === schoolId);
  if (!account) {
    if (!c.verifiedAt) await d.store.markVerified(c.id, clock(d));
    return { ok: false, error: "choose_school", schoolIds: [...new Set(accounts.map((a) => a.schoolId))] };
  }
  if (!(await d.store.consume(c.id, clock(d)))) return { ok: false, error: "invalid_or_expired" };
  await d.store.markDeliveriesVerified(c.id, clock(d));
  return { ok: true, account };
}

/** Staff second factor verify: the challenge must belong to this exact user and phone. */
export async function verifyStaffCode(input: { challengeId: unknown; code: unknown; flowNonce: string; user: { id: string; phone: string | null }; ip: string; defaultMarket?: OtpMarket }, d: OtpDeps): Promise<{ ok: true } | Fail> {
  if (!(await d.rateLimit(`otp-verify-ip:${input.ip}`, { limit: 30, windowMs: 600_000 })).ok) return { ok: false, error: "rate_limited", retryAfterSeconds: 600 };
  const phone = normalizePhone(input.user.phone, input.defaultMarket);
  const c = phone ? await openFor(d, input.challengeId, input.flowNonce, "staff_second_factor", phone.e164) : null;
  if (!c || c.userId !== input.user.id) return { ok: false, error: "invalid_or_expired" };
  const bad = await checkCode(d, c, input.code);
  if (bad) return bad;
  if (!(await d.store.consume(c.id, clock(d)))) return { ok: false, error: "invalid_or_expired" };
  await d.store.markDeliveriesVerified(c.id, clock(d));
  return { ok: true };
}

export type StatusResult = { ok: true; channel: OtpChannel | null; whatsapp: string | null; smsSent: boolean; fallbackInSeconds: number | null };

function fallbackState(c: ChallengeRow, rows: DeliveryRow[], now: Date, env: Record<string, string | undefined>) {
  const wa = rows.find((r) => r.channel === "whatsapp" && !r.isFallback);
  const smsSent = rows.some((r) => r.channel === "sms");
  const cfg = marketConfig(c.market as OtpMarket, env);
  if (smsSent || !wa) return { wa, smsSent, waitSeconds: null };
  if (wa.status === "delivered" || wa.status === "read") return { wa, smsSent, waitSeconds: null };
  if (wa.status === "failed" || wa.status === "not_on_whatsapp") return { wa, smsSent, waitSeconds: 0 };
  return { wa, smsSent, waitSeconds: Math.max(0, Math.ceil((wa.sentAt.getTime() + cfg.fallbackAfterSeconds * 1000 - now.getTime()) / 1000)) };
}

/** Delivery status for the waiting screen (polled). Unknown and decoy challenges look identical. */
export async function challengeStatus(input: { challengeId: unknown; flowNonce: string; purpose?: OtpPurpose }, d: OtpDeps): Promise<StatusResult | Fail> {
  const c = await openFor(d, input.challengeId, input.flowNonce, input.purpose ?? "guardian_sign_in", null);
  if (!c) return { ok: false, error: "invalid_or_expired" };
  const rows = await d.store.deliveries(c.id);
  const now = clock(d), env = d.env ?? process.env;
  if (rows.length === 0) {
    // Decoy: mimic a WhatsApp send still waiting, so status does not reveal account existence.
    const cfg = marketConfig(c.market as OtpMarket, env);
    return { ok: true, channel: cfg.primary, whatsapp: cfg.primary === "whatsapp" ? "sent" : null, smsSent: cfg.primary === "sms", fallbackInSeconds: cfg.primary === "whatsapp" ? Math.max(0, Math.ceil((c.createdAt.getTime() + cfg.fallbackAfterSeconds * 1000 - now.getTime()) / 1000)) : null };
  }
  const s = fallbackState(c, rows, now, env);
  return { ok: true, channel: s.smsSent ? "sms" : "whatsapp", whatsapp: s.wa?.status ?? null, smsSent: s.smsSent, fallbackInSeconds: s.waitSeconds };
}

/** SMS fallback. Allowed once, after the wait or at once when WhatsApp reports failure. */
export async function requestSmsFallback(input: { challengeId: unknown; phone: unknown; flowNonce: string; ip: string; purpose?: OtpPurpose; defaultMarket?: OtpMarket }, d: OtpDeps): Promise<{ ok: true; channel: "sms" } | Fail> {
  if (!(await d.rateLimit(`otp-fallback-ip:${input.ip}`, { limit: 20, windowMs: 600_000 })).ok) return { ok: false, error: "rate_limited", retryAfterSeconds: 600 };
  const phone = normalizePhone(input.phone, input.defaultMarket);
  const c = phone ? await openFor(d, input.challengeId, input.flowNonce, input.purpose ?? "guardian_sign_in", phone.e164) : null;
  if (!c || !phone) return { ok: false, error: "invalid_or_expired" };
  const rows = await d.store.deliveries(c.id);
  if (rows.length === 0) {
    // Decoy: the same answer as a real fallback once the wait has passed.
    const cfg = marketConfig(c.market as OtpMarket, d.env ?? process.env);
    return clock(d).getTime() - c.createdAt.getTime() >= cfg.fallbackAfterSeconds * 1000 ? { ok: true, channel: "sms" } : { ok: false, error: "fallback_not_ready" };
  }
  const s = fallbackState(c, rows, clock(d), d.env ?? process.env);
  if (s.waitSeconds === null || s.waitSeconds > 0) return { ok: false, error: "fallback_not_ready", retryAfterSeconds: s.waitSeconds ?? undefined };
  const code = newCode();
  await d.store.setFallbackCode(c.id, codeHash(d.secret, c.id, code));
  const sent = await deliver(d, c.id, c.market as OtpMarket, "sms", phone.e164, code, c.language as OtpLanguage, true);
  return sent.ok ? { ok: true, channel: "sms" } : { ok: false, error: "unavailable" };
}
