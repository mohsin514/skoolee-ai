import { randomUUID } from "node:crypto";
import { z } from "zod";
import { COMMERCIAL_CONTRACT, createPlanContract, type PlanContract } from "@/config/commercial-contract";
import { ANNUAL_DISCOUNT, PLANS, type BillingPeriod } from "@/config/plans";
import type { PlanType } from "@/types";
import { prisma } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/scope";
import type { AuthUser } from "@/lib/auth";

export const onboardingCheckoutSchema = z.object({
  plan: z.enum(["FREE", "BASIC", "PRO", "ENTERPRISE"]),
  billingPeriod: z.enum(["monthly", "annual"]).default("monthly"),
  expectedCampuses: z.number().int().min(1).max(1000),
  expectedEnrollment: z.number().int().min(0).max(10_000_000),
  returnStep: z.enum(["identity", "campuses", "academic", "review"]).default("campuses"),
  idempotencyKey: z.string().min(16).max(120),
});
export type OnboardingCheckoutInput = z.infer<typeof onboardingCheckoutSchema>;

export function assertOnboardingOwner(user: AuthUser) {
  if (
    !user.isInstitutionOwner ||
    user.onboardingComplete ||
    !["SUPER_ADMIN", "ADMIN"].includes(user.role)
  ) {
    throw new ApiError("Only the verified institution owner can compare or choose a package during setup.", 403);
  }
}

export function assertSubscriptionPurchaser(user: AuthUser) {
  if (["APP_OWNER", "STUDENT", "PARENT"].includes(user.role)) {
    throw new ApiError("This account cannot purchase an institutional package.", 403);
  }
  if (!user.isInstitutionOwner && !user.canPurchaseSubscription) {
    throw new ApiError("Subscription purchasing is not delegated to this account.", 403);
  }
}

export function packageContract(plan: PlanType, details = PLANS[plan]): PlanContract {
  return createPlanContract(plan, {
    name: details.name,
    price: details.price,
    priceCurrency: "PKR",
    priceLabel: details.priceLabel,
    features: details.features,
    aiCredits: details.aiCredits,
    maxStudents: details.maxStudents,
    maxTeachers: details.maxTeachers,
    maxCampuses: details.maxCampuses,
    whatsappEnabled: details.whatsappEnabled,
    pdfExportEnabled: details.pdfExportEnabled,
    pdfBulkExport: details.pdfBulkExport,
    analyticsEnabled: details.analyticsEnabled,
  });
}

export function checkoutAmount(contract: PlanContract, billingPeriod: BillingPeriod) {
  if (contract.price == null) return null;
  return billingPeriod === "annual"
    ? Math.round(contract.price * (1 - ANNUAL_DISCOUNT) * 12)
    : contract.price;
}

export function periodPrice(price: number | null, billingPeriod: BillingPeriod) {
  if (price == null) return null;
  return billingPeriod === "annual" ? Math.round(price * (1 - ANNUAL_DISCOUNT) * 12) : price;
}

