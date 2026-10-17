import { NextRequest } from "next/server";
import { ApiError, canMarkAttendance, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";
import { notify } from "@/lib/notifications/in-app";
import { schoolToday } from "@/lib/datetime";
import { attendanceRuleFor, entryHistory, exceptionQueue, publishRule, registerView, reviewExplanation, saveRegister } from "@/lib/attendance/register";

// SKO-405 class register.
// GET  ?classId=&date=          → dated roster, marks (unmarked is null), register status, counts, rule
// GET  ?queue=1&campusId=       → unexplained absences, explanations to decide, open registers
// GET  ?history=<attendanceId>  → one pupil-day's marks, corrections and explanations
// GET  ?rule=1                  → the published counting rule
// POST {classId, date, entries:[{studentId,status,knownStatus,arrivalTime?,departureTime?,note?,reviewedConflict?}], reason?, submit?}
//      → {conflicts, written, unmarked, submitted}; conflicts are not written
// POST {review: {id, action: accept|reject|clarify, note?, knownVersion?}}
// POST {rule: {attended, excluded, note}}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canMarkAttendance(user)) throw new ApiError("Insufficient permissions", 403);
    const params = request.nextUrl.searchParams;
    if (params.get("rule")) return Response.json({ success: true, data: await attendanceRuleFor(user.schoolId) });
    const history = params.get("history");
    if (history) return Response.json({ success: true, data: await entryHistory(user, history) });
    const campusId = await resolveCampusId(user, user.role === "SUPER_ADMIN" ? params.get("campusId") : user.campusId);
    const today = await schoolToday(user.schoolId, campusId);
    if (params.get("queue")) return Response.json({ success: true, data: await exceptionQueue(user, campusId, today) });
    const classId = params.get("classId");
    if (!classId) throw new ApiError("classId is required", 400);
    return Response.json({ success: true, data: { ...(await registerView(user, classId, params.get("date") || today)), today } });
  } catch (error) {
    return errorResponse(error, "[attendance-register] GET failed");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (body.review && typeof body.review === "object") return Response.json({ success: true, data: await reviewExplanation(user, body.review as Record<string, unknown>) });
    if (body.rule && typeof body.rule === "object") return Response.json({ success: true, data: await publishRule(user, body.rule as Record<string, unknown>) });
    const date = String(body.date ?? "");
    const campusId = await resolveCampusId(user, user.role === "SUPER_ADMIN" ? (body.campusId as string | null) ?? null : user.campusId);
    if (date > (await schoolToday(user.schoolId, campusId))) throw new ApiError("Attendance cannot be recorded for a future day.", 400);
    const result = await saveRegister(user, body);
    if (result.submittedNow) notify("ATTENDANCE_SUBMITTED", { schoolId: user.schoolId, campusId: result.campusId, actorId: user.userId, actorName: user.fullName, className: result.className, date, count: result.rosterCount });
    const { submittedNow: _s, campusId: _c, className: _n, rosterCount: _r, ...data } = result;
    return Response.json({ success: true, data }, { status: data.conflicts.length ? 409 : 200 });
  } catch (error) {
    return errorResponse(error, "[attendance-register] POST failed");
  }
}
