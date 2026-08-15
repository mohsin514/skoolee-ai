import { NextRequest } from "next/server";
import {
  assertPermission,
  assertStaffRole,
  canManageOperations,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
} from "@/lib/api/scope";
import { allocateExamRooms, getSeatingPlan } from "@/lib/academic/exam-rooms";

// Multi-room exam seating (§58).
//
// GET /api/academic/exam-schedule/rooms?scheduleId=  → the seating plan
// PUT /api/academic/exam-schedule/rooms { scheduleId, roomIds[] }
//     → replace the room set and re-seat everyone
//
// Reading the plan is staff-only: it is a full roster of who sits where, which
// is exactly the roster families are kept out of everywhere else.

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    assertStaffRole(user);
    const campusId = await resolveCampusId(user, req.nextUrl.searchParams.get("campusId"));
    const scheduleId = req.nextUrl.searchParams.get("scheduleId");
    if (!scheduleId) return Response.json({ error: "scheduleId is required" }, { status: 400 });

    return Response.json({ success: true, data: await getSeatingPlan(campusId, scheduleId) });
  } catch (error) {
    return errorResponse(error, "[exam-schedule/rooms] GET failed");
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) {
      return Response.json({ error: "Insufficient permissions" }, { status: 403 });
    }
    await assertPermission(user, "exams", "edit");

    const body = await req.json();
    const scheduleId = String(body.scheduleId ?? "");
    const roomIds = Array.isArray(body.roomIds) ? body.roomIds.map(String) : null;
    if (!scheduleId || !roomIds) {
      return Response.json({ error: "scheduleId and roomIds[] are required" }, { status: 400 });
    }

    const campusId = await resolveCampusId(user, body.campusId);
    const plan = await allocateExamRooms({ campusId, scheduleId, roomIds });
    return Response.json({ success: true, data: plan });
  } catch (error) {
    return errorResponse(error, "[exam-schedule/rooms] PUT failed");
  }
}
