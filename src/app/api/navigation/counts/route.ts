import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { ApiError, errorResponse, requireAuthUser, requirePlatformOwner } from "@/lib/api/scope";
import { isInstitutionAuthority, kindFor } from "@/lib/auth/institution";
import { collectSources } from "@/lib/principal/queue";
import { createTtlMemo } from "@/lib/cache/ttl-memo";
import { createSharedMemo, sharedMemoEnabled } from "@/lib/cache/shared-memo";

// With Redis on, each layer keeps 30 s so a badge is never more than 60 s old, as before.
const queueBadge = createTtlMemo({ ttlMs: sharedMemoEnabled() ? 30_000 : 60_000 });
const sharedQueueBadge = createSharedMemo({ name: "nav-queue", ttlSeconds: 30 });

/**
 * Sidebar badges (§1.4). Never part of /api/navigation/access, which must stay boolean.
 * - approvals: for the institution authority, pending support access + tax packages waiting for sign-off + (group)
 *   campus policy override requests; for the platform operator, subscription requests waiting for review; else 0.
 * - queue: open action-queue items on the caller's campus for the campus admin and the principal; else 0.
 * Allowed while suspended (shell read, G43). A failing source counts as 0 rather than failing the shell.
 * - approvalBreakdown (SKAI-1866, institution authority only): the same three counts split out, plus whether any
 *   source failed, so the group Today view reads them here instead of downloading the support grants and the whole
 *   policy library. `counts` stays numbers only — the sidebar reads it as badge values.
 */
const QUEUE_ROLES = new Set(["CAMPUS_ADMIN", "ADMIN", "PRINCIPAL"]);

async function safeCount(name: string, count: () => Promise<number>, onFail?: () => void) {
  try {
    return await count();
  } catch (error) {
    onFail?.();
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

type ApprovalBreakdown = { support: number; tax: number; overrides: number; failed: boolean };

async function approvalsFor(user: AuthUser): Promise<{ approvals: number; breakdown?: ApprovalBreakdown }> {
  if (user.role === "APP_OWNER") return { approvals: await platformApprovals() };
  if (!isInstitutionAuthority(user)) return { approvals: 0 };
  let failed = false;
  const onFail = () => { failed = true; };
  const [support, tax, overrides] = await Promise.all([
    safeCount("support-grants", () => prisma.supportGrant.count({
      where: { schoolId: user.schoolId, OR: [{ status: "pending" }, { status: "active", emergencyReason: { not: null }, reviewedAt: null }] },
    }), onFail),
    safeCount("tax-activations", () => prisma.taxActivation.count({ where: { schoolId: user.schoolId, status: "DRAFT" } }), onFail),
    kindFor(user) === "GROUP"
      ? safeCount("policy-overrides", () => prisma.policyOverride.count({ where: { schoolId: user.schoolId, status: "PENDING" } }), onFail)
      : Promise.resolve(0),
  ]);
  return { approvals: support + tax + overrides, breakdown: { support, tax, overrides, failed } };
}

/** A rebuild in which a queue source failed: its partial count is shown, but rejected so no memo layer keeps it. */
class PartialQueueCount extends Error {
  constructor(readonly count: number, readonly failed: string[]) { super("action-queue source failed"); }
}

/** The open action-queue items on the caller's campus. Rejects when any source fails, so the memo never keeps a failure. */
async function countQueue(user: AuthUser, campusId: string) {
  const [{ items, failed }, states] = await Promise.all([
    collectSources(user, campusId),
    prisma.queueItemState.findMany({ where: { schoolId: user.schoolId, campusId, snoozedUntil: { gt: new Date() } }, select: { itemKey: true } }),
  ]);
  const snoozed = new Set(states.map((state) => state.itemKey));
  const open = items.filter((item) => !snoozed.has(item.key)).length;
  if (failed?.length) throw new PartialQueueCount(open, failed);
  return open;
}

async function queueFor(user: AuthUser) {
  if (!QUEUE_ROLES.has(user.role) || !user.campusId) return 0;
  const campusId = user.campusId;
  // Scale: the queue badge rebuilds the whole action queue (~35 queries). It is display only — the queue page stays
  // live — so it is shared per user scope for 60 s (per instance, and across instances when Redis is on). A failed
  // rebuild rejects inside the memo (not remembered): a partial one still shows what loaded, as before, and a thrown
  // one counts as 0 out here, so the shell does not fail.
  const key = JSON.stringify([user.userId, user.schoolId, campusId, user.role, user.accessVersion ?? 0]);
  return safeCount("action-queue", () => queueBadge.get(key, () => sharedQueueBadge.get(key, () => countQueue(user, campusId))).catch((error: unknown) => {
    if (!(error instanceof PartialQueueCount)) throw error;
    console.warn("[navigation/counts] action-queue sources unavailable", { sources: error.failed });
    return error.count;
  }));
}

export async function GET() {
  try {
    const user = await requireAuthUser({ allowSuspended: true });
    // SKAI-1973: approvals are at most three school-scoped count() reads, so they stay live — the group Today view's
    // breakdown is current right after an approval, a Refresh or a save. Only the queue badge is memoised.
    const [{ approvals, breakdown }, queue] = await Promise.all([approvalsFor(user), queueFor(user)]);
    return Response.json({ counts: { approvals, queue }, ...(breakdown ? { approvalBreakdown: breakdown } : {}) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error, "Could not load workspace counts.");
  }
}
