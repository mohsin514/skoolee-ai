import { NextRequest } from "next/server";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { addSession, cancelActivity, cancelPlace, createActivity, guardiansOf, markAttendance, recordFee, requestRefund, roster, staffActivities } from "@/lib/activities/service";
import { deliverNotification } from "@/lib/notifications/in-app";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

// SKO-440: coordinator side. GET → activities (or ?id= roster) · POST {action: create | session | attend |
// fee | cancel-place | refund | cancel}.
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const id = request.nextUrl.searchParams.get("id"), headers = { "Cache-Control": "private, no-store" };
    return Response.json({ success: true, data: id ? await roster(user, id) : await staffActivities(user) }, { headers });
  } catch (error) { return errorResponse(error, "[activities] GET failed"); }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (user.role === "PARENT" || user.role === "STUDENT") throw new ApiError("Not found", 404);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const offerNotice = async (placeIds: string[]) => {
      if (!placeIds.length) return;
      const places = await prisma.activityPlace.findMany({ where: { id: { in: placeIds } }, select: { studentId: true } });
      const recipients = await guardiansOf(user.schoolId, places.map(p => p.studentId));
      if (recipients.length) await deliverNotification("ACTIVITY_PLACE_OFFERED", { schoolId: user.schoolId, campusId: user.campusId ?? "", actorId: user.userId, recipientIds: recipients }).catch(error => console.error("[activities] offer notice failed", error));
    };
    switch (body.action) {
      case "create": return Response.json({ success: true, data: { id: (await createActivity(user, body)).id } }, { status: 201 });
      case "session": return Response.json({ success: true, data: { id: (await addSession(user, body)).id } }, { status: 201 });
      case "attend": return Response.json({ success: true, data: { id: (await markAttendance(user, body)).id } });
      case "fee": return Response.json({ success: true, data: await recordFee(user, body) });
      case "cancel-place": { const r = await cancelPlace(user, body); await offerNotice(r.offered); return Response.json({ success: true, data: r }); }
      case "refund": return Response.json({ success: true, data: await requestRefund(user, body) });
      case "cancel": {
        const r = await cancelActivity(user, String(body.activityId ?? ""));
        const recipients = await guardiansOf(user.schoolId, r.studentIds);
        if (recipients.length) await deliverNotification("ACTIVITY_CANCELLED", { schoolId: user.schoolId, campusId: user.campusId ?? "", actorId: user.userId, recipientIds: recipients }).catch(error => console.error("[activities] cancel notice failed", error));
        return Response.json({ success: true, data: { cancelled: r.cancelled } });
      }
      default: throw new ApiError("Unknown action", 400);
    }
  } catch (error) { return errorResponse(error, "[activities] POST failed"); }
}
