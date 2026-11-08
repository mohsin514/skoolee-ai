import { test } from "node:test";
import assert from "node:assert/strict";
import { requestGuardianCode, verifyGuardianCode, requestSmsFallback, challengeStatus, requestStaffCode, verifyStaffCode, type OtpStore, type ChallengeRow, type DeliveryRow, type OtpDeps, type GuardianAccount } from "../../src/lib/auth/otp/service";
import { applyMetaStatuses, applyTwilioStatus, verifiedTwilioSignature } from "../../src/lib/auth/otp/receipts";
import { otpMetrics } from "../../src/lib/auth/otp/metrics";
import type { OtpSender } from "../../src/lib/auth/otp/senders";
import type { OtpChannel } from "../../src/lib/auth/otp/markets";
import { createHmac } from "node:crypto";

function memoryStore() {
  const challenges = new Map<string, ChallengeRow>();
  const deliveries: DeliveryRow[] = [];
  let seq = 0;
  const open = (c: ChallengeRow | undefined, now: Date) => !!c && !c.consumedAt && !c.supersededAt && c.expiresAt > now;
  const store: OtpStore = {
    async createChallenge(row) { challenges.set(row.id, { ...row, attempts: 0, verifiedAt: null, consumedAt: null, supersededAt: null, createdAt: clock.now }); },
    async getChallenge(id) { const c = challenges.get(id); return c ? { ...c } : null; },
    async supersedeOpen(ph, purpose, now) { for (const c of challenges.values()) if (c.phoneHash === ph && c.purpose === purpose && open(c, now)) c.supersededAt = now; },
    async claimAttempt(id, max, now) { const c = challenges.get(id); if (!open(c, now) || c!.attempts >= max) return false; c!.attempts++; return true; },
    async setFallbackCode(id, h) { challenges.get(id)!.fallbackCodeHash = h; },
    async consume(id, now) { const c = challenges.get(id); if (!open(c, now)) return false; c!.consumedAt = now; return true; },
    async markVerified(id, now) { const c = challenges.get(id)!; c.verifiedAt ??= now; },
    async addDelivery(row) { deliveries.push({ ...row, id: `d${++seq}`, deliveredAt: null, verifiedAt: null }); },
    async deliveries(id) { return deliveries.filter((d) => d.challengeId === id); },
    async markDeliveriesVerified(id, now) { for (const d of deliveries) if (d.challengeId === id) d.verifiedAt ??= now; },
    async updateDeliveryStatus(pid, status, at, err) { const d = deliveries.find((x) => x.providerMessageId === pid); if (!d) return; if (status === "delivered" || status === "read") { d.status = status; d.deliveredAt ??= at; } else if (!d.deliveredAt) { d.status = status; d.errorCode = err ?? d.errorCode; } },
  };
  return { store, challenges, deliveries };
}

const clock = { now: new Date("2026-10-29T10:00:00Z") };
const advance = (s: number) => { clock.now = new Date(clock.now.getTime() + s * 1000); };

function setup(opts: { accounts?: Record<string, GuardianAccount[]>; notOnWa?: string[]; waOff?: boolean; limit?: number } = {}) {
  const mem = memoryStore();
  const outbox: Array<{ channel: OtpChannel; to: string; code: string; id: string }> = [];
  const counters = new Map<string, number>();
  let n = 0;
  const sender = (channel: OtpChannel): OtpSender | null => channel === "whatsapp" && opts.waOff ? null : ({
    channel, provider: "test",
    async send(m) {
      if (channel === "whatsapp" && opts.notOnWa?.includes(m.to)) return { ok: false, provider: "test", error: "x", notOnWhatsApp: true };
      const id = `${channel}-${++n}`; outbox.push({ channel, to: m.to, code: m.code, id }); return { ok: true, provider: "test", providerMessageId: id };
    },
  });
  const deps: OtpDeps = {
    store: mem.store, secret: "test-secret", env: {}, sender, now: () => clock.now,
    findGuardians: async (e164, schoolId) => (opts.accounts?.[e164] ?? []).filter((a) => !schoolId || a.schoolId === schoolId),
    rateLimit: async (scope, { limit }) => { const c = (counters.get(scope) ?? 0) + 1; counters.set(scope, c); return { ok: c <= Math.min(limit, opts.limit ?? limit) }; },
  };
  return { deps, outbox, ...mem };
}

const PHONE = "+923001234567";
const A = { userId: "u-a", schoolId: "school-a" }, B = { userId: "u-b", schoolId: "school-b" };

