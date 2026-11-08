import { NextRequest } from "next/server";
import { ApiError, canManageAcademics, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";
import { planTeacherAllocations } from "@/lib/api/teacher-assignments";
import { parseAllocations } from "@/lib/academic/teacher-allocation";
import { notify } from "@/lib/notifications/in-app";
import { parseBody } from "@/lib/api/validate";
import { jsonObjectBody } from "@/lib/validators/route-bodies";

// SKAI-150: bulk teacher allocation for one campus.
// POST /api/subjects/allocations { campusId?, allocations: [{ subjectId, teacherId|null, expectedTeacherId? }], effectiveFrom?, preview? }
//   preview: true → { changes, unchanged, scheduledSubjects, capacity, warnings } with nothing written
//   otherwise     → all rows commit in one transaction, or none do (clash, stale row, denied teacher)
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageAcademics(user)) throw new ApiError("Insufficient permissions", 403);
    const body = await parseBody(req, jsonObjectBody);
    const allocations = parseAllocations(body.allocations);
    const campusId = await resolveCampusId(user, typeof body.campusId === "string" ? body.campusId : null);
    const result = await planTeacherAllocations(user, campusId, allocations, { effectiveFrom: body.effectiveFrom, preview: body.preview === true });
    for (const subject of result.results) {
      if (!subject.teacher) continue;
      notify("SUBJECT_TEACHER_ASSIGNED", {
        schoolId: user.schoolId, campusId, actorId: user.userId, actorName: user.fullName,
        teacherName: subject.teacher.fullName, subjectName: subject.name,
        className: [subject.class?.name, subject.class?.section].filter(Boolean).join(" "),
        teacherId: subject.teacherId ?? undefined,
      });
    }
    return Response.json({ success: true, data: { ...result, results: result.results.map(s => ({ id: s.id, teacherId: s.teacherId })) } });
  } catch (error) {
    return errorResponse(error, "[subjects/allocations] POST failed");
  }
}
