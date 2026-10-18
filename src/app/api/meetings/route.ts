import { NextRequest } from "next/server";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { addStaffNote, cancelMeeting, completeAction, createWindow, recordOutcome, rescheduleMeeting, saveFollowUp, shareFollowUp, staffDesk, withdrawWindow } from "@/lib/meetings/service";
import { notifyConflicts, notifyFollowUp, notifyParty, reconcileMeetings } from "@/lib/meetings/notify";

export const runtime = "nodejs";

// SKO-420: the teacher's meeting desk. GET → windows with slot states and bookings (with private notes).
// POST {action: window | withdraw | reschedule | cancel | outcome | followup | share | note | action-done}
export async function GET() {
  try {
    const user = await requireAuthUser();
    // Recheck against the current timetable and leave before showing anything as confirmed.
    if (user.role === "TEACHER") await reconcileMeetings(user.schoolId, [user.userId], null);
    return Response.json({ success: true, data: await staffDesk(user) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error, "[meetings] GET failed"); }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (user.role === "PARENT" || user.role === "STUDENT") throw new ApiError("Not found", 404);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const base = { schoolId: user.schoolId, campusId: user.campusId ?? "", actorId: user.userId };
    switch (body.action) {
      case "window": return Response.json({ success: true, data: await createWindow(user, body) }, { status: 201 });
      case "withdraw": { const result = await withdrawWindow(user, String(body.windowId ?? "")); await notifyConflicts(result.affected, user.userId); return Response.json({ success: true, data: result }); }
      case "reschedule": { const result = await rescheduleMeeting(user, body); await notifyParty("MEETING_MOVED", { ...base, campusId: result.campusId }, result.notify, true); return Response.json({ success: true, data: result }); }
      case "cancel": { const result = await cancelMeeting(user, body); await notifyParty("MEETING_CANCELLED", { ...base, campusId: result.campusId }, result.notify, true); return Response.json({ success: true, data: result }); }
      case "outcome": return Response.json({ success: true, data: await recordOutcome(user, body) });
      case "followup": return Response.json({ success: true, data: await saveFollowUp(user, body) });
      case "share": { const result = await shareFollowUp(user, body); if (result.shared) await notifyFollowUp({ ...base, campusId: result.campusId }, result.guardianUserId); return Response.json({ success: true, data: result }); }
      case "note": return Response.json({ success: true, data: await addStaffNote(user, body) }, { status: 201 });
      case "action-done": return Response.json({ success: true, data: await completeAction(user, String(body.actionId ?? "")) });
      default: throw new ApiError("Unknown action", 400);
    }
  } catch (error) { return errorResponse(error, "[meetings] POST failed"); }
}