export async function createCheckoutIntent(
  user: AuthUser,
  input: OnboardingCheckoutInput,
  contract: PlanContract,
) {
  const existing = await prisma.onboardingCheckoutIntent.findFirst({
    where: { schoolId: user.schoolId, userId: user.userId, idempotencyKey: input.idempotencyKey },
  });
  if (existing) {
    if (
      existing.plan !== input.plan ||
      existing.billingPeriod !== input.billingPeriod ||
      existing.expectedCampuses !== input.expectedCampuses ||
      existing.expectedEnrollment !== input.expectedEnrollment ||
      existing.returnStep !== input.returnStep
    ) {
      throw new ApiError("This retry key already belongs to a different package selection.", 409);
    }
    return existing;
  }

  const amount = checkoutAmount(contract, input.billingPeriod);
  try {
    return await prisma.onboardingCheckoutIntent.create({
      data: {
        id: randomUUID(),
        schoolId: user.schoolId,
        userId: user.userId,
        idempotencyKey: input.idempotencyKey,
        plan: input.plan,
        billingPeriod: input.billingPeriod,
        catalogueVersion: COMMERCIAL_CONTRACT.version,
        contractSnapshot: contract as object,
        expectedCampuses: input.expectedCampuses,
        expectedEnrollment: input.expectedEnrollment,
        returnStep: input.returnStep,
        status: input.plan === "FREE" ? "FREE_SELECTED" : input.plan === "ENTERPRISE" ? "CUSTOM_QUOTE" : "PENDING",
        provider: "NONE",
        amount,
        currency: amount == null ? null : "PKR",
      },
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      const concurrent = await prisma.onboardingCheckoutIntent.findFirst({
        where: { schoolId: user.schoolId, userId: user.userId, idempotencyKey: input.idempotencyKey },
      });
      if (concurrent) {
        if (concurrent.plan !== input.plan || concurrent.billingPeriod !== input.billingPeriod ||
            concurrent.expectedCampuses !== input.expectedCampuses || concurrent.expectedEnrollment !== input.expectedEnrollment ||
            concurrent.returnStep !== input.returnStep) {
          throw new ApiError("This retry key already belongs to a different package selection.", 409);
        }
        return concurrent;
      }
    }
    throw error;
  }
}


export async function settleVerifiedCheckoutIntent(input: {
  id: string;
  schoolId: string;
  provider: "STRIPE" | "SAFEPAY";
  providerReference: string;
  plan: PlanType;
  billingPeriod: BillingPeriod;
  stripeSubscriptionId?: string | null;
  stripeCustomerId?: string | null;
}) {
  const { runWithTenantContext } = await import("@/lib/db/tenant-context");
  const { activatePlan } = await import("@/lib/billing/entitlements");
  return runWithTenantContext({ schoolId: input.schoolId }, () => prisma.$transaction(async (tx) => {
    const intent = await tx.onboardingCheckoutIntent.findFirst({
      where: { id: input.id, schoolId: input.schoolId },
    });
    if (!intent) throw new ApiError("Verified checkout intent was not found.", 404);
    if (intent.status === "SETTLED") return { settled: true, duplicate: true };
    if (
      intent.provider !== input.provider ||
      intent.providerReference !== input.providerReference ||
      intent.plan !== input.plan ||
      intent.billingPeriod !== input.billingPeriod ||
      !["CHECKOUT_PENDING", "PENDING_SETTLEMENT", "FAILED"].includes(intent.status)
    ) {
      throw new ApiError("Payment confirmation does not match the saved checkout intent.", 409);
    }

    const contract = intent.contractSnapshot as PlanContract;
    if (
      contract.plan !== input.plan ||
      contract.catalogVersion !== intent.catalogueVersion ||
      contract.price == null ||
      checkoutAmount(contract, input.billingPeriod) !== intent.amount
    ) {
      throw new ApiError("Saved commercial terms do not match the checkout intent.", 409);
    }

    await activatePlan(
      input.schoolId,
      input.plan,
      tx,
      input.billingPeriod === "annual" ? 365 : undefined,
      contract,
    );
    if (input.stripeSubscriptionId || input.stripeCustomerId) {
      await tx.school.update({
        where: { id: input.schoolId },
        data: {
          ...(input.stripeSubscriptionId ? { stripeSubscriptionId: input.stripeSubscriptionId } : {}),
          ...(input.stripeCustomerId ? { stripeCustomerId: input.stripeCustomerId } : {}),
        },
      });
    }
    await tx.onboardingCheckoutIntent.update({
      where: { id: intent.id },
      data: { status: "SETTLED", settledAt: new Date(), failureReason: null },
    });
    return { settled: true, duplicate: false };
  }, { isolationLevel: "Serializable", timeout: 20000 }));
}
