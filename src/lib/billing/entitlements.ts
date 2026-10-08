import type { Prisma } from "@prisma/client";
import { PLANS, PLAN_ORDER, getPlanLimits, normalizePlan, type PlanFeature } from "@/config/plans";
import { COMMERCIAL_CONTRACT, createPlanContract, getSchoolPlanContract, type PlanContract } from "@/config/commercial-contract";
import type { PlanDetails } from "@/types";
import { prisma, type TxClient } from "@/lib/db/prisma";
import type { PlanType } from "@/types";
import { CURRENCIES } from "@/lib/locale/package";
import { currencyForCountry, countrySchema } from "@/lib/locale/country";

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
    select: { status: true, subscriptionLifecycleState: true, graceEndsAt: true },
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

  const graceExpired = school.subscriptionLifecycleState === "PAST_DUE_GRACE" &&
    Boolean(school.graceEndsAt && school.graceEndsAt <= new Date());
  if (graceExpired) {
    await client.school.updateMany({
      where: { id: schoolId, subscriptionLifecycleState: "PAST_DUE_GRACE", graceEndsAt: { lte: new Date() } },
      data: { status: "SUSPENDED", subscriptionLifecycleState: "PAST_DUE" },
    });
  }

  if (!isSchoolOperational(school.status) || graceExpired) {
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
    select: { plan: true, status: true, commercialContract: true, subscriptionLifecycleState: true, graceEndsAt: true },
  });

  if (!school) throw new BillingAccessError("School not found", 404);
  if (!isSchoolOperational(school.status) || (school.subscriptionLifecycleState === "PAST_DUE_GRACE" && Boolean(school.graceEndsAt && school.graceEndsAt <= new Date()))) {
    throw new BillingAccessError("Subscription suspended. Open billing to update your plan or payment method.", 402);
  }

  const plan = normalizePlan(school.plan);
  const contract = getSchoolPlanContract(plan, school.commercialContract);
  const limit = metric === "students" ? contract.maxStudents : metric === "teachers" ? contract.maxTeachers : contract.maxCampuses;
  if (limit < 0) return { plan, limit, current: 0 };

  const current = await currentUsage(client, schoolId, metric);
  if (current + increment > limit) {
    const label = limitLabel(metric);
    throw new BillingAccessError(
      `${contract.name} allows ${limit.toLocaleString()} ${label}${limit === 1 ? "" : "s"}. Upgrade to add more.`,
      402
    );
  }

  return { plan, limit, current };
}

