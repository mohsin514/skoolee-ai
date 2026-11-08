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
      // SKAI-1715: every page re-runs the same linked-child scope; `cursor` only moves to older releases.
      const { results, nextCursor } = await familyExamResults(schoolId, studentId!, req.nextUrl.searchParams.get("cursor"));
      return Response.json({ success: true, data: results, nextCursor }, { headers: { "Cache-Control": "private, no-store" } });
    });
  } catch (error) { return errorResponse(error, "[parent/exam-results] GET failed"); }
}
