import { errorResponse, requireAuthUser } from "@/lib/api/scope";
import { loadPermissionMap } from "@/lib/permissions";
import { SCHOOL_AI_STAFF_ROLES } from "@/lib/school-ai/access";
import { isCampusAdminRole } from "@/lib/roles";

/** Read only the current caller's effective module visibility; this never grants authority. */
export async function GET() {
  try {
    const user = await requireAuthUser({ allowSuspended: true });
    const permissions = await loadPermissionMap(user.schoolId, user.role);
    return Response.json({ access: {
      ...Object.fromEntries([...permissions].map(([module, flags]) => [module, flags.canView])),
      schoolAi: (SCHOOL_AI_STAFF_ROLES as readonly string[]).includes(user.role) && permissions.get("ai")?.canView === true,
      schoolAiExams: user.role === "STUDENT",
      // SKO-482: offer Record corrections only to roles with a correction domain they can use (mirrors corrections/service permit).
      corrections: ["PARENT", "STUDENT", "TEACHER", "ACCOUNTANT", "SUPER_ADMIN", "PRINCIPAL"].includes(user.role) || isCampusAdminRole(user.role),
    } }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error, "Could not load workspace access.");
  }
}
