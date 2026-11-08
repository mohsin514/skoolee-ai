import { NextRequest } from "next/server";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import * as identity from "@/lib/identity/service";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };
const ok = (data: unknown, status = 200) => Response.json({ success: true, data }, { status, headers });

// SKO-446: identity and roster administration. GET ?view=overview | candidates&id= | batch&id=.
// POST {action: save | test | status | add-domain | verify-domain | decide-link | batch | apply}.
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const p = request.nextUrl.searchParams;
    switch (p.get("view") ?? "overview") {
      case "overview": return ok(await identity.overview(user));
      case "candidates": return ok(await identity.candidates(user, p.get("id") ?? ""));
      case "batch": return ok(await identity.batchDetail(user, p.get("id") ?? ""));
      default: throw new ApiError("Unknown view", 400);
    }
  } catch (error) { return errorResponse(error, "[identity] GET failed"); }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    switch (body.action) {
      case "save": return ok(await identity.saveConnection(user, body), body.id ? 200 : 201);
      case "test": return ok(await identity.testConnection(user, String(body.id ?? ""), request.nextUrl.origin));
      case "status": return ok(await identity.setConnectionStatus(user, body));
      case "add-domain": return ok(await identity.addDomain(user, body));
      case "verify-domain": return ok(await identity.verifyDomain(user, body));
      case "decide-link": return ok(await identity.decideLink(user, body));
      case "batch": return ok(await identity.submitBatch(user, body), 201);
      case "apply": return ok(await identity.applyBatch(user, body));
      default: throw new ApiError("Unknown action", 400);
    }
  } catch (error) { return errorResponse(error, "[identity] POST failed"); }
}
