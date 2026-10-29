import type { NextRequest } from "next/server";
import { requestSmsFallback } from "@/lib/auth/otp/service";
import { otpDeps } from "@/lib/auth/otp/store";
import { defaultMarket, otpError, readOtpRequest } from "@/lib/auth/otp/http";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const input = await readOtpRequest(req);
  if (input instanceof Response) return input;
  const result = await requestSmsFallback({ challengeId: input.body.challengeId, phone: input.body.phone, flowNonce: input.flowNonce ?? "", ip: input.ip, defaultMarket: defaultMarket(input.body) }, otpDeps());
  return result.ok ? Response.json(result) : otpError(result.error, result.retryAfterSeconds);
}
