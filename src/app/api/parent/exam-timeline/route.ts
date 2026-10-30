import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/api/scope";
import { AccessDenied } from "@/lib/auth/policy";
import { withParentScope } from "@/lib/parent/resolve-child";
import { examTimelineFor } from "@/lib/school-ai/exam-timeline-service";

export const dynamic = "force-dynamic";
// SKO-505: the same timeline for one linked child.
export async function GET(req: NextRequest) {
  try {
    return await withParentScope(req, async ({ studentId, permissions, schoolId }) => {
      if (!permissions.learningRecords) throw new AccessDenied("exam schedule");
      const student = await prisma.student.findFirst({ where: { schoolId, id: studentId! }, select: { id: true, classId: true, campusId: true } });
      if (!student) throw new AccessDenied("student");
      return Response.json({ timeline: await examTimelineFor(schoolId, student) }, { headers: { "Cache-Control": "private, no-store" } });
    });
  } catch (error) { return errorResponse(error, "[parent/exam-timeline] GET failed"); }
}
