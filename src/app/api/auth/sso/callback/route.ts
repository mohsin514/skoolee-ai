import { NextRequest, NextResponse } from "next/server";
import { ApiError, errorResponse } from "@/lib/api/scope";
import { prisma } from "@/lib/db/prisma";
import { runUnscoped, runWithTenantContext } from "@/lib/db/tenant-context";
import { completeSignIn } from "@/lib/identity/service";
import { issueSession } from "@/lib/auth/issue-session";
import { needsMfaChallenge } from "@/lib/auth/mfa-crypto";
import { startMfa } from "@/lib/auth/mfa-ticket";
import { clearedSessionCookieAttributes } from "@/lib/auth/session-cookie";

export const runtime = "nodejs";

// SKO-446: POST {code, state} from /sso/callback. A linked, active account gets the same session as a password
// sign-in — through the MFA challenge when the account needs one, with its current access version.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as { code?: string; state?: string };
    const stateToken = request.cookies.get("sk_sso_state")?.value;
    if (!stateToken || !body.code || !body.state) throw new ApiError("This sign-in attempt expired. Start again.", 400);
    const result = await completeSignIn(stateToken, String(body.code), String(body.state));
    let response: NextResponse;
    if (result.kind === "PENDING") response = NextResponse.json({ success: false, pending: true, error: result.message }, { status: 202 });
    else {
      const user = await runUnscoped("sso: load the linked account to issue its session", () => prisma.user.findUniqueOrThrow({ where: { id: result.userId } }));
      response = await runWithTenantContext({ schoolId: user.schoolId }, async () => needsMfaChallenge(user) ? startMfa(user, 7) : issueSession(user, 7, false, request));
    }
    response.cookies.set("sk_sso_state", "", clearedSessionCookieAttributes());
    return response;
  } catch (error) { return errorResponse(error, "[auth/sso] callback failed"); }
}
