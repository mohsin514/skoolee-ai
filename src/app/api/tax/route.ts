import { NextRequest } from "next/server";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import * as tax from "@/lib/tax/service";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };
const ok = (data: unknown, status = 200) => Response.json({ success: true, data }, { status, headers });

// SKO-444: invoice tax packages. GET ?view=overview | documents | document&id=. POST {action: draft | fixtures |
// approve | submit | reconcile | correct}.
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const p = request.nextUrl.searchParams;
    switch (p.get("view") ?? "overview") {
      case "overview": return ok(await tax.overview(user));
      case "documents": return ok(await tax.documents(user));
      case "document": return ok(await tax.document(user, p.get("id") ?? ""));
      default: throw new ApiError("Unknown view", 400);
    }
  } catch (error) { return errorResponse(error, "[tax] GET failed"); }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    switch (body.action) {
      case "draft": return ok(await tax.saveDraft(user, body), body.id ? 200 : 201);
      case "fixtures": return ok(await tax.runFixtures(user, body));
      case "approve": return ok(await tax.approve(user, String(body.id ?? "")));
      case "submit": return ok(await tax.submit(user, String(body.id ?? "")));
      case "reconcile": return ok(await tax.reconcile(user, String(body.id ?? "")));
      case "correct": return ok(await tax.correct(user, body));
      default: throw new ApiError("Unknown action", 400);
    }
  } catch (error) { return errorResponse(error, "[tax] POST failed"); }
}
