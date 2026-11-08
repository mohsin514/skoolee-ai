import { NextRequest } from "next/server";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { guardianAbsences, submitExplanation } from "@/lib/attendance/register";

// SKO-405: a guardian's recent absences and late arrivals, and explanations for them.
// GET  ?studentId=  → [{attendanceId, date, status, arrivalTime, explanation}]
// POST {attendanceId, reason, proposedStatus: EXCUSED|LATE, arrivalTime?} → pending explanation

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const studentId = request.nextUrl.searchParams.get("studentId");
    if (!studentId) throw new ApiError("studentId is required", 400);
    return Response.json({ success: true, data: await guardianAbsences(user, studentId) });
  } catch (error) {
    return errorResponse(error, "[parent-attendance] GET failed");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    return Response.json({ success: true, data: await submitExplanation(user, body) }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "[parent-attendance] POST failed");
  }
}
