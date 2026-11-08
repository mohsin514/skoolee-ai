import { NextRequest } from "next/server";
import { errorResponse, requireAuthUser } from "@/lib/api/scope";
import { studentToday } from "@/lib/student/today";

// SKO-418: the student's Today read model. GET ?day=YYYY-MM-DD (school-local; defaults to today).
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    return Response.json({ success: true, data: await studentToday(user, request.nextUrl.searchParams.get("day")) });
  } catch (error) {
    return errorResponse(error, "[student/today] GET failed");
  }
}
