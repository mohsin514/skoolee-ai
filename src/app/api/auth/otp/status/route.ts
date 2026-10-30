import type { NextRequest } from "next/server";
import { challengeStatus } from "@/lib/auth/otp/service";
import { otpDeps } from "@/lib/auth/otp/store";
import { otpError, readOtpRequest } from "@/lib/auth/otp/http";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const input = await readOtpRequest(req);
  if (input instanceof Response) return input;
  const result = await challengeStatus({ challengeId: input.body.challengeId, flowNonce: input.flowNonce ?? "" }, otpDeps());
  return result.ok ? Response.json(result) : otpError(result.error);
}
