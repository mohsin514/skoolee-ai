import { NextRequest } from "next/server";
import { ok, failFrom } from "@/lib/api/envelope";
import { requireAuthUser, resolveCampusId } from "@/lib/api/scope";
import { reviewLeave, staffLeaveQueue } from "@/lib/family/leave";
import { notify } from "@/lib/notifications/in-app";

// SKO-421: learner leave requests awaiting the school. GET ?campusId= · POST {id, action: approve|decline|clarify, note?, knownVersion?}
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const campusId = await resolveCampusId(user, user.role === "SUPER_ADMIN" ? request.nextUrl.searchParams.get("campusId") : user.campusId);
    return ok(await staffLeaveQueue(user, campusId));
  } catch (error) { return failFrom(error, "[attendance/leave] GET failed"); }
}
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const row = await reviewLeave(user, await request.json().catch(() => ({})));
    // The notice names no reason or note: details stay inside the request, visible to the family and staff.
    notify("LEARNER_LEAVE_DECIDED", { schoolId: user.schoolId, campusId: row.campusId, actorId: user.userId, actorName: user.fullName ?? null, recipientIds: [row.requestedById], status: row.status });
    return ok(row);
  } catch (error) { return failFrom(error, "[attendance/leave] POST failed"); }
}
