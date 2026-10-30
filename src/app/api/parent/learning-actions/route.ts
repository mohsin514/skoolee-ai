import { NextRequest } from "next/server";
import { errorResponse } from "@/lib/api/scope";
import { withParentScope } from "@/lib/parent/resolve-child";
import { AccessDenied } from "@/lib/auth/policy";
import { familyLearningActions } from "@/lib/learning/actions";

// SKO-425: families see only the goals and actions the school explicitly shared — never notes or evidence.
export async function GET(req: NextRequest) {
  try {
    return await withParentScope(req, async ({ studentId, permissions, schoolId }) => {
      if (!permissions.learningRecords) throw new AccessDenied("support plans");
      return Response.json({ success: true, data: await familyLearningActions(studentId!, schoolId) });
    });
  } catch (error) { return errorResponse(error, "[parent/learning-actions] GET failed"); }
}
