import { errorResponse, requireAuthUser } from "@/lib/api/scope";
import { loadPermissionMap } from "@/lib/permissions";

/** Read only the current caller's effective module visibility; this never grants authority. */
export async function GET() {
  try {
    const user = await requireAuthUser({ allowSuspended: true });
    const permissions = await loadPermissionMap(user.schoolId, user.role);
    return Response.json({ access: Object.fromEntries([...permissions].map(([module, flags]) => [module, flags.canView])) }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error, "Could not load workspace access.");
  }
}
