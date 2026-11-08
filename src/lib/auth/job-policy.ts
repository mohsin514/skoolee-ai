import { resolveCurrentPrincipal } from "./principal";
import { AccessDenied } from "./policy";
import { runWithTenantContext } from "@/lib/db/tenant-context";
import { assertPermission, type PermissionModule, type PermissionAction } from "@/lib/permissions";

/** User-attributed jobs recheck active membership and current permissions at execution. */
export async function runAsCurrentActor<T>(schoolId: string, userId: string, module: PermissionModule, action: PermissionAction, fn: () => Promise<T>): Promise<T> {
  const user = await resolveCurrentPrincipal({ schoolId, userId });
  if (!user || user.role === "PARENT" || user.role === "STUDENT") throw new AccessDenied("job", action);
  return runWithTenantContext({ schoolId, userId, campusId: user.campusId, role: user.role }, async () => {
    await assertPermission(user, module, action);
    return fn();
  });
}
