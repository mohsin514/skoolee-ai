// ===========================================
// SkooleeAI - Subscription Plan Configuration
// ===========================================
//
// Tier names and prices mirror the marketing site (skoolee-ai-marketing):
//   Basic ("FREE" tier id)  -> PKR 0/mo
//   Pro    ("BASIC" tier id) -> PKR 4,000/mo
//   Enterprise ("PRO" tier id) -> PKR 7,000/mo
//   Custom ("ENTERPRISE" tier id) -> quoted, contact sales
//
// Tier IDs are stable so existing accounts keep their recorded plan; only the
// display name and price changed.

import { PlanDetails, PlanType } from "@/types";

export type PlanFeature = "whatsappEnabled" | "pdfExportEnabled" | "pdfBulkExport" | "analyticsEnabled";

/** Discount applied when billing annually (matches marketing pricing). */
export const ANNUAL_DISCOUNT = 0.2;

/** Billing cycles offered at checkout. */
export type BillingPeriod = "monthly" | "annual";

export const PLAN_ORDER: PlanType[] = ["FREE", "BASIC", "PRO", "ENTERPRISE"];

export const PLANS: Record<PlanType, PlanDetails> = {
  FREE: {
    type: "FREE",
    name: "Basic",
    price: 0,
    priceLabel: "PKR 0/mo",
    features: [
      "Up to 50 students",
      "2 teacher accounts",
      "1 campus",
      "100 AI credits/month",
      "Standard report cards",
      "Email support",
    ],
    aiCredits: 100,
    maxStudents: 50,
    maxTeachers: 2,
    maxCampuses: 1,
    whatsappEnabled: false,
    pdfExportEnabled: false,
    pdfBulkExport: false,
    analyticsEnabled: false,
  },
  BASIC: {
    type: "BASIC",
    name: "Pro",
    price: 4000,
    priceLabel: "PKR 4,000/mo",
    stripePriceEnv: "STRIPE_BASIC_PRICE_ID",
    stripeAnnualPriceEnv: "STRIPE_BASIC_ANNUAL_PRICE_ID",
    features: [
      "Up to 500 students",
      "10 teacher accounts",
      "1 campus",
      "1,000 AI credits/month",
      "Branded report cards",
      "WhatsApp notifications",
      "Bulk PDF export",
      "Priority support",
    ],
    aiCredits: 1000,
    maxStudents: 500,
    maxTeachers: 10,
    maxCampuses: 1,
    whatsappEnabled: true,
    pdfExportEnabled: true,
    pdfBulkExport: true,
    analyticsEnabled: false,
  },
  PRO: {
    type: "PRO",
    name: "Enterprise",
    price: 7000,
    priceLabel: "PKR 7,000/mo",
    stripePriceEnv: "STRIPE_PRO_PRICE_ID",
    stripeAnnualPriceEnv: "STRIPE_PRO_ANNUAL_PRICE_ID",
    features: [
      "Up to 2,500 students",
      "50 teacher accounts",
      "5 campuses",
      "5,000 AI credits/month",
      "Custom branded report cards",
      "WhatsApp + Email notifications",
      "Bulk PDF export",
      "Analytics dashboard",
      "API access",
      "Dedicated support",
    ],
    aiCredits: 5000,
    maxStudents: 2500,
    maxTeachers: 50,
    maxCampuses: 5,
    whatsappEnabled: true,
    pdfExportEnabled: true,
    pdfBulkExport: true,
    analyticsEnabled: true,
  },
  ENTERPRISE: {
    type: "ENTERPRISE",
    name: "Custom",
    price: null,
    priceLabel: "Custom",
    isCustom: true,
    features: [
      "Unlimited students",
      "Unlimited teacher accounts",
      "Unlimited campuses",
      "50,000 AI credits/month",
      "Advanced WhatsApp workflows",
      "Bulk PDF export",
      "Network analytics",
      "Custom security review",
      "Dedicated onboarding",
    ],
    aiCredits: 50000,
    maxStudents: -1,
    maxTeachers: -1,
    maxCampuses: -1,
    whatsappEnabled: true,
    pdfExportEnabled: true,
    pdfBulkExport: true,
    analyticsEnabled: true,
  },
};

/** Monthly-equivalent price after the annual discount, or null for custom tiers. */
export function annualMonthlyPrice(price: number | null | undefined) {
  if (price == null) return null;
  return Math.round(price * (1 - ANNUAL_DISCOUNT));
}

export function normalizePlan(plan: unknown): PlanType {
  return typeof plan === "string" && plan in PLANS ? (plan as PlanType) : "FREE";
}

export function getPlanLimits(plan: PlanType | string | null | undefined) {
  return PLANS[normalizePlan(plan)];
}

export function canUseFeature(
  plan: PlanType | string | null | undefined,
  feature: PlanFeature
): boolean {
  return Boolean(getPlanLimits(plan)[feature]);
}

export function isUnlimited(limit: number) {
  return limit < 0;
}

export function formatPlanLimit(limit: number) {
  return isUnlimited(limit) ? "Unlimited" : limit.toLocaleString();
}