test("happy path: WhatsApp code verifies once and is not replayable", async () => {
  const t = setup({ accounts: { [PHONE]: [A] } });
  const r = await requestGuardianCode({ phone: "0300 1234567", defaultMarket: "PK", language: "ur", ip: "1.1.1.1", flowNonce: "n1" }, t.deps);
  assert.ok(r.ok && r.channel === "whatsapp");
  assert.equal(t.outbox[0].channel, "whatsapp");
  const code = t.outbox[0].code;
  assert.ok(![...t.challenges.values()].some((c) => c.codeHash.includes(code) || c.phoneHash.includes("300")), "no clear code or phone at rest");
  const ok = await verifyGuardianCode({ challengeId: r.challengeId, phone: PHONE, code, flowNonce: "n1", ip: "1.1.1.1" }, t.deps);
  assert.deepEqual(ok, { ok: true, account: A });
  const replay = await verifyGuardianCode({ challengeId: r.challengeId, phone: PHONE, code, flowNonce: "n1", ip: "1.1.1.1" }, t.deps);
  assert.deepEqual(replay, { ok: false, error: "invalid_or_expired" });
  assert.ok(t.deliveries[0].verifiedAt);
});

test("wrong code, attempt limit, other browser, other phone are rejected", async () => {
  const t = setup({ accounts: { [PHONE]: [A] } });
  const r = await requestGuardianCode({ phone: PHONE, language: "en", ip: "ip", flowNonce: "n" }, t.deps);
  assert.ok(r.ok);
  const code = t.outbox[0].code;
  assert.deepEqual(await verifyGuardianCode({ challengeId: r.challengeId, phone: PHONE, code, flowNonce: "other", ip: "ip" }, t.deps), { ok: false, error: "invalid_or_expired" });
  assert.deepEqual(await verifyGuardianCode({ challengeId: r.challengeId, phone: "+923009999999", code, flowNonce: "n", ip: "ip" }, t.deps), { ok: false, error: "invalid_or_expired" });
  const wrong = code === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i++) assert.equal((await verifyGuardianCode({ challengeId: r.challengeId, phone: PHONE, code: wrong, flowNonce: "n", ip: "ip" }, t.deps) as { error: string }).error, "wrong_code");
  assert.deepEqual(await verifyGuardianCode({ challengeId: r.challengeId, phone: PHONE, code, flowNonce: "n", ip: "ip" }, t.deps), { ok: false, error: "too_many_attempts" });
});

test("codes expire after 5 minutes and a new request supersedes the old one", async () => {
  const t = setup({ accounts: { [PHONE]: [A] } });
  const r1 = await requestGuardianCode({ phone: PHONE, language: "en", ip: "ip", flowNonce: "n" }, t.deps);
  const r2 = await requestGuardianCode({ phone: PHONE, language: "en", ip: "ip", flowNonce: "n" }, t.deps);
  assert.ok(r1.ok && r2.ok);
  assert.equal((await verifyGuardianCode({ challengeId: r1.challengeId, phone: PHONE, code: t.outbox[0].code, flowNonce: "n", ip: "ip" }, t.deps) as { error: string }).error, "invalid_or_expired");
  advance(301);
  assert.equal((await verifyGuardianCode({ challengeId: r2.challengeId, phone: PHONE, code: t.outbox[1].code, flowNonce: "n", ip: "ip" }, t.deps) as { error: string }).error, "invalid_or_expired");
});

test("rate limits per phone and per IP", async () => {
  const t = setup({ accounts: { [PHONE]: [A] } });
  for (let i = 0; i < 3; i++) assert.ok((await requestGuardianCode({ phone: PHONE, language: "en", ip: `ip${i}`, flowNonce: "n" }, t.deps)).ok);
  assert.deepEqual(await requestGuardianCode({ phone: PHONE, language: "en", ip: "ip9", flowNonce: "n" }, t.deps), { ok: false, error: "rate_limited", retryAfterSeconds: 600 });
  const u = setup({ limit: 2 });
  await requestGuardianCode({ phone: "+923001111111", language: "en", ip: "same", flowNonce: "n" }, u.deps);
  await requestGuardianCode({ phone: "+923002222222", language: "en", ip: "same", flowNonce: "n" }, u.deps);
  assert.equal((await requestGuardianCode({ phone: "+923003333333", language: "en", ip: "same", flowNonce: "n" }, u.deps) as { error: string }).error, "rate_limited");
});

