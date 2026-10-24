import { NextRequest } from "next/server";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { createCategory, createRequest, listCategories, myRequests, queue, suggestCategory } from "@/lib/service-desk/service";
import { tell } from "@/lib/service-desk/notify";

export const runtime = "nodejs";

// SKO-441: the service desk. GET ?view=mine | queue | form [&campusId&status&text]
// POST {action: request | category}
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const params = request.nextUrl.searchParams, view = params.get("view") ?? "mine";
    const headers = { "Cache-Control": "private, no-store" };
    if (view === "mine") return Response.json({ success: true, data: await myRequests(user) }, { headers });
    if (view === "queue") return Response.json({ success: true, data: await queue(user, params.get("campusId"), params.get("status") ?? "OPEN") }, { headers });
    if (view === "form") {
      const form = await listCategories(user, params.get("campusId"));
      return Response.json({ success: true, data: { ...form, categories: form.categories.map(({ keywords: _keywords, ...c }) => c), suggestion: suggestCategory(form.categories, params.get("text") ?? "") } }, { headers });
    }
    throw new ApiError("Unknown view", 400);
  } catch (error) { return errorResponse(error, "[service-desk] GET failed"); }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (body.action === "category") return Response.json({ success: true, data: await createCategory(user, body) }, { status: 201 });
    if (body.action !== "request") throw new ApiError("Unknown action", 400);
    const result = await createRequest(user, body);
    if (!result.repeated) {
      const base = { schoolId: user.schoolId, campusId: result.request.campusId, actorId: user.userId };
      if (result.request.ownerId) await tell("SERVICE_REQUEST_ASSIGNED", base, [result.request.ownerId], result.request.reference);
      if (result.safety && result.escalationId) await tell("SERVICE_SAFETY_REPORTED", base, [result.escalationId], result.request.reference);
    }
    return Response.json({ success: true, data: { id: result.request.id, reference: result.request.reference, status: result.request.status, ownerAssigned: Boolean(result.request.ownerId), repeated: result.repeated } }, { status: result.repeated ? 200 : 201 });
  } catch (error) { return errorResponse(error, "[service-desk] POST failed"); }
}
