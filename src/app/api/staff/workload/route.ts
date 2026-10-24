import { NextRequest } from "next/server";
import { setCapacity, weekWorkload } from "@/lib/staff/workload";
import { errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";

// SKO-399. GET ?campusId=&weekStart=YYYY-MM-DD → per-teacher load for that week with its definition.
// PATCH {campusId, staffId, capacity} → contracted periods per week (null = unknown), audited.
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const campusId = await resolveCampusId(user, request.nextUrl.searchParams.get("campusId"));
    return Response.json({ success: true, data: await weekWorkload(user, campusId, request.nextUrl.searchParams.get("weekStart")) });
  } catch (error) { return errorResponse(error, "[staff/workload] GET failed"); }
}
export async function PATCH(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const body = await request.json();
    const campusId = await resolveCampusId(user, body.campusId);
    return Response.json({ success: true, data: await setCapacity(user, campusId, String(body.staffId ?? ""), body.capacity) });
  } catch (error) { return errorResponse(error, "[staff/workload] PATCH failed"); }
}
