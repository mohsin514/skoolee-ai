import { NextRequest } from "next/server";
import { requireAuthUser } from "@/lib/api/scope";
import { failFrom, ok } from "@/lib/api/envelope";
import { studentToday } from "@/lib/student/today";

// SKO-418: the student's Today read model. GET ?day=YYYY-MM-DD (school-local; defaults to today).
// SKAI-1204: success and failure use the API envelope ({ data } / { error }).
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    return ok(await studentToday(user, request.nextUrl.searchParams.get("day")));
  } catch (error) {
    return failFrom(error, "[student/today] GET failed");
  }
}
