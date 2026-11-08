// SKAI-954: Twilio-compatible SMS status callback (X-Twilio-Signature verified).
import type { NextRequest } from "next/server";
import { prismaOtpStore } from "@/lib/auth/otp/store";
import { applyTwilioStatus, verifiedTwilioSignature } from "@/lib/auth/otp/receipts";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (raw.length > 100_000) return new Response("Too large", { status: 413 });
  const params = new URLSearchParams(raw);
  const appUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  if (!verifiedTwilioSignature(`${appUrl}/api/auth/otp/sms-status`, params, req.headers.get("x-twilio-signature"), process.env.TWILIO_AUTH_TOKEN)) return new Response("Invalid signature", { status: 401 });
  await applyTwilioStatus(params, prismaOtpStore);
  return new Response(null, { status: 204 });
}
