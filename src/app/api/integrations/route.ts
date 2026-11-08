import { NextRequest } from "next/server";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import * as integrations from "@/lib/integrations/service";
import { isInstitutionAuthority } from "@/lib/auth/institution";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };
const ok = (data: unknown, status = 200) => Response.json({ success: true, data }, { status, headers });

// SKO-445: integration administration. GET ?view=connections | deliveries&connectionId=&status= | delivery&id=.
// POST {action: create | rotate-key | revoke-key | rotate-signing | status | webhook | test | replay | deliver-now}.
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const p = request.nextUrl.searchParams;
    switch (p.get("view") ?? "connections") {
      case "connections": return ok(await integrations.connections(user));
      case "deliveries": return ok(await integrations.deliveries(user, p.get("connectionId") ?? "", p.get("status")));
      case "delivery": return ok(await integrations.deliveryDetail(user, p.get("id") ?? ""));
      default: throw new ApiError("Unknown view", 400);
    }
  } catch (error) { return errorResponse(error, "[integrations] GET failed"); }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    switch (body.action) {
      case "create": return ok(await integrations.createConnection(user, body), 201);
      case "rotate-key": return ok(await integrations.rotateKey(user, body));
      case "revoke-key": return ok(await integrations.revokeKey(user, body));
      case "rotate-signing": return ok(await integrations.rotateSigningSecret(user, body));
      case "status": return ok(await integrations.setStatus(user, body));
      case "webhook": return ok(await integrations.updateWebhook(user, body));
      case "test": return ok(await integrations.testDestination(user, String(body.id ?? "")));
      case "replay": return ok(await integrations.replay(user, String(body.id ?? "")));
      case "deliver-now": {
        if (!isInstitutionAuthority(user)) throw new ApiError("Only the institution administrator manages integrations.", 403);
        return ok({ sent: await integrations.deliverDue(user.schoolId) });
      }
      default: throw new ApiError("Unknown action", 400);
    }
  } catch (error) { return errorResponse(error, "[integrations] POST failed"); }
}
