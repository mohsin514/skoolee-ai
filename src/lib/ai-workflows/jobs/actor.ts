import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { runWithTenantContext } from "@/lib/db/tenant-context";
import { assertSchoolOperational } from "@/lib/billing/entitlements";
import { getCampusSeats } from "@/lib/auth/seats";
import { loadWorkspacePermissionSnapshot, resolveWorkerPrincipal } from "@/lib/school-ai/access";
import { WorkflowError } from "../errors";
import type { CapabilityContext, Locale } from "../registry/types";

/**
 * The only place an AI Workflows actor is resolved or a capability context is built (control P15:
 * no hand-built AuthUser and no runUnscoped elsewhere in src/lib/ai-workflows).
 */
export const inTenant = <T>(user: AuthUser, work: () => Promise<T>) =>
  runWithTenantContext({ schoolId: user.schoolId, userId: user.userId, role: user.role, campusId: user.campusId }, work);

/** Re-checks the live account at every step: same role, campus and access version, active, school operational. */
export async function authorizeActor(user: AuthUser) {
  const actor = await prisma.user.findFirst({ where: { id: user.userId, schoolId: user.schoolId, isActive: true }, select: { role: true, campusId: true, accessVersion: true } });
  if (!actor || actor.role !== user.role || actor.campusId !== user.campusId || actor.accessVersion !== (user.accessVersion ?? 0)) throw new WorkflowError("ACCESS_CHANGED");
  if (user.role !== "APP_OWNER") await assertSchoolOperational(user.schoolId).catch(() => { throw new WorkflowError("SUSPENDED"); });
}

/** Background work re-resolves the stored actor; null means access changed and the job must stop. */
export function resolveJobActor(job: { actorId: string; schoolId: string; actorRole: string; accessVersion: number }) {
  return resolveWorkerPrincipal({ userId: job.actorId, schoolId: job.schoolId, role: job.actorRole, accessVersion: job.accessVersion }).catch(() => null);
}

export async function capabilityContext(user: AuthUser, campusId: string | null, locale: Locale): Promise<CapabilityContext> {
  const permissions = await loadWorkspacePermissionSnapshot(user);
  let seats: ReturnType<typeof getCampusSeats> | null = null;
  return { user, campusId, permissions, locale, now: new Date(), seats: () => (seats ??= getCampusSeats(user.schoolId, campusId)) };
}
