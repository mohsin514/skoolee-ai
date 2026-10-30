import { NextRequest } from "next/server";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { connect, connectionStatus, disconnect } from "@/lib/whatsapp/connection";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };
const ok = (data: unknown) => Response.json({ success: true, data }, { headers });

// SKAI-1045: the school's own WhatsApp Business Account. GET status; POST {action: connect | disconnect}.
// Human-only (AI exclusion): connecting grants Meta-billed sending on the school's own account.
export async function GET() {
  try { return ok(await connectionStatus(await requireAuthUser())); }
  catch (error) { return errorResponse(error, "[whatsapp-connection] GET failed"); }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    switch (body.action) {
      case "connect": return ok(await connect(user, body));
      case "disconnect": return ok(await disconnect(user));
      default: throw new ApiError("Unknown action", 400);
    }
  } catch (error) { return errorResponse(error, "[whatsapp-connection] POST failed"); }
}
