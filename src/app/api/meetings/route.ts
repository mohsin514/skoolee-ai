import { NextRequest } from "next/server";
import { ApiError, requireAuthUser } from "@/lib/api/scope";
import { created, failFrom, ok } from "@/lib/api/envelope";
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
    return ok(await staffDesk(user), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return failFrom(error, "[meetings] GET failed"); }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (user.role === "PARENT" || user.role === "STUDENT") throw new ApiError("Not found", 404);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const base = { schoolId: user.schoolId, campusId: user.campusId ?? "", actorId: user.userId };
    switch (body.action) {
      case "window": return created(await createWindow(user, body));
      case "withdraw": { const result = await withdrawWindow(user, String(body.windowId ?? "")); await notifyConflicts(result.affected, user.userId); return ok(result); }
      case "reschedule": { const result = await rescheduleMeeting(user, body); await notifyParty("MEETING_MOVED", { ...base, campusId: result.campusId }, result.notify, true); return ok(result); }
      case "cancel": { const result = await cancelMeeting(user, body); await notifyParty("MEETING_CANCELLED", { ...base, campusId: result.campusId }, result.notify, true); return ok(result); }
      case "outcome": return ok(await recordOutcome(user, body));
      case "followup": return ok(await saveFollowUp(user, body));
      case "share": { const result = await shareFollowUp(user, body); if (result.shared) await notifyFollowUp({ ...base, campusId: result.campusId }, result.guardianUserId); return ok(result); }
      case "note": return created(await addStaffNote(user, body));
      case "action-done": return ok(await completeAction(user, String(body.actionId ?? "")));
      default: throw new ApiError("Unknown action", 400);
    }
  } catch (error) { return failFrom(error, "[meetings] POST failed"); }
}
