import type { Prisma } from "@prisma/client";
import { PLANS, PLAN_ORDER, canUseFeature, getPlanLimits, normalizePlan, type PlanFeature } from "@/config/plans";
import type { PlanDetails } from "@/types";
import { prisma, type TxClient } from "@/lib/db/prisma";
import type { PlanType } from "@/types";

type DbClient = typeof prisma | TxClient;
type LimitMetric = "students" | "teachers" | "campuses";

const ACTIVE_SCHOOL_STATUSES = new Set(["ACTIVE", "TRIAL"]);

/** Billing period granted by one successful payment. */
export const PLAN_PERIOD_DAYS = 30;
/** Days a school keeps working after its paid-through date before suspension. */
export const GRACE_PERIOD_DAYS = 3;

export class BillingAccessError extends Error {
  status: number;

  constructor(message: string, status = 402) {
    super(message);
    this.status = status;
  }
}

function limitLabel(metric: LimitMetric) {
  if (metric === "students") return "student";
  if (metric === "teachers") return "teacher";
  return "campus";
}

function metricLimit(plan: PlanType, metric: LimitMetric) {
  const limits = getPlanLimits(plan);
  if (metric === "students") return limits.maxStudents;
  if (metric === "teachers") return limits.maxTeachers;
  return limits.maxCampuses;
}

async function currentUsage(client: DbClient, schoolId: string, metric: LimitMetric) {
  if (metric === "students") {
    return client.student.count({ where: { campus: { schoolId } } });
  }

  if (metric === "teachers") {
    const [activeTeachers, pendingTeacherInvites] = await Promise.all([
      client.user.count({ where: { schoolId, role: "TEACHER", isActive: true } }),
      client.staffInvitation.count({
        where: { role: "TEACHER", status: "pending", campus: { schoolId } },
      }),
    ]);

    return activeTeachers + pendingTeacherInvites;
  }

  return client.campus.count({ where: { schoolId } });
}

export function isSchoolOperational(status: string | null | undefined) {
  return ACTIVE_SCHOOL_STATUSES.has(String(status || "").toUpperCase());
}

export function stripeStatusToSchoolStatus(status: string | null | undefined) {
  if (status === "trialing") return "TRIAL";
  if (status === "active") return "ACTIVE";
  return "SUSPENDED";
}

export async function assertSchoolOperational(schoolId: string, client: DbClient = prisma) {
  const school = await client.school.findUnique({
    where: { id: schoolId },
    select: { status: true },
  });

  if (!school) throw new BillingAccessError("School not found", 404);

  // A soft-deleted tenant must look exactly like a missing one to its former
  // users. Without this it falls through to the 402 below and they are told
  // their subscription lapsed and invited to pay for a school that no longer
  // exists. 404 is what requireAuthUser() converts to a 401, which is what
  // lets the client tear the session down and return to sign-in — the same
  // escape hatch a hard-deleted school already gets (see auth/invalid-session).
  if (String(school.status || "").toUpperCase() === "DELETED") {
    throw new BillingAccessError("School not found", 404);
  }

  if (!isSchoolOperational(school.status)) {
    throw new BillingAccessError("Subscription suspended. Open billing to update your plan or payment method.", 402);
  }

  return school;
}

export async function assertPlanCapacity({
  schoolId,
  metric,
  increment = 1,
  client = prisma,
}: {
  schoolId: string;
  metric: LimitMetric;
  increment?: number;
  client?: DbClient;
}) {
  const school = await client.school.findUnique({
    where: { id: schoolId },
    select: { plan: true, status: true },
  });

  if (!school) throw new BillingAccessError("School not found", 404);
  if (!isSchoolOperational(school.status)) {
    throw new BillingAccessError("Subscription suspended. Open billing to update your plan or payment method.", 402);
  }

  const plan = normalizePlan(school.plan);
  const limit = metricLimit(plan, metric);
  if (limit < 0) return { plan, limit, current: 0 };

  const current = await currentUsage(client, schoolId, metric);
  if (current + increment > limit) {
    const label = limitLabel(metric);
    throw new BillingAccessError(
      `${getPlanLimits(plan).name} allows ${limit.toLocaleString()} ${label}${limit === 1 ? "" : "s"}. Upgrade to add more.`,
      402
    );
  }

  return { plan, limit, current };
}

export async function assertFeatureEnabled(schoolId: string, feature: PlanFeature, client: DbClient = prisma) {
  const school = await client.school.findUnique({
    where: { id: schoolId },
    select: { plan: true, status: true },
  });

  if (!school) throw new BillingAccessError("School not found", 404);
  if (!isSchoolOperational(school.status)) {
    throw new BillingAccessError("Subscription suspended. Open billing to update your plan or payment method.", 402);
  }

  const plan = normalizePlan(school.plan);
  if (!canUseFeature(plan, feature)) {
    throw new BillingAccessError(`${getPlanLimits(plan).name} does not include this feature. Upgrade to continue.`, 403);
  }

  return { plan, feature };
}

