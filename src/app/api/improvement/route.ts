import { NextRequest } from "next/server";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import * as evidence from "@/lib/improvement/service";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };
const ok = (data: unknown, status = 200) => Response.json({ success: true, data }, { status, headers });

// SKO-450: improvement evidence. GET ?view=workspace&frameworkId= | staff | sources | source&itemId= | pack&id=.
// POST {action: framework | interpretation | retire | evidence | review | improvement | follow-up | complete | grant |
// revoke | export}.
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const p = request.nextUrl.searchParams;
    switch (p.get("view") ?? "workspace") {
      case "workspace": return ok(await evidence.workspace(user, p.get("frameworkId")));
      case "staff": return ok(await evidence.staff(user));
      case "sources": return ok(await evidence.sources(user));
      case "source": return ok(await evidence.openSource(user, p.get("itemId") ?? ""));
      case "pack": return ok(await evidence.downloadPack(user, p.get("id") ?? ""));
      default: throw new ApiError("Unknown view", 400);
    }
  } catch (error) { return errorResponse(error, "[improvement] GET failed"); }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    switch (body.action) {
      case "framework": return ok(await evidence.createFramework(user, body), 201);
      case "interpretation": return ok(await evidence.approveInterpretation(user, body));
      case "retire": return ok(await evidence.retireFramework(user, String(body.id ?? "")));
      case "evidence": return ok(await evidence.addEvidence(user, body), 201);
      case "review": return ok(await evidence.reviewEvidence(user, body));
      case "improvement": return ok(await evidence.createAction(user, body), 201);
      case "follow-up": return ok(await evidence.recordFollowUp(user, body));
      case "complete": return ok(await evidence.completeAction(user, body));
      case "grant": return ok(await evidence.grantReviewer(user, body), 201);
      case "revoke": return ok(await evidence.revokeReviewer(user, String(body.id ?? "")));
      case "export": return ok(await evidence.exportPack(user, body), 201);
      default: throw new ApiError("Unknown action", 400);
    }
  } catch (error) { return errorResponse(error, "[improvement] POST failed"); }
}
