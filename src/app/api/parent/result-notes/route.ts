import { NextRequest } from "next/server";
import { errorResponse } from "@/lib/api/scope";
import { withParentScope } from "@/lib/parent/resolve-child";
import { AccessDenied } from "@/lib/auth/policy";
import { familyNotesForStudent } from "@/lib/school-ai/family-note-service";

// SKO-504: a guardian reads only the family notes a teacher sent for their linked child.
export async function GET(req: NextRequest) {
  try {
    return await withParentScope(req, async ({ studentId, permissions, schoolId }) => {
      if (!permissions.learningRecords) throw new AccessDenied("results");
      return Response.json({ success: true, data: await familyNotesForStudent(studentId!, schoolId) }, { headers: { "Cache-Control": "private, no-store" } });
    });
  } catch (error) { return errorResponse(error, "[parent/result-notes] GET failed"); }
}
