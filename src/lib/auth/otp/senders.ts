// SKAI-1061: OTP sender adapters. Every real provider sits behind an env flag and
// defaults off; tests and local dev use the in-memory mock, which never sends.
//
//   OTP_WHATSAPP_PROVIDER = meta | mock | disabled (default disabled)
//   OTP_SMS_PROVIDER      = twilio | mock | disabled (default disabled)
//
// The OTP WhatsApp number is Skoolee-owned and separate from any school's number
// (the D3 exception for authentication), so it has its own credentials.

import { authTemplateMessage, AUTH_TEMPLATE_NAME } from "./templates";
import { smsBody, type OtpLanguage } from "./copy";
import type { OtpChannel } from "./markets";

export type SendResult =
  | { ok: true; provider: string; providerMessageId: string }
  | { ok: false; provider: string; error: string; notOnWhatsApp?: boolean };

export type OtpMessage = { to: string; code: string; language: OtpLanguage; ttlMinutes: number; smsFrom?: string; statusCallbackUrl?: string };

export interface OtpSender {
  channel: OtpChannel;
  provider: string;
  send(message: OtpMessage): Promise<SendResult>;
}

type Env = Record<string, string | undefined>;
type Fetch = typeof fetch;

/** Meta error codes meaning "this number cannot receive WhatsApp" (fall back to SMS now). */
export const META_NOT_ON_WHATSAPP_CODES = new Set(["131026", "131030", "1013"]);

// ── Mock (tests, local dev) ──────────────────────────────────────
export const mockOutbox: Array<{ channel: OtpChannel; to: string; code: string; language: OtpLanguage; id: string }> = [];
let mockSeq = 0;

function mockSender(channel: OtpChannel, env: Env): OtpSender {
  const notOnWa = new Set((env.OTP_MOCK_NOT_ON_WHATSAPP || "").split(",").map((s) => s.trim()).filter(Boolean));
  return {
    channel,
    provider: "mock",
    async send(m) {
      if (channel === "whatsapp" && notOnWa.has(m.to)) return { ok: false, provider: "mock", error: "not on WhatsApp", notOnWhatsApp: true };
      const id = `mock-${channel}-${++mockSeq}`;
      mockOutbox.push({ channel, to: m.to, code: m.code, language: m.language, id });
      // Never in production: the mock is refused there by senderFor().
      if (env.NODE_ENV === "development") console.info(`[otp:mock] ${channel} to ${m.to.slice(0, 4)}… code ${m.code}`);
      return { ok: true, provider: "mock", providerMessageId: id };
    },
  };
}

// ── Meta WhatsApp Cloud API ──────────────────────────────────────
function metaSender(env: Env, doFetch: Fetch): OtpSender | null {
  const phoneNumberId = env.OTP_WHATSAPP_PHONE_NUMBER_ID, token = env.OTP_WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !token) return null;
  const base = env.OTP_WHATSAPP_API_URL || "https://graph.facebook.com/v21.0";
  const template = env.OTP_WHATSAPP_TEMPLATE_NAME || AUTH_TEMPLATE_NAME;
  return {
    channel: "whatsapp",
    provider: "meta",
    async send(m) {
      try {
        const res = await doFetch(`${base}/${encodeURIComponent(phoneNumberId)}/messages`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(authTemplateMessage(m.to, m.code, m.language, template)),
          signal: AbortSignal.timeout(8_000),
        });
        const json = (await res.json().catch(() => ({}))) as { messages?: Array<{ id?: string }>; error?: { code?: number | string; message?: string } };
        const id = json.messages?.[0]?.id;
        if (res.ok && id) return { ok: true, provider: "meta", providerMessageId: id };
        const code = String(json.error?.code ?? res.status);
        return { ok: false, provider: "meta", error: `meta:${code}`, notOnWhatsApp: META_NOT_ON_WHATSAPP_CODES.has(code) };
      } catch {
        return { ok: false, provider: "meta", error: "meta:network" };
      }
    },
  };
}

// ── Twilio-compatible SMS (Twilio, or an aggregator exposing the same API) ──
function twilioSender(env: Env, doFetch: Fetch): OtpSender | null {
  const sid = env.TWILIO_ACCOUNT_SID, auth = env.TWILIO_AUTH_TOKEN;
  if (!sid || !auth) return null;
  const base = env.OTP_SMS_API_BASE || "https://api.twilio.com";
  return {
    channel: "sms",
    provider: "twilio",
    async send(m) {
      const from = m.smsFrom || env.TWILIO_MESSAGING_SERVICE_SID;
      if (!from) return { ok: false, provider: "twilio", error: "twilio:no-sender" };
      const form = new URLSearchParams({ To: m.to, Body: smsBody(m.code, m.language, m.ttlMinutes) });
      if (from.startsWith("MG")) form.set("MessagingServiceSid", from); else form.set("From", from);
      if (m.statusCallbackUrl) form.set("StatusCallback", m.statusCallbackUrl);
      try {
        const res = await doFetch(`${base}/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
          method: "POST",
          headers: { Authorization: `Basic ${Buffer.from(`${sid}:${auth}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
          body: form.toString(),
          signal: AbortSignal.timeout(8_000),
        });
        const json = (await res.json().catch(() => ({}))) as { sid?: string; code?: number };
        if (res.ok && json.sid) return { ok: true, provider: "twilio", providerMessageId: json.sid };
        return { ok: false, provider: "twilio", error: `twilio:${json.code ?? res.status}` };
      } catch {
        return { ok: false, provider: "twilio", error: "twilio:network" };
      }
    },
  };
}

/** The configured sender for a channel, or null when that channel is off or unconfigured. */
export function senderFor(channel: OtpChannel, env: Env = process.env, doFetch: Fetch = fetch): OtpSender | null {
  if (env.DISABLE_OUTBOUND_MESSAGES === "true") return null;
  const choice = (channel === "whatsapp" ? env.OTP_WHATSAPP_PROVIDER : env.OTP_SMS_PROVIDER)?.toLowerCase() || "disabled";
  if (choice === "mock") return env.NODE_ENV === "production" && env.OTP_ALLOW_MOCK_IN_PRODUCTION !== "true" ? null : mockSender(channel, env);
  if (channel === "whatsapp" && choice === "meta") return metaSender(env, doFetch);
  if (channel === "sms" && choice === "twilio") return twilioSender(env, doFetch);
  return null;
}
