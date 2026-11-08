import type { NextRequest } from "next/server";
import { requireSchoolAiUser, SchoolAiError } from "@/lib/school-ai/access";
import { schoolAiError } from "@/lib/school-ai/http";
import { getLifecycleOptions } from "@/lib/school-ai/school-operations-service";
export async function GET(request: NextRequest) {
  try { const user = await requireSchoolAiUser(), search = request.nextUrl.searchParams, operation = search.get("operation"); if (operation !== "academics.transition_year" && operation !== "students.promote_enrollment" || !search.get("campusId")) throw new SchoolAiError("Choose an academic operation and campus.", 400); return Response.json({ options: await getLifecycleOptions(user, search.get("campusId")!, operation, search.get("classId")) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return schoolAiError(error); }
}
