import { NextRequest } from "next/server";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import * as offline from "@/lib/offline/service";
import { classChanges, resolveClassEdit, syncClassEdits } from "@/lib/offline/class-sync";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };
const ok = (data: unknown) => Response.json({ success: true, data }, { headers });

// SKO-448: offline capture. GET ?view=prepare&classId=&date= | review | capabilities.
// POST {action: sync | resolve | review-decide}. SKAI-193: GET ?view=class-changes&cursor=, POST class-sync | class-resolve. Every call runs as the current session.
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const p = request.nextUrl.searchParams;
    switch (p.get("view") ?? "capabilities") {
      case "prepare": return ok(await offline.prepare(user, p.get("classId") ?? "", p.get("date") ?? ""));
      case "review": return ok(await offline.reviewQueue(user));
      case "capabilities": return ok(offline.CAPABILITIES);
      case "class-changes": return ok(await classChanges(user, p.get("cursor")));
      default: throw new ApiError("Unknown view", 400);
    }
  } catch (error) { return errorResponse(error, "[offline] GET failed"); }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    switch (body.action) {
      case "sync": return ok(await offline.sync(user, body));
      case "resolve": return ok(await offline.resolve(user, body));
      case "review-decide": return ok(await offline.reviewDecide(user, body));
      case "class-sync": return ok(await syncClassEdits(user, body));
      case "class-resolve": return ok(await resolveClassEdit(user, body));
      default: throw new ApiError("Unknown action", 400);
    }
  } catch (error) { return errorResponse(error, "[offline] POST failed"); }
}
