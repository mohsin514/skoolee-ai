import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePhone, phoneVariants, marketConfig } from "../../src/lib/auth/otp/markets";
import { authTemplateDefinitions, authTemplateMessage } from "../../src/lib/auth/otp/templates";
import { senderFor, mockOutbox } from "../../src/lib/auth/otp/senders";
import { smsBody } from "../../src/lib/auth/otp/copy";

test("normalizes PK, SA and AE numbers and rejects others", () => {
  assert.deepEqual(normalizePhone("+92 300 1234567"), { e164: "+923001234567", market: "PK" });
  assert.deepEqual(normalizePhone("03001234567", "PK"), { e164: "+923001234567", market: "PK" });
  assert.deepEqual(normalizePhone("00966501234567"), { e164: "+966501234567", market: "SA" });
  assert.deepEqual(normalizePhone("+971501234567"), { e164: "+971501234567", market: "AE" });
  for (const bad of ["+14155550100", "03001234567", "+92300", "+92 300 12345678", "abc", 42, "+920001234567"]) assert.equal(normalizePhone(bad), null, String(bad));
  assert.ok(phoneVariants("+923001234567").includes("03001234567"));
});

test("market primary channel can be switched per market by env", () => {
  assert.equal(marketConfig("PK", {}).primary, "whatsapp");
  assert.equal(marketConfig("PK", { OTP_PRIMARY_CHANNEL_PK: "sms" }).primary, "sms");
  assert.equal(marketConfig("SA", { OTP_PRIMARY_CHANNEL_PK: "sms" }).primary, "whatsapp");
  assert.equal(marketConfig("AE", { OTP_FALLBACK_AFTER_SECONDS: "5" }).fallbackAfterSeconds, 30);
});

test("authentication templates are copy-code in EN/UR/AR with 5-minute expiry", () => {
  const defs = authTemplateDefinitions();
  assert.deepEqual(defs.map((d) => d.language), ["en", "ur", "ar"]);
  for (const d of defs) {
    assert.equal(d.category, "AUTHENTICATION");
    assert.deepEqual(d.components[1], { type: "FOOTER", code_expiration_minutes: 5 });
    const buttons = d.components[2];
    assert.ok(buttons.type === "BUTTONS" && buttons.buttons[0].otp_type === "COPY_CODE");
  }
  const msg = authTemplateMessage("+923001234567", "123456", "ur");
  assert.equal(msg.to, "923001234567");
  assert.equal(msg.template.language.code, "ur");
  assert.equal(msg.template.components[1].parameters[0].text, "123456");
});

test("senders are off by default, mock refused in production, outbound kill switch honoured", () => {
  assert.equal(senderFor("whatsapp", {}), null);
  assert.equal(senderFor("sms", { OTP_SMS_PROVIDER: "mock", NODE_ENV: "production" }), null);
  assert.equal(senderFor("sms", { OTP_SMS_PROVIDER: "mock", DISABLE_OUTBOUND_MESSAGES: "true" }), null);
  assert.equal(senderFor("whatsapp", { OTP_WHATSAPP_PROVIDER: "meta" }), null, "meta without credentials is off");
});

test("mock sender records messages and simulates not-on-WhatsApp", async () => {
  const wa = senderFor("whatsapp", { OTP_WHATSAPP_PROVIDER: "mock", OTP_MOCK_NOT_ON_WHATSAPP: "+971501234567" })!;
  const ok = await wa.send({ to: "+923001234567", code: "111222", language: "en", ttlMinutes: 5 });
  assert.equal(ok.ok, true);
  assert.equal(mockOutbox.at(-1)?.code, "111222");
  const no = await wa.send({ to: "+971501234567", code: "111222", language: "en", ttlMinutes: 5 });
  assert.deepEqual(no.ok ? null : no.notOnWhatsApp, true);
});

test("meta and twilio adapters send the expected requests without real network", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fake = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (url.includes("graph")) return new Response(JSON.stringify({ error: { code: 131026 } }), { status: 400 });
    return new Response(JSON.stringify({ sid: "SM123" }), { status: 201 });
  }) as unknown as typeof fetch;
  const wa = senderFor("whatsapp", { OTP_WHATSAPP_PROVIDER: "meta", OTP_WHATSAPP_PHONE_NUMBER_ID: "PNID", OTP_WHATSAPP_ACCESS_TOKEN: "t" }, fake)!;
  const r = await wa.send({ to: "+923001234567", code: "123456", language: "en", ttlMinutes: 5 });
  assert.deepEqual(r, { ok: false, provider: "meta", error: "meta:131026", notOnWhatsApp: true });
  assert.match(calls[0].url, /graph\.facebook\.com\/v21\.0\/PNID\/messages$/);
  const sms = senderFor("sms", { OTP_SMS_PROVIDER: "twilio", TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "x" }, fake)!;
  const s = await sms.send({ to: "+966501234567", code: "123456", language: "ar", ttlMinutes: 5, smsFrom: "Skoolee" });
  assert.deepEqual(s, { ok: true, provider: "twilio", providerMessageId: "SM123" });
  const body = new URLSearchParams(String(calls[1].init.body));
  assert.equal(body.get("From"), "Skoolee");
  assert.equal(body.get("Body"), smsBody("123456", "ar", 5));
});
