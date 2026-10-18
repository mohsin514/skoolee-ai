import { NextRequest } from "next/server";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { bookMeeting, cancelMeeting, completeAction, familyMeetings, rescheduleMeeting } from "@/lib/meetings/service";
import { notifyParty } from "@/lib/meetings/notify";

export const runtime = "nodejs";

// SKO-420: a guardian's meetings for one child. GET ?studentId= → the child's teachers, open slots and
// bookings (shared follow-up only; staff notes never leave the staff desk).
// POST {action: book | reschedule | cancel | action-done}
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (user.role !== "PARENT") throw new ApiError("Not found", 404);
    return Response.json({ success: true, data: await familyMeetings(user, request.nextUrl.searchParams.get("studentId") ?? "") }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error, "[family/meetings] GET failed"); }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (user.role !== "PARENT") throw new ApiError("Not found", 404);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const base = { schoolId: user.schoolId, actorId: user.userId };
    switch (body.action) {
      case "book": {
        const result = await bookMeeting(user, body);
        if (!result.repeated) await notifyParty("MEETING_BOOKED", { ...base, campusId: result.booking.campusId }, result.booking.teacherId, false);
        return Response.json({ success: true, data: { id: result.booking.id, startsAt: result.booking.startsAt, endsAt: result.booking.endsAt, version: result.booking.version, repeated: result.repeated } }, { status: result.repeated ? 200 : 201 });
      }
      case "reschedule": { const result = await rescheduleMeeting(user, body); await notifyParty("MEETING_MOVED", { ...base, campusId: result.campusId }, result.notify, false); return Response.json({ success: true, data: result }); }
      case "cancel": { const result = await cancelMeeting(user, body); await notifyParty("MEETING_CANCELLED", { ...base, campusId: result.campusId }, result.notify, false); return Response.json({ success: true, data: result }); }
      case "action-done": { const action = await completeAction(user, String(body.actionId ?? "")); return Response.json({ success: true, data: { id: action.id, status: action.status, completedAt: action.completedAt } }); }
      default: throw new ApiError("Unknown action", 400);
    }
  } catch (error) { return errorResponse(error, "[family/meetings] POST failed"); }
}
