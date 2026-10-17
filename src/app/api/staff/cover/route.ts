import { NextRequest } from "next/server";
import { coverBoard, proposeCover } from "@/lib/staff/workload";
import { errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";

// SKO-399. GET ?campusId=&date= → uncovered lessons (teacher on approved leave, no cover) with each
// candidate's qualifying reasons, conflicts and warnings. POST {campusId, date, duties[], idempotencyKey}
// → rechecks eligibility and creates a reviewed substitution proposal; no timetable is changed here.
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const campusId = await resolveCampusId(user, request.nextUrl.searchParams.get("campusId"));
    return Response.json({ success: true, data: await coverBoard(user, campusId, request.nextUrl.searchParams.get("date")) });
  } catch (error) { return errorResponse(error, "[staff/cover] GET failed"); }
}
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const body = await request.json();
    const campusId = await resolveCampusId(user, body.campusId);
    return Response.json({ success: true, data: await proposeCover(user, campusId, body) }, { status: 201 });
  } catch (error) { return errorResponse(error, "[staff/cover] POST failed"); }
}
