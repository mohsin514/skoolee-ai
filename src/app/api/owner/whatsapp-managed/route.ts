import { NextRequest } from "next/server";
import { ApiError, errorResponse, requirePlatformOwner } from "@/lib/api/scope";
import { runWithTenantContext } from "@/lib/db/tenant-context";
import { ownerAction } from "@/lib/whatsapp/managed";

export const runtime = "nodejs";

// SKAI-1046: platform owner provisions a school's managed number or credits a paid top-up.
// POST {schoolId, action: provision, phoneNumberId} | {schoolId, action: top-up, amountMicroUsd, reference}.
// Human-only (AI exclusion): credit follows a real payment.
export async function POST(request: NextRequest) {
  try {
    const owner = await requirePlatformOwner();
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const schoolId = String(body.schoolId ?? "");
    if (!schoolId) throw new ApiError("Choose a school.", 400);
    const data = await runWithTenantContext({ schoolId, userId: owner.userId, role: owner.role }, () => ownerAction(owner, schoolId, body));
    return Response.json({ success: true, data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error, "[owner-whatsapp-managed] POST failed"); }
}
