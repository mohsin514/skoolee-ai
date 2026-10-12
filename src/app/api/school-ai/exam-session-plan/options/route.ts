import { NextRequest } from "next/server";
import { requireSchoolAiUser } from "@/lib/school-ai/access";
import { schoolAiError } from "@/lib/school-ai/http";
import { getExamSessionPlanOptions } from "@/lib/school-ai/exam-session-plan-service";
export async function GET(request: NextRequest) {
  try { return Response.json({ options: await getExamSessionPlanOptions(await requireSchoolAiUser(), request.nextUrl.searchParams.get("campusId")) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return schoolAiError(error); }
}
