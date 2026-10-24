import { NextRequest } from "next/server";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { answerOffer, cancelPlace, familyActivities, requestPlace } from "@/lib/activities/service";
import { notifyOfferedPlaces } from "@/lib/activities/offer-notice";

export const runtime = "nodejs";

// SKO-440: a guardian's activities for one child. GET ?studentId · POST {action: request | answer | withdraw}.
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    return Response.json({ success: true, data: await familyActivities(user, request.nextUrl.searchParams.get("studentId") ?? "") }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error, "[family/activities] GET failed"); }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (user.role !== "PARENT") throw new ApiError("Not found", 404);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const offerNotice = (placeIds: string[]) => notifyOfferedPlaces(user, placeIds);
    if (body.action === "request") { const r = await requestPlace(user, body); await offerNotice(r.offered); return Response.json({ success: true, data: { id: r.place.id, status: r.place.status, repeated: r.repeated } }, { status: r.repeated ? 200 : 201 }); }
    if (body.action === "answer") { const r = await answerOffer(user, body); await offerNotice(r.offered); return Response.json({ success: true, data: { status: r.status } }); }
    if (body.action === "withdraw") { const r = await cancelPlace(user, body); await offerNotice(r.offered); return Response.json({ success: true, data: { status: r.status, late: "late" in r ? r.late : false } }); }
    throw new ApiError("Unknown action", 400);
  } catch (error) { return errorResponse(error, "[family/activities] POST failed"); }
}
