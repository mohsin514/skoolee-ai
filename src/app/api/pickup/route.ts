import { NextRequest } from "next/server";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { guardianPickups, issueAuthorization, reissueCode, revokeAuthorization } from "@/lib/pickup/service";

export const runtime = "nodejs";

// SKO-438: a guardian's pickup authorizations for one child. GET ?studentId · POST {action: issue | code | revoke}.
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    return Response.json({ success: true, data: await guardianPickups(user, request.nextUrl.searchParams.get("studentId") ?? "") }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error, "[pickup] GET failed"); }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const headers = { "Cache-Control": "private, no-store" };
    if (body.action === "issue") return Response.json({ success: true, data: await issueAuthorization(user, body) }, { status: 201, headers });
    if (body.action === "code") return Response.json({ success: true, data: await reissueCode(user, String(body.id ?? "")) }, { headers });
    if (body.action === "revoke") return Response.json({ success: true, data: await revokeAuthorization(user, String(body.id ?? "")) });
    throw new ApiError("Unknown action", 400);
  } catch (error) { return errorResponse(error, "[pickup] POST failed"); }
}
