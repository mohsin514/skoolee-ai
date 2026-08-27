import { NextRequest } from "next/server";
import {
  ApiError,
  assertPermission,
  assertStaffRole,
  canManageOperations,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
} from "@/lib/api/scope";
import { autoSeatSession, campusSeatingCapacity } from "@/lib/academic/exam-sessions";
import { findAvailableRooms } from "@/lib/academic/exam-rooms";

// GET  /api/academic/exam-sessions/seating?campusId=[&date=&periodDefinitionId=]
//      → campus seat supply, and (with a slot) which rooms are free in it
// POST /api/academic/exam-sessions/seating { sessionId, includeSeated? }
//      → seat every paper in the session
//
// Reading room occupancy is staff-only: it is one query away from a full
// roster of who sits where.

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    assertStaffRole(user);
    const campusId = await resolveCampusId(user, req.nextUrl.searchParams.get("campusId"));
    const date = req.nextUrl.searchParams.get("date");
    const periodDefinitionId = req.nextUrl.searchParams.get("periodDefinitionId");
    const excludeScheduleId = req.nextUrl.searchParams.get("excludeScheduleId") || undefined;

    const capacity = await campusSeatingCapacity(campusId);

    if (!date) return Response.json({ success: true, data: { capacity, rooms: [] } });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ApiError("date must be YYYY-MM-DD", 400);

    const rooms = await findAvailableRooms({
      campusId,
      date,
      periodDefinitionId: periodDefinitionId || null,
      excludeScheduleId,
    });

    return Response.json({ success: true, data: { capacity, rooms } });
  } catch (error) {
    return errorResponse(error, "[exam-sessions/seating] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "exams", "edit");

    const body = await req.json();
    const sessionId = String(body.sessionId ?? "");
    if (!sessionId) throw new ApiError("sessionId is required", 400);
    const campusId = await resolveCampusId(user, body.campusId);

    const result = await autoSeatSession({
      campusId,
      sessionId,
      includeSeated: Boolean(body.includeSeated),
    });

    return Response.json({ success: true, data: result });
  } catch (error) {
    return errorResponse(error, "[exam-sessions/seating] POST failed");
  }
}
