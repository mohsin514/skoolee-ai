// SKAI-954: delivery receipts for the Skoolee-owned authentication WABA (OTP metrics + fallback).
import type { NextRequest } from "next/server";
import { verifiedMetaSignature } from "@/lib/jobs/receipts";
import { prismaOtpStore } from "@/lib/auth/otp/store";
import { applyMetaStatuses } from "@/lib/auth/otp/receipts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const p = new URL(req.url).searchParams;
  const token = process.env.OTP_WHATSAPP_VERIFY_TOKEN;
  return p.get("hub.mode") === "subscribe" && token && p.get("hub.verify_token") === token ? new Response(p.get("hub.challenge") || "") : new Response("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (raw.length > 1_000_000) return Response.json({ error: "Too large" }, { status: 413 });
  if (!verifiedMetaSignature(raw, req.headers.get("x-hub-signature-256"), process.env.OTP_WHATSAPP_APP_SECRET)) return Response.json({ error: "Invalid signature" }, { status: 401 });
  try {
    await applyMetaStatuses(JSON.parse(raw), prismaOtpStore, process.env.OTP_WHATSAPP_PHONE_NUMBER_ID);
    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ error: "Unavailable" }, { status: 500 });
  }
}
