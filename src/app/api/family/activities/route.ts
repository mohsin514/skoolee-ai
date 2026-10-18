import { NextRequest } from "next/server";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { answerOffer, cancelPlace, familyActivities, guardiansOf, requestPlace } from "@/lib/activities/service";
import { deliverNotification } from "@/lib/notifications/in-app";
import { prisma } from "@/lib/db/prisma";

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
    const offerNotice = async (placeIds: string[]) => {
      if (!placeIds.length) return;
      const places = await prisma.activityPlace.findMany({ where: { id: { in: placeIds } }, select: { studentId: true } });
      const recipients = await guardiansOf(user.schoolId, places.map(p => p.studentId));
      if (recipients.length) await deliverNotification("ACTIVITY_PLACE_OFFERED", { schoolId: user.schoolId, campusId: user.campusId ?? "", actorId: user.userId, recipientIds: recipients }).catch(error => console.error("[family/activities] offer notice failed", error));
    };
    if (body.action === "request") { const r = await requestPlace(user, body); await offerNotice(r.offered); return Response.json({ success: true, data: { id: r.place.id, status: r.place.status, repeated: r.repeated } }, { status: r.repeated ? 200 : 201 }); }
    if (body.action === "answer") { const r = await answerOffer(user, body); await offerNotice(r.offered); return Response.json({ success: true, data: { status: r.status } }); }
    if (body.action === "withdraw") { const r = await cancelPlace(user, body); await offerNotice(r.offered); return Response.json({ success: true, data: { status: r.status, late: "late" in r ? r.late : false } }); }
    throw new ApiError("Unknown action", 400);
  } catch (error) { return errorResponse(error, "[family/activities] POST failed"); }
}
