import { NextRequest } from "next/server";
import { requireSchoolAiUser } from "@/lib/school-ai/access";
import { schoolAiError } from "@/lib/school-ai/http";
import { getExamSessionPlanOptions,getExamSeatingCandidates } from "@/lib/school-ai/exam-session-plan-service";
export async function GET(request: NextRequest) {
  try { const user=await requireSchoolAiUser(),campusId=request.nextUrl.searchParams.get("campusId"),classId=request.nextUrl.searchParams.get("classId");return Response.json(classId?{students:await getExamSeatingCandidates(user,campusId,classId)}:{ options: await getExamSessionPlanOptions(user, campusId) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return schoolAiError(error); }
}
