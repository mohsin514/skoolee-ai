import { errorResponse, requireAuthUser } from "@/lib/api/scope";
import { loadPermissionMap } from "@/lib/permissions";
import { capabilitiesFor } from "@/lib/navigation/capabilities";

/**
 * Read only the current caller's effective module visibility and capability keys (§1.4, G4). Every value is a
 * boolean computed by the same predicate that gates the matching API; this never grants authority.
 * Allowed while suspended so the minimal shell can render Billing & plan (G43).
 */
export async function GET() {
  try {
    const user = await requireAuthUser({ allowSuspended: true });
    const permissionsPromise = loadPermissionMap(user.schoolId, user.role);
    const capabilitiesPromise = capabilitiesFor(user, permissionsPromise);
    const [permissions, capabilities] = await Promise.all([permissionsPromise, capabilitiesPromise]);
    // `scope` names whose access this is (addendum 2026-10-22 §3): the shell keys its per-tab cache on userId + schoolId +
    // role + accessVersion and drops the cache when any of them changes. It drives presentation only — every API and
    // page still enforces its own gate on each request.
    const scope = { userId: user.userId, schoolId: user.schoolId, campusId: user.campusId ?? null, role: user.role, accessVersion: user.accessVersion ?? 0 };
    return Response.json({ access: {
      ...Object.fromEntries([...permissions].map(([module, flags]) => [module, flags.canView === true])),
      ...capabilities,
    }, scope }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error, "Could not load workspace access.");
  }
}