export async function assertFeatureEnabled(schoolId: string, feature: PlanFeature, client: DbClient = prisma) {
  const school = await client.school.findUnique({
    where: { id: schoolId },
    select: { plan: true, status: true, commercialContract: true, subscriptionLifecycleState: true, graceEndsAt: true },
  });

  if (!school) throw new BillingAccessError("School not found", 404);
  if (!isSchoolOperational(school.status) || (school.subscriptionLifecycleState === "PAST_DUE_GRACE" && Boolean(school.graceEndsAt && school.graceEndsAt <= new Date()))) {
    throw new BillingAccessError("Subscription suspended. Open billing to update your plan or payment method.", 402);
  }

  const plan = normalizePlan(school.plan);
  const contract = getSchoolPlanContract(plan, school.commercialContract);
  if (!contract[feature]) {
    throw new BillingAccessError(`${contract.name} does not include this feature. Upgrade to continue.`, 403);
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
      subscriptionLifecycleState: true,
      cancellationEffectiveAt: true,
      graceEndsAt: true,
      planStartedAt: true,
      planEndsAt: true,
      lastPaymentAt: true,
      aiCreditsUsed: true,
      aiCreditsLimit: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      planPricing: true,
      commercialContract: true,
    },
  });

  if (!school) throw new BillingAccessError("School not found", 404);

  const plan = normalizePlan(school.plan);
  const limits = getSchoolPlanContract(plan, school.commercialContract);
  const [students, teachers, campuses, platformConfig, localePolicy] = await Promise.all([
    currentUsage(client, schoolId, "students"),
    currentUsage(client, schoolId, "teachers"),
    currentUsage(client, schoolId, "campuses"),
    client.platformConfig.findUnique({ where: { key: "default_plan_pricing" } }),
    client.localePolicy.findFirst({
      where: { schoolId, campusId: null, status: "ACTIVE", effectiveAt: { lte: new Date() } },
      orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }],
      select: { settings: true },
    }),
  ]);

  const regionalSettings = localePolicy?.settings && typeof localePolicy.settings === "object" && !Array.isArray(localePolicy.settings)
    ? localePolicy.settings as Record<string, unknown>
    : {};
  const locationCountry = countrySchema.safeParse(regionalSettings.country);
  const regionalCurrency = typeof regionalSettings.currency === "string" && CURRENCIES.includes(regionalSettings.currency as typeof CURRENCIES[number])
    ? regionalSettings.currency
    : currencyForCountry(locationCountry.success ? locationCountry.data : "OTHER");

  const globalDefaults = (platformConfig?.value ?? {}) as Record<string, { price?: number | null }>;

  let plans = PLANS;
  const applyOverrides = (pricing: Record<string, { price?: number | null; priceLabel?: string }> | null | undefined) => {
    const merged: Record<string, PlanDetails> = {};
    for (const key of PLAN_ORDER) {
      const base = key === plan ? limits : PLANS[key];
      const global = globalDefaults[key];
      const custom = pricing?.[key];
      let price = base.price;
      if (key !== plan && custom?.price !== undefined && custom.price !== null) {
        price = custom.price;
      } else if (key !== plan && global?.price !== undefined && global.price !== null) {
        price = global.price;
      }
      merged[key] = {
        ...base,
        price,
        priceLabel: key === plan ? base.priceLabel : custom?.priceLabel ?? (price != null ? `${COMMERCIAL_CONTRACT.currency} ${price}/mo` : base.priceLabel),
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
      aiCreditsLimit: school.aiCreditsLimit,
      planPricing: school.planPricing,
    },
    limits,
    commercialContractVersion: limits.contractVersion,
    regionalCurrency,
    priceCurrency: limits.priceCurrency,
    usage: {
      students,
      teachers,
      campuses,
      aiCredits: school.aiCreditsUsed,
    },
    plans,
    isOperational: isSchoolOperational(school.status) && !(
      school.subscriptionLifecycleState === "PAST_DUE_GRACE" &&
      Boolean(school.graceEndsAt && school.graceEndsAt <= new Date())
    ),
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

export async function applySchoolPlan(schoolId: string, plan: PlanType, status: string, stripeSubscriptionId?: string | null, contract?: PlanContract | null) {
  const limits = getPlanLimits(plan);

  return prisma.school.update({
    where: { id: schoolId },
    data: {
      plan,
      status,
      subscriptionLifecycleState: status === "TRIAL" ? "TRIAL" : status === "ACTIVE" ? "ACTIVE" : status === "SUSPENDED" ? "PAST_DUE" : status,
      ...(status === "ACTIVE" || status === "TRIAL" ? { graceEndsAt: null } : {}),
      aiCreditsLimit: contract?.aiCredits ?? limits.aiCredits,
      commercialContract: contract ?? createPlanContract(plan),
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
export async function activatePlan(schoolId: string, plan: PlanType, client: DbClient = prisma, periodDays: number = PLAN_PERIOD_DAYS, contract?: PlanContract | null) {
  const school = await client.school.findUnique({
    where: { id: schoolId },
    select: { planEndsAt: true, planStartedAt: true, plan: true, status: true, planPricing: true },
  });

  if (!school) throw new BillingAccessError("School not found", 404);

  const now = new Date();
  const base = school.planEndsAt && school.planEndsAt > now ? school.planEndsAt : now;
  const planEndsAt = new Date(base.getTime() + periodDays * 86_400_000);
  const limits = getPlanLimits(plan);
  const pricing = school.planPricing && typeof school.planPricing === "object" ? school.planPricing as Record<string, { price?: number | null }> : null;
  const negotiatedPrice = pricing?.[plan]?.price;

  return client.school.update({
    where: { id: schoolId },
    data: {
      plan,
      status: "ACTIVE",
      subscriptionLifecycleState: "ACTIVE",
      cancellationEffectiveAt: null,
      graceEndsAt: null,
      planStartedAt: school.planStartedAt ?? now,
      planEndsAt,
      lastPaymentAt: now,
      aiCreditsLimit: contract?.aiCredits ?? limits.aiCredits,
      commercialContract: contract ?? createPlanContract(plan, { price: negotiatedPrice }),
    },
  });
}
