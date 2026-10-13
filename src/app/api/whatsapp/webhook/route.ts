import { verifiedMetaSignature, recordMetaReceipts } from "@/lib/jobs/receipts";
import { NextRequest } from "next/server";
import { handleVerifiedGuardianMessage } from "@/lib/whatsapp/inbound-guardian";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && VERIFY_TOKEN && token === VERIFY_TOKEN) {
    return new Response(challenge || "", { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  try {
    const reader = req.body?.getReader(); if (!reader) return Response.json({ error: "Missing body" }, { status: 400 });
    const parts: Uint8Array[] = []; let bytes = 0;
    while (true) { const next = await reader.read(); if (next.done) break; bytes += next.value.byteLength; if (bytes > 1000000) { await reader.cancel(); return Response.json({ error: "Webhook body too large" }, { status: 413 }); } parts.push(next.value); }
    const raw = Buffer.concat(parts).toString("utf8");
    if (!verifiedMetaSignature(raw, req.headers.get("x-hub-signature-256"), process.env.WHATSAPP_APP_SECRET)) return Response.json({ error: "Invalid signature" }, { status: 401 });
    const body = JSON.parse(raw);
    await recordMetaReceipts(body);
    const entries = body?.entry;
    if (!Array.isArray(entries)) return Response.json({ status: "ok" });

    for (const entry of entries) {
      const changes = entry?.changes;
      if (!Array.isArray(changes)) continue;

      for (const change of changes) {
        if (change?.field !== "messages" || !process.env.WHATSAPP_PHONE_NUMBER_ID || change?.value?.metadata?.phone_number_id !== process.env.WHATSAPP_PHONE_NUMBER_ID) continue;
        const messages = change?.value?.messages;
        if (!Array.isArray(messages)) continue;

        for (const msg of messages) {
          if (msg.type !== "text") continue;
          const from = msg.from, text = msg.text?.body, at = Number(msg.timestamp) * 1000;
          if (typeof from !== "string" || from.length > 30 || typeof text !== "string" || typeof msg.id !== "string" || !Number.isFinite(at) || at < Date.now() - 86400000 || at > Date.now() + 300000) continue;
          await handleVerifiedGuardianMessage({ id: msg.id, phone: from, text });
        }
      }
    }

    return Response.json({ status: "ok" });
  } catch {
    // Do not acknowledge verified receipt events that were not durably stored.
    return Response.json({ error: "Webhook processing unavailable" }, { status: 500 });
  }
}
