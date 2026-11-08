import { NextRequest } from "next/server";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { setEnabled, usage } from "@/lib/whatsapp/managed";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };
const ok = (data: unknown) => Response.json({ success: true, data }, { headers });

// SKAI-1046: the school's managed-sending add-on. GET usage + ledger; POST {action: enable | disable}.
// Human-only (AI exclusion): opting into paid sending is the institution authority's decision.
export async function GET() {
  try { return ok(await usage(await requireAuthUser())); }
  catch (error) { return errorResponse(error, "[whatsapp-managed] GET failed"); }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (body.action !== "enable" && body.action !== "disable") throw new ApiError("Unknown action", 400);
    return ok(await setEnabled(user, body.action === "enable"));
  } catch (error) { return errorResponse(error, "[whatsapp-managed] POST failed"); }
}
