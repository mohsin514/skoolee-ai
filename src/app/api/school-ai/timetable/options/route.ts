import { NextRequest } from "next/server";
import { requireSchoolAiUser } from "@/lib/school-ai/access";
import { schoolAiError } from "@/lib/school-ai/http";
import { getTimetableSetupOptions } from "@/lib/school-ai/timetable-setup-service";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSchoolAiUser();
    const options = await getTimetableSetupOptions(user, request.nextUrl.searchParams.get("campusId"));
    return Response.json({ options }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return schoolAiError(error); }
}
