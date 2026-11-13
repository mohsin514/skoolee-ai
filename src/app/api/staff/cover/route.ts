import { NextRequest } from "next/server";
import { coverBoard, proposeCover } from "@/lib/staff/workload";
import { requireAuthUser, resolveCampusId } from "@/lib/api/scope";
import { created, failFrom, ok } from "@/lib/api/envelope";
import { parseBody } from "@/lib/api/validate";
import { jsonObjectBody } from "@/lib/validators/route-bodies";

// SKO-399. GET ?campusId=&date= → uncovered lessons (teacher on approved leave, no cover) with each
// candidate's qualifying reasons, conflicts and warnings. POST {campusId, date, duties[], idempotencyKey}
// → rechecks eligibility and creates a reviewed substitution proposal; no timetable is changed here.
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const campusId = await resolveCampusId(user, request.nextUrl.searchParams.get("campusId"));
    return ok(await coverBoard(user, campusId, request.nextUrl.searchParams.get("date")));
  } catch (error) { return failFrom(error, "[staff/cover] GET failed"); }
}
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const body = await parseBody(request, jsonObjectBody);
    const campusId = await resolveCampusId(user, body.campusId);
    return created(await proposeCover(user, campusId, body));
  } catch (error) { return failFrom(error, "[staff/cover] POST failed"); }
}
