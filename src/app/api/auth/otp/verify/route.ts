import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { runUnscoped } from "@/lib/db/tenant-context";
import { verifyGuardianCode } from "@/lib/auth/otp/service";
import { otpDeps } from "@/lib/auth/otp/store";
import { clearFlowCookie, defaultMarket, otpError, readOtpRequest } from "@/lib/auth/otp/http";
import { needsMfaChallenge } from "@/lib/auth/mfa-crypto";
import { startMfa } from "@/lib/auth/mfa-ticket";
import { issueSession } from "@/lib/auth/issue-session";
import { SESSION_COOKIE_NAME, SESSION_DAYS } from "@/lib/auth/session-cookie";
import { endSession } from "@/lib/auth/session-revocation";
import { applySignInLanguage } from "@/lib/locale/sign-in-language";

export const runtime = "nodejs";

/** POST /api/auth/otp/verify — guardian phone sign-in step 2; issues the session. */
export async function POST(req: NextRequest) {
  const input = await readOtpRequest(req);
  if (input instanceof Response) return input;
  return runUnscoped("phone OTP verify: account resolved by verified phone before school is known", async () => {
    try {
      const { body } = input;
      const result = await verifyGuardianCode({ challengeId: body.challengeId, phone: body.phone, code: body.code, schoolId: body.schoolId, flowNonce: input.flowNonce ?? "", ip: input.ip, defaultMarket: defaultMarket(body) }, otpDeps());
      if (!result.ok && "schoolIds" in result) {
        const schools = await prisma.school.findMany({ where: { id: { in: result.schoolIds } }, select: { id: true, name: true, city: true, logoUrl: true } });
        return NextResponse.json({ needsSchoolSelection: true, schools: schools.map((s) => ({ schoolId: s.id, schoolName: s.name, schoolCity: s.city, logoUrl: s.logoUrl, campusName: null, role: "PARENT" })) });
      }
      if (!result.ok) return otpError(result.error, "retryAfterSeconds" in result ? result.retryAfterSeconds : undefined);
      const user = await prisma.user.findFirst({ where: { id: result.account.userId, schoolId: result.account.schoolId, role: "PARENT", isActive: true } });
      if (!user) return otpError("invalid_or_expired");
      const prior = req.cookies.get(SESSION_COOKIE_NAME)?.value;
      if (prior) await endSession(prior);
      const days = body.rememberMe === true ? SESSION_DAYS.remembered : SESSION_DAYS.default;
      // A guardian who turned on an authenticator still completes it after the phone code.
      if (needsMfaChallenge(user)) {
        const res = await startMfa(user, days);
        clearFlowCookie(res);
        return res;
      }
      const res = await issueSession(user, days, false, req);
      await applySignInLanguage(user, body, res);
      clearFlowCookie(res);
      return res;
    } catch (error) {
      console.error("[auth/otp/verify]", error instanceof Error ? error.message : "error");
      return otpError("unavailable");
    }
  });
}
