// SKAI-954: provider delivery receipts → OtpDelivery status (V5/V6 metrics, WhatsApp→SMS fallback).
import { createHmac, timingSafeEqual } from "node:crypto";
import type { OtpStore } from "./service";
import { META_NOT_ON_WHATSAPP_CODES } from "./senders";

type MetaStatus = { id?: unknown; status?: unknown; timestamp?: unknown; errors?: Array<{ code?: unknown }> };

export async function applyMetaStatuses(body: unknown, store: Pick<OtpStore, "updateDeliveryStatus">, phoneNumberId: string | undefined) {
  const entries = (body as { entry?: Array<{ changes?: Array<{ field?: string; value?: { metadata?: { phone_number_id?: string }; statuses?: MetaStatus[] } }> }> })?.entry;
  if (!Array.isArray(entries) || !phoneNumberId) return 0;
  let applied = 0;
  for (const change of entries.flatMap((e) => e.changes ?? [])) {
    if (change.field !== "messages" || change.value?.metadata?.phone_number_id !== phoneNumberId) continue;
    for (const s of change.value?.statuses ?? []) {
      if (typeof s.id !== "string" || s.id.length > 512 || typeof s.status !== "string" || typeof s.timestamp !== "string" || !/^\d{1,12}$/.test(s.timestamp)) continue;
      const code = s.errors?.[0]?.code != null ? String(s.errors[0].code) : undefined;
      const status = s.status === "failed" && code && META_NOT_ON_WHATSAPP_CODES.has(code) ? "not_on_whatsapp" : s.status;
      if (!["delivered", "read", "failed", "not_on_whatsapp"].includes(status)) continue;
      await store.updateDeliveryStatus(s.id, status, new Date(Number(s.timestamp) * 1000), code ? `meta:${code}` : undefined);
      applied++;
    }
  }
  return applied;
}

/** Twilio request validation: HMAC-SHA1(authToken, url + sorted key/value pairs), base64. */
export function verifiedTwilioSignature(url: string, params: URLSearchParams, signature: string | null, authToken: string | undefined) {
  if (!authToken || !signature || !url) return false;
  const keys = [...new Set(params.keys())].sort();
  const data = url + keys.map((k) => k + params.getAll(k).join("")).join("");
  const expected = createHmac("sha1", authToken).update(data).digest();
  const given = Buffer.from(signature, "base64");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function applyTwilioStatus(params: URLSearchParams, store: Pick<OtpStore, "updateDeliveryStatus">, now = new Date()) {
  const sid = params.get("MessageSid"), status = params.get("MessageStatus");
  if (!sid || !status) return false;
  const mapped = status === "delivered" ? "delivered" : status === "failed" || status === "undelivered" ? "failed" : null;
  if (!mapped) return false;
  await store.updateDeliveryStatus(sid, mapped, now, params.get("ErrorCode") ? `twilio:${params.get("ErrorCode")}` : undefined);
  return true;
}
