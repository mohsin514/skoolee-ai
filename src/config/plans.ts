// ===========================================
// SkooleeAI - Subscription Plan Configuration
// ===========================================

import { PlanDetails, PlanType } from "@/types";

export type PlanFeature = "whatsappEnabled" | "pdfExportEnabled" | "pdfBulkExport" | "analyticsEnabled";

export const PLAN_ORDER: PlanType[] = ["FREE", "BASIC", "PRO", "ENTERPRISE"];

export const PLANS: Record<PlanType, PlanDetails> = {
  FREE: {
    type: "FREE",
    name: "Free",
    price: 0,
    priceLabel: "$0/mo",
    features: [
      "Up to 50 students",
      "2 teacher accounts",
      "1 campus",
      "100 AI credits/month",
      "Basic report cards",
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
    name: "Basic",
    price: 29,
    priceLabel: "$29/mo",
    stripePriceEnv: "STRIPE_BASIC_PRICE_ID",
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
    name: "Pro",
    price: 79,
    priceLabel: "$79/mo",
    stripePriceEnv: "STRIPE_PRO_PRICE_ID",
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
    name: "Enterprise",
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
