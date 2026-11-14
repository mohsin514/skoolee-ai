import { NextRequest } from "next/server";
import { ApiError, requireAuthUser } from "@/lib/api/scope";
import { failFrom, ok } from "@/lib/api/envelope";
import { guardianPickups, issueAuthorization, reissueCode, revokeAuthorization } from "@/lib/pickup/service";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };

// SKO-438: a guardian's pickup authorizations for one child. GET ?studentId · POST {action: issue | code | revoke}.
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    return ok(await guardianPickups(user, request.nextUrl.searchParams.get("studentId") ?? "", request.nextUrl.searchParams.get("cursor")), { headers });
  } catch (error) { return failFrom(error, "[pickup] GET failed"); }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (body.action === "issue") return ok(await issueAuthorization(user, body), { status: 201, headers });
    if (body.action === "code") return ok(await reissueCode(user, String(body.id ?? "")), { headers });
    if (body.action === "revoke") return ok(await revokeAuthorization(user, String(body.id ?? "")), { headers });
    throw new ApiError("Unknown action", 400);
  } catch (error) { return failFrom(error, "[pickup] POST failed"); }
}