test("unknown numbers get an identical response and nothing is sent", async () => {
  const t = setup();
  const r = await requestGuardianCode({ phone: PHONE, language: "en", ip: "ip", flowNonce: "n" }, t.deps);
  assert.ok(r.ok && r.channel === "whatsapp" && r.fallbackAfterSeconds === 30);
  assert.equal(t.outbox.length, 0);
  assert.equal(t.deliveries.length, 0);
  const s = await challengeStatus({ challengeId: r.challengeId, flowNonce: "n" }, t.deps);
  assert.ok(s.ok && s.whatsapp === "sent");
});

test("SMS fallback: immediate when not on WhatsApp, otherwise only after 30 s without delivery", async () => {
  const t = setup({ accounts: { [PHONE]: [A], "+966501234567": [B] }, notOnWa: ["+966501234567"] });
  const sa = await requestGuardianCode({ phone: "+966501234567", language: "ar", ip: "ip", flowNonce: "s" }, t.deps);
  assert.ok(sa.ok && sa.channel === "sms");
  assert.deepEqual(t.deliveries.map((d) => [d.channel, d.status, d.isFallback]), [["whatsapp", "not_on_whatsapp", false], ["sms", "sent", true]]);

  const r = await requestGuardianCode({ phone: PHONE, language: "en", ip: "ip", flowNonce: "n" }, t.deps);
  assert.ok(r.ok);
  assert.equal((await requestSmsFallback({ challengeId: r.challengeId, phone: PHONE, flowNonce: "n", ip: "ip" }, t.deps) as { error: string }).error, "fallback_not_ready");
  advance(31);
  assert.deepEqual(await requestSmsFallback({ challengeId: r.challengeId, phone: PHONE, flowNonce: "n", ip: "ip" }, t.deps), { ok: true, channel: "sms" });
  assert.equal((await requestSmsFallback({ challengeId: r.challengeId, phone: PHONE, flowNonce: "n", ip: "ip" }, t.deps) as { error: string }).error, "fallback_not_ready", "only once");
  const waCode = t.outbox.find((o) => o.channel === "whatsapp" && o.to === PHONE)!.code;
  assert.ok((await verifyGuardianCode({ challengeId: r.challengeId, phone: PHONE, code: waCode, flowNonce: "n", ip: "ip" }, t.deps)).ok, "late WhatsApp code still works");
});

test("delivered WhatsApp blocks fallback; webhook failure enables it at once", async () => {
  const t = setup({ accounts: { [PHONE]: [A] } });
  const r = await requestGuardianCode({ phone: PHONE, language: "en", ip: "ip", flowNonce: "n" }, t.deps);
  assert.ok(r.ok);
  const id = t.outbox[0].id;
  const body = (status: string, code?: number) => ({ entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: "PN" }, statuses: [{ id, status, timestamp: String(Math.floor(clock.now.getTime() / 1000)), errors: code ? [{ code }] : undefined }] } }] }] });
  assert.equal(await applyMetaStatuses(body("failed", 131026), t.store, "OTHER"), 0, "other numbers' receipts are ignored");
  await applyMetaStatuses(body("failed", 131026), t.store, "PN");
  const s = await challengeStatus({ challengeId: r.challengeId, flowNonce: "n" }, t.deps);
  assert.ok(s.ok && s.whatsapp === "not_on_whatsapp" && s.fallbackInSeconds === 0);
  assert.ok((await requestSmsFallback({ challengeId: r.challengeId, phone: PHONE, flowNonce: "n", ip: "ip" }, t.deps)).ok);

  const u = setup({ accounts: { [PHONE]: [A] } });
  const r2 = await requestGuardianCode({ phone: PHONE, language: "en", ip: "ip", flowNonce: "n" }, u.deps);
  assert.ok(r2.ok);
  await u.store.updateDeliveryStatus(u.outbox[0].id, "delivered", clock.now);
  advance(40);
  assert.equal((await requestSmsFallback({ challengeId: r2.challengeId, phone: PHONE, flowNonce: "n", ip: "ip" }, u.deps) as { error: string }).error, "fallback_not_ready");
});

