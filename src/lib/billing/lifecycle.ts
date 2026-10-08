import { ANNUAL_DISCOUNT, getPlanLimits, normalizePlan, type BillingPeriod } from "@/config/plans";
import type { PlanType } from "@/types";
import { getBillingSnapshot } from "@/lib/billing/entitlements";
import { prisma } from "@/lib/db/prisma";

const validPlans = new Set<PlanType>(["FREE", "BASIC", "PRO", "ENTERPRISE"]);

class IdempotencyConflict extends Error {
  status = 409;
}

function assertSameRequest(existing: { kind: string; requestedPlan: string | null; details: unknown }, input: { kind: string; requestedPlan?: PlanType; details: Record<string, unknown> }) {
  const oldPeriod = (existing.details as { preview?: { billingPeriod?: string } } | null)?.preview?.billingPeriod;
  const nextPeriod = (input.details as { preview?: { billingPeriod?: string } } | null)?.preview?.billingPeriod;
  if (existing.kind !== input.kind || existing.requestedPlan !== (input.requestedPlan || null) ||
      (input.kind === "PLAN_CHANGE" && oldPeriod !== nextPeriod)) {
    throw new IdempotencyConflict("This request key already belongs to a different subscription action.");
  }
}

export async function previewPlanChange(schoolId: string, targetPlan: PlanType, billingPeriod: BillingPeriod = "monthly") {
  const snapshot = await getBillingSnapshot(schoolId);
  const target = getPlanLimits(targetPlan);
  const exceeds = (used: number, limit: number) => limit >= 0 && used > limit;
  const overages = {
    campuses: exceeds(snapshot.usage.campuses, target.maxCampuses) ? snapshot.usage.campuses - target.maxCampuses : 0,
    students: exceeds(snapshot.usage.students, target.maxStudents) ? snapshot.usage.students - target.maxStudents : 0,
    teachers: exceeds(snapshot.usage.teachers, target.maxTeachers) ? snapshot.usage.teachers - target.maxTeachers : 0,
  };
  const downgrade = targetPlan !== snapshot.school.plan &&
    ["FREE", "BASIC", "PRO", "ENTERPRISE"].indexOf(targetPlan) < ["FREE", "BASIC", "PRO", "ENTERPRISE"].indexOf(snapshot.school.plan);

  const monthlyAmount = snapshot.plans[targetPlan].price;
  const amount = monthlyAmount == null ? null : billingPeriod === "annual"
    ? Math.round(monthlyAmount * (1 - ANNUAL_DISCOUNT) * 12)
    : monthlyAmount;

  return {
    currentPlan: snapshot.school.plan,
    proposedPlan: targetPlan,
    billingPeriod,
    currentMonthlyAmount: snapshot.limits.price,
    proposedAmount: amount,
    priceCurrency: snapshot.priceCurrency,
    currentUsage: snapshot.usage,
    proposedCapacity: {
      campuses: target.maxCampuses,
      students: target.maxStudents,
      teachers: target.maxTeachers,
    },
    overages,
    recordsRetained: true,
    operationPolicy: overages.campuses || overages.students || overages.teachers
      ? "No records are deleted. New campuses, users or enrollments above the proposed limit may be blocked until usage is within capacity or the plan is changed."
      : "Existing institution records remain available under the proposed plan.",
    effectiveAt: downgrade ? (snapshot.school.planEndsAt || new Date()) : new Date(),
    chargePreview: `${billingPeriod === "annual" ? "Catalogue annual amount" : "Catalogue monthly amount"}: ${snapshot.priceCurrency || "configured currency"} ${amount ?? "custom quote"}. Any proration or renewal charge is confirmed by the payment provider or billing review before payment.`,
  };
}