export async function getBillingSnapshot(schoolId: string, client: DbClient = prisma) {
  const school = await client.school.findUnique({
    where: { id: schoolId },
    select: {
      id: true,
      name: true,
      plan: true,
      status: true,
      planStartedAt: true,
      planEndsAt: true,
      lastPaymentAt: true,
      aiCreditsUsed: true,
      aiCreditsLimit: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      planPricing: true,
    },
  });

  if (!school) throw new BillingAccessError("School not found", 404);

  const plan = normalizePlan(school.plan);
  const limits = getPlanLimits(plan);
  const [students, teachers, campuses, platformConfig] = await Promise.all([
    currentUsage(client, schoolId, "students"),
    currentUsage(client, schoolId, "teachers"),
    currentUsage(client, schoolId, "campuses"),
    client.platformConfig.findUnique({ where: { key: "default_plan_pricing" } }),
  ]);

  const globalDefaults = (platformConfig?.value ?? {}) as Record<string, { price?: number | null }>;

  let plans = PLANS;
  const applyOverrides = (pricing: Record<string, { price?: number | null; priceLabel?: string }> | null | undefined) => {
    const merged: Record<string, PlanDetails> = {};
    for (const key of PLAN_ORDER) {
      const base = PLANS[key];
      const global = globalDefaults[key];
      const custom = pricing?.[key];
      let price = base.price;
      if (custom?.price !== undefined && custom.price !== null) {
        price = custom.price;
      } else if (global?.price !== undefined && global.price !== null) {
        price = global.price;
      }
      merged[key] = {
        ...base,
        price,
        priceLabel: custom?.priceLabel ?? (price != null ? `PKR ${price}/mo` : base.priceLabel),
      };
    }
    return merged as typeof PLANS;
  };

  if (school.planPricing && typeof school.planPricing === "object") {
    const pricing = school.planPricing as Record<string, { price?: number; priceLabel?: string }>;
    plans = applyOverrides(pricing);
  } else if (globalDefaults && Object.keys(globalDefaults).length > 0) {
    plans = applyOverrides(null);
  }

  return {
    school: {
      ...school,
      plan,
      aiCreditsLimit: limits.aiCredits,
      planPricing: school.planPricing,
    },
    limits,
    usage: {
      students,
      teachers,
      campuses,
      aiCredits: school.aiCreditsUsed,
    },
    plans,
    isOperational: isSchoolOperational(school.status),
    planEndsAt: school.planEndsAt?.toISOString() ?? null,
    planStartedAt: school.planStartedAt?.toISOString() ?? null,
    lastPaymentAt: school.lastPaymentAt?.toISOString() ?? null,
    defaultPlanPricing: Object.keys(globalDefaults).length > 0 ? globalDefaults : null,
    defaultPricingUpdatedAt: platformConfig?.updatedAt?.toISOString() ?? null,
  };
}

export function planFromStripePriceId(priceId: string | null | undefined): PlanType | null {
  if (!priceId) return null;

  for (const plan of Object.values(PLANS)) {
    if (plan.stripePriceEnv && process.env[plan.stripePriceEnv] === priceId) {
      return plan.type;
    }
  }

  return null;
}

export async function applySchoolPlan(schoolId: string, plan: PlanType, status: string, stripeSubscriptionId?: string | null) {
  const limits = getPlanLimits(plan);

  return prisma.school.update({
    where: { id: schoolId },
    data: {
      plan,
      status,
      aiCreditsLimit: limits.aiCredits,
      ...(stripeSubscriptionId !== undefined ? { stripeSubscriptionId } : {}),
    },
  });
}

/**
 * Record a verified plan purchase. A renewal extends the account from the
 * later of (today, current paid-through date), so upgrading or renewing early
 * never shortens the period the customer has already paid for. Idempotent by
 * design — safe to call from webhooks and the sandbox simulator.
 */
export async function activatePlan(schoolId: string, plan: PlanType, client: DbClient = prisma, periodDays: number = PLAN_PERIOD_DAYS) {
  const school = await client.school.findUnique({
    where: { id: schoolId },
    select: { planEndsAt: true, planStartedAt: true, plan: true, status: true },
  });

  if (!school) throw new BillingAccessError("School not found", 404);

  const now = new Date();
  const base = school.planEndsAt && school.planEndsAt > now ? school.planEndsAt : now;
  const planEndsAt = new Date(base.getTime() + periodDays * 86_400_000);
  const limits = getPlanLimits(plan);

  return client.school.update({
    where: { id: schoolId },
    data: {
      plan,
      status: "ACTIVE",
      planStartedAt: school.planStartedAt ?? now,
      planEndsAt,
      lastPaymentAt: now,
      aiCreditsLimit: limits.aiCredits,
    },
  });
}
