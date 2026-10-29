import { NextRequest } from "next/server";
import { ApiError, requireAuthUser } from "@/lib/api/scope";
import { failFrom, ok as envelopeOk } from "@/lib/api/envelope";
import * as policy from "@/lib/group-policy/service";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };
const ok = (data: unknown, status = 200) => envelopeOk(data, { status, headers });

// SKO-443: group policy. GET ?view=campus&campusId=&domain=&at= | library | preview&versionId=&effectiveFrom= |
// history&templateId= | provenance&recordType=&recordId=. POST {action: template | draft | submit | review |
// request-override | decide-override | revoke-override}.
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const p = request.nextUrl.searchParams;
    switch (p.get("view") ?? "campus") {
      case "campus": return ok(await policy.campusPolicy(user, p.get("campusId"), p.get("domain"), p.get("at")));
      case "library": return ok(await policy.library(user));
      case "preview": return ok(await policy.preview(user, p.get("versionId") ?? "", p.get("effectiveFrom")));
      case "history": return ok(await policy.history(user, p.get("templateId") ?? ""));
      case "provenance": return ok(await policy.provenanceFor(user, p.get("recordType") ?? "", p.get("recordId") ?? ""));
      default: throw new ApiError("Unknown view", 400);
    }
  } catch (error) { return failFrom(error, "[group-policy] GET failed"); }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    switch (body.action) {
      case "template": return ok(await policy.createTemplate(user, body), 201);
      case "template-update": return ok(await policy.updateTemplate(user, body));
      case "draft": return ok(await policy.saveDraft(user, body));
      case "submit": return ok(await policy.submitForReview(user, body));
      case "review": return ok(await policy.review(user, body));
      case "request-override": return ok(await policy.requestOverride(user, body), 201);
      case "decide-override": return ok(await policy.decideOverride(user, body));
      case "revoke-override": return ok(await policy.revokeOverride(user, String(body.id ?? "")));
      default: throw new ApiError("Unknown action", 400);
    }
  } catch (error) { return failFrom(error, "[group-policy] POST failed"); }
}