test("tenant isolation: multi-school guardians choose only their own schools", async () => {
  const t = setup({ accounts: { [PHONE]: [A, B] } });
  const r = await requestGuardianCode({ phone: PHONE, language: "en", ip: "ip", flowNonce: "n" }, t.deps);
  assert.ok(r.ok);
  const code = t.outbox[0].code;
  const choose = await verifyGuardianCode({ challengeId: r.challengeId, phone: PHONE, code, flowNonce: "n", ip: "ip" }, t.deps);
  assert.deepEqual(choose, { ok: false, error: "choose_school", schoolIds: ["school-a", "school-b"] });
  const foreign = await verifyGuardianCode({ challengeId: r.challengeId, phone: PHONE, schoolId: "school-c", flowNonce: "n", ip: "ip" }, t.deps);
  assert.equal((foreign as { error: string }).error, "choose_school");
  assert.deepEqual(await verifyGuardianCode({ challengeId: r.challengeId, phone: PHONE, schoolId: "school-b", flowNonce: "n", ip: "ip" }, t.deps), { ok: true, account: B });
  assert.equal((await verifyGuardianCode({ challengeId: r.challengeId, phone: PHONE, schoolId: "school-a", flowNonce: "n", ip: "ip" }, t.deps) as { error: string }).error, "invalid_or_expired");
  // An unverified challenge cannot skip the code by naming a school.
  const r2 = await requestGuardianCode({ phone: PHONE, language: "en", ip: "ip", flowNonce: "m" }, t.deps);
  assert.ok(r2.ok);
  assert.equal((await verifyGuardianCode({ challengeId: r2.challengeId, phone: PHONE, schoolId: "school-a", flowNonce: "m", ip: "ip" }, t.deps) as { error: string }).error, "wrong_code");
});

test("staff second factor is bound to the user", async () => {
  const t = setup();
  const staff = { id: "staff-1", phone: "+971501234567" };
  const r = await requestStaffCode({ user: staff, language: "en", ip: "ip", flowNonce: "n" }, t.deps);
  assert.ok(r.ok);
  const code = t.outbox[0].code;
  assert.equal((await verifyStaffCode({ challengeId: r.challengeId, code, flowNonce: "n", user: { id: "staff-2", phone: staff.phone }, ip: "ip" }, t.deps) as { error: string }).error, "invalid_or_expired");
  assert.equal((await verifyGuardianCode({ challengeId: r.challengeId, phone: staff.phone, code, flowNonce: "n", ip: "ip" }, t.deps) as { error: string }).error, "invalid_or_expired", "purposes do not cross");
  assert.deepEqual(await verifyStaffCode({ challengeId: r.challengeId, code, flowNonce: "n", user: staff, ip: "ip" }, t.deps), { ok: true });
});

test("WhatsApp off falls straight to SMS; Twilio receipts are signature-checked", async () => {
  const t = setup({ accounts: { [PHONE]: [A] }, waOff: true });
  const r = await requestGuardianCode({ phone: PHONE, language: "en", ip: "ip", flowNonce: "n" }, t.deps);
  assert.ok(r.ok && r.channel === "sms");
  const params = new URLSearchParams({ MessageSid: t.outbox[0].id, MessageStatus: "delivered" });
  const url = "https://app.example/api/auth/otp/sms-status";
  const sig = createHmac("sha1", "tok").update(url + "MessageSid" + t.outbox[0].id + "MessageStatus" + "delivered").digest("base64");
  assert.ok(verifiedTwilioSignature(url, params, sig, "tok"));
  assert.ok(!verifiedTwilioSignature(url, params, sig, "other"));
  await applyTwilioStatus(params, t.store, clock.now);
  assert.ok(t.deliveries.at(-1)!.deliveredAt);
});

test("metrics: delivered-within-30s, verified, cost per verified sign-in", () => {
  const at = new Date("2026-10-29T10:00:00Z");
  const row = (o: Partial<DeliveryRow>): DeliveryRow => ({ id: "x", challengeId: "c1", market: "PK", channel: "whatsapp", provider: "t", providerMessageId: null, isFallback: false, status: "delivered", errorCode: null, costMicroUsd: 10_000, costVerified: false, sentAt: at, deliveredAt: new Date(at.getTime() + 5_000), verifiedAt: at, ...o });
  const m = otpMetrics([row({}), row({ challengeId: "c2", deliveredAt: new Date(at.getTime() + 60_000), verifiedAt: null }), row({ challengeId: "c3", status: "sent", deliveredAt: null, verifiedAt: null }), row({ challengeId: "c3", channel: "sms", isFallback: true, status: "sent", costMicroUsd: 470_000, deliveredAt: null, verifiedAt: at })]);
  const wa = m.byChannel.find((g) => g.channel === "whatsapp")!;
  assert.equal(wa.sent, 3); assert.equal(wa.deliveredWithin30s, 1); assert.equal(wa.costMicroUsd, 20_000);
  const pk = m.byMarket[0];
  assert.equal(pk.challenges, 3); assert.equal(pk.verified, 2);
  assert.equal(pk.costPerVerifiedUsd, 0.49 / 2);
});
