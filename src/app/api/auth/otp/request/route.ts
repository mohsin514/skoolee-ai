// SKAI-954: guardian phone sign-in, step 1 — send a WhatsApp (or SMS) code.
import { NextResponse, type NextRequest } from "next/server";
import { requestGuardianCode } from "@/lib/auth/otp/service";
import { otpDeps } from "@/lib/auth/otp/store";
import { otpLanguage } from "@/lib/auth/otp/copy";
import { defaultMarket, newFlowNonce, otpError, readOtpRequest, setFlowCookie } from "@/lib/auth/otp/http";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const input = await readOtpRequest(req);
  if (input instanceof Response) return input;
  try {
    const nonce = newFlowNonce();
    const result = await requestGuardianCode({ phone: input.body.phone, language: otpLanguage(input.body.language), ip: input.ip, flowNonce: nonce, defaultMarket: defaultMarket(input.body) }, otpDeps());
    if (!result.ok) return otpError(result.error, result.retryAfterSeconds);
    const res = NextResponse.json(result);
    setFlowCookie(res, nonce);
    return res;
  } catch (error) {
    console.error("[auth/otp/request]", error instanceof Error ? error.message : "error");
    return otpError("unavailable");
  }
}
