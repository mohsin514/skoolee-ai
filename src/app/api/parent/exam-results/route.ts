import { NextRequest } from "next/server";
import { errorResponse } from "@/lib/api/scope";
import { AccessDenied } from "@/lib/auth/policy";
import { withParentScope } from "@/lib/parent/resolve-child";
import { familyExamResults } from "@/lib/school-ai/exam-timeline-service";

export const dynamic = "force-dynamic";
// SKO-505: released online results for one linked child (moderated marks and the teacher's feedback).
export async function GET(req: NextRequest) {
  try {
    return await withParentScope(req, async ({ studentId, permissions, schoolId }) => {
      if (!permissions.learningRecords) throw new AccessDenied("results");
      return Response.json({ success: true, data: await familyExamResults(schoolId, studentId!) }, { headers: { "Cache-Control": "private, no-store" } });
    });
  } catch (error) { return errorResponse(error, "[parent/exam-results] GET failed"); }
}
