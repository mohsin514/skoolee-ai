import { NextRequest } from "next/server";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { guardianLeave, requestLeave, updateOwnLeave } from "@/lib/family/leave";

// SKO-421: a guardian's leave requests for one child. GET ?studentId= · POST {studentId, fromDate, toDate, reason}
// · PATCH {id, action: cancel|reply, reason?}
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const studentId = request.nextUrl.searchParams.get("studentId");
    if (!studentId) throw new ApiError("studentId is required", 400);
    return Response.json({ success: true, data: await guardianLeave(user, studentId) });
  } catch (error) { return errorResponse(error, "[family/leave] GET failed"); }
}
export async function POST(request: NextRequest) {
  try { const user = await requireAuthUser(); return Response.json({ success: true, data: await requestLeave(user, await request.json().catch(() => ({}))) }, { status: 201 }); }
  catch (error) { return errorResponse(error, "[family/leave] POST failed"); }
}
export async function PATCH(request: NextRequest) {
  try { const user = await requireAuthUser(); return Response.json({ success: true, data: await updateOwnLeave(user, await request.json().catch(() => ({}))) }); }
  catch (error) { return errorResponse(error, "[family/leave] PATCH failed"); }
}