export async function saveSubscriptionRequest(input: {
  schoolId: string;
  userId: string;
  idempotencyKey: string;
  kind: "PLAN_CHANGE" | "CANCELLATION" | "REFUND" | "RENEWAL_RECOVERY" | "PAYMENT_REPORT";
  state?: string;
  requestedPlan?: PlanType;
  effectiveAt?: Date | null;
  details: Record<string, unknown>;
}) {
  const existing = await prisma.subscriptionRequest.findUnique({
    where: { schoolId_requestedById_idempotencyKey: {
      schoolId: input.schoolId,
      requestedById: input.userId,
      idempotencyKey: input.idempotencyKey,
    } },
  });
  if (existing) {
    assertSameRequest(existing, input);
    return existing;
  }

  try {
    return await prisma.$transaction(async (tx) => {
    const created = await tx.subscriptionRequest.create({
      data: {
        schoolId: input.schoolId,
        requestedById: input.userId,
        idempotencyKey: input.idempotencyKey,
        kind: input.kind,
        ...(input.state ? { state: input.state } : {}),
        requestedPlan: input.requestedPlan,
        effectiveAt: input.effectiveAt,
        details: input.details as any,
      },
    });
    await tx.auditLog.create({
      data: {
        schoolId: input.schoolId,
        userId: input.userId,
        tableName: "subscription_request",
        recordId: created.id,
        newValue: {
          kind: input.kind,
          state: created.state,
          requestedPlan: input.requestedPlan || null,
          effectiveAt: input.effectiveAt?.toISOString() || null,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
      return created;
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      const concurrent = await prisma.subscriptionRequest.findUnique({ where: { schoolId_requestedById_idempotencyKey: {
        schoolId: input.schoolId, requestedById: input.userId, idempotencyKey: input.idempotencyKey,
      } } });
      if (concurrent) {
        assertSameRequest(concurrent, input);
        return concurrent;
      }
    }
    throw error;
  }
}

export async function findApprovedPlanChange(schoolId: string, plan: PlanType, billingPeriod: BillingPeriod) {
  const candidates = await prisma.subscriptionRequest.findMany({
    where: { schoolId, kind: "PLAN_CHANGE", requestedPlan: plan, state: { in: ["REVIEWED_APPROVED", "CHECKOUT_STARTED"] } },
    orderBy: { reviewedAt: "desc" },
    take: 20,
    select: { id: true, details: true, state: true },
  });
  return candidates.find(row => (row.details as { preview?: { billingPeriod?: string } } | null)?.preview?.billingPeriod === billingPeriod) || null;
}

export async function markPlanChangeCheckoutStarted(schoolId: string, requestId: string, userId: string) {
  await prisma.$transaction(async tx => {
    const changed = await tx.subscriptionRequest.updateMany({
      where: { id: requestId, schoolId, kind: "PLAN_CHANGE", state: "REVIEWED_APPROVED" },
      data: { state: "CHECKOUT_STARTED" },
    });
    if (changed.count !== 1) throw new IdempotencyConflict("This approved change has already started checkout.");
    await tx.auditLog.create({ data: {
      schoolId,
      userId,
      tableName: "subscription_request",
      recordId: requestId,
      oldValue: { state: "REVIEWED_APPROVED" },
      newValue: { state: "CHECKOUT_STARTED" },
    } });
  });
}

export async function restorePlanChangeApproval(schoolId: string, requestId: string, userId: string) {
  await prisma.$transaction(async tx => {
    const changed = await tx.subscriptionRequest.updateMany({
      where: { id: requestId, schoolId, kind: "PLAN_CHANGE", state: "CHECKOUT_STARTED" },
      data: { state: "REVIEWED_APPROVED" },
    });
    if (changed.count === 1) await tx.auditLog.create({ data: {
      schoolId, userId, tableName: "subscription_request", recordId: requestId,
      oldValue: { state: "CHECKOUT_STARTED" }, newValue: { state: "REVIEWED_APPROVED", reason: "Checkout initiation failed; retry remains idempotent." },
    } });
  });
}

export function parsePlan(value: unknown): PlanType | null {
  if (typeof value !== "string") return null;
  const plan = normalizePlan(value);
  return validPlans.has(plan) ? plan : null;
}
