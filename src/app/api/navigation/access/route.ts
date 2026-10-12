import { errorResponse, requireAuthUser } from "@/lib/api/scope";
import { loadPermissionMap } from "@/lib/permissions";
import { SCHOOL_AI_STAFF_ROLES } from "@/lib/school-ai/access";

/** Read only the current caller's effective module visibility; this never grants authority. */
export async function GET() {
  try {
    const user = await requireAuthUser({ allowSuspended: true });
    const permissions = await loadPermissionMap(user.schoolId, user.role);
    return Response.json({ access: {
      ...Object.fromEntries([...permissions].map(([module, flags]) => [module, flags.canView])),
      schoolAi: (SCHOOL_AI_STAFF_ROLES as readonly string[]).includes(user.role) && permissions.get("ai")?.canView === true,
      schoolAiExams: user.role === "STUDENT",
    } }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error, "Could not load workspace access.");
  }
}
