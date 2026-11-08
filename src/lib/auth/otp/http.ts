import "server-only";
import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { requestHasSameOrigin } from "@/lib/auth/same-origin-policy";
import { clientIp } from "@/lib/http/client-ip";
import { phoneOtpEnabled } from "./store";
import type { OtpMarket } from "./markets";

export const OTP_FLOW_COOKIE = "skoolee-otp-flow";

/** Shared gate for the OTP JSON endpoints: flag, JSON, same-origin, body parse. */
export async function readOtpRequest(req: NextRequest): Promise<{ body: Record<string, unknown>; ip: string; flowNonce: string | null } | Response> {
  if (!phoneOtpEnabled()) return Response.json({ error: "Phone sign-in is not available" }, { status: 404 });
  const type = req.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (type !== "application/json" || !requestHasSameOrigin(req)) return Response.json({ error: "Unsupported request" }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "Invalid request" }, { status: 400 });
  return { body: body as Record<string, unknown>, ip: clientIp(req.headers), flowNonce: req.cookies.get(OTP_FLOW_COOKIE)?.value ?? null };
}

export function newFlowNonce() { return randomBytes(32).toString("base64url"); }

export function setFlowCookie(res: NextResponse, nonce: string) {
  res.cookies.set(OTP_FLOW_COOKIE, nonce, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/api/auth/otp", maxAge: 600 });
}

export function clearFlowCookie(res: Response | NextResponse) {
  if (res instanceof NextResponse) res.cookies.set(OTP_FLOW_COOKIE, "", { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/api/auth/otp", maxAge: 0 });
}

const STATUS: Record<string, number> = { invalid_phone: 400, rate_limited: 429, unavailable: 503, invalid_or_expired: 400, wrong_code: 400, too_many_attempts: 429, fallback_not_ready: 409 };

export function otpError(error: string, retryAfterSeconds?: number) {
  const headers: Record<string, string> = retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : {};
  return NextResponse.json({ error, retryAfterSeconds }, { status: STATUS[error] ?? 400, headers });
}

export function defaultMarket(body: Record<string, unknown>): OtpMarket | undefined {
  return body.market === "PK" || body.market === "SA" || body.market === "AE" ? body.market : undefined;
}
