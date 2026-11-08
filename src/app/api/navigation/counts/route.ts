import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { ApiError, errorResponse, requireAuthUser, requirePlatformOwner } from "@/lib/api/scope";
import { isInstitutionAuthority, kindFor } from "@/lib/auth/institution";
import { collectSources } from "@/lib/principal/queue";

/**
 * Sidebar badges (§1.4). Never part of /api/navigation/access, which must stay boolean.
 * - approvals: for the institution authority, pending support access + tax packages waiting for sign-off + (group)
 *   campus policy override requests; for the platform operator, subscription requests waiting for review; else 0.
 * - queue: open action-queue items on the caller's campus for the campus admin and the principal; else 0.
 * Allowed while suspended (shell read, G43). A failing source counts as 0 rather than failing the shell.
 */
const QUEUE_ROLES = new Set(["CAMPUS_ADMIN", "ADMIN", "PRINCIPAL"]);

async function safeCount(name: string, count: () => Promise<number>) {
  try {
    return await count();
  } catch (error) {
    console.warn("[navigation/counts] source unavailable", { source: name, error: error instanceof Error ? error.message : String(error) });
    return 0;
  }
}

/**
 * The platform operator's badge reads across schools, so it goes through requirePlatformOwner (scope.ts) like every
 * owner route: the role check, the refusal while a scoped support session is open, and only then the unscoped
 * bypass. During a support session the badge is simply 0 — the shell must not fail over a badge.
 */
async function platformApprovals() {
  try {
    await requirePlatformOwner({ allowSupportAccess: false });
  } catch (error) {
    if (error instanceof ApiError) return 0;
    throw error;
  }
  return safeCount("subscription-requests", () => prisma.subscriptionRequest.count({ where: { state: "PENDING_REVIEW" } }));
}

async function approvalsFor(user: AuthUser) {
  if (user.role === "APP_OWNER") return platformApprovals();
  if (!isInstitutionAuthority(user)) return 0;
  const [support, tax, overrides] = await Promise.all([
    safeCount("support-grants", () => prisma.supportGrant.count({
      where: { schoolId: user.schoolId, OR: [{ status: "pending" }, { status: "active", emergencyReason: { not: null }, reviewedAt: null }] },
    })),
    safeCount("tax-activations", () => prisma.taxActivation.count({ where: { schoolId: user.schoolId, status: "DRAFT" } })),
    kindFor(user) === "GROUP"
      ? safeCount("policy-overrides", () => prisma.policyOverride.count({ where: { schoolId: user.schoolId, status: "PENDING" } }))
      : Promise.resolve(0),
  ]);
  return support + tax + overrides;
}

async function queueFor(user: AuthUser) {
  if (!QUEUE_ROLES.has(user.role) || !user.campusId) return 0;
  const campusId = user.campusId;
  return safeCount("action-queue", async () => {
    const [{ items }, states] = await Promise.all([
      collectSources(user, campusId),
      prisma.queueItemState.findMany({ where: { schoolId: user.schoolId, campusId, snoozedUntil: { gt: new Date() } }, select: { itemKey: true } }),
    ]);
    const snoozed = new Set(states.map((state) => state.itemKey));
    return items.filter((item) => !snoozed.has(item.key)).length;
  });
}

export async function GET() {
  try {
    const user = await requireAuthUser({ allowSuspended: true });
    const [approvals, queue] = await Promise.all([approvalsFor(user), queueFor(user)]);
    return Response.json({ counts: { approvals, queue } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error, "Could not load workspace counts.");
  }
}
