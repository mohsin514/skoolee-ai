// ===========================================
// SkooleeAI - Subscription Plan Configuration
// ===========================================
//
// "Free core, paid flagship" (catalogue 2026-11-12.1). The marketing site
// (skoolee-ai-marketing) renders its pricing from this file through
// `npm run catalogue:sync`, so names, prices, minimums, credits and flags here
// are what the site advertises. Rationale: skoolee-ai-marketing
// docs/pricing/2026-11-pricing-proposal.md.
//
// Model
//   Core     ("FREE" tier id)       -> PKR 0. Every everyday operation, no student/staff/campus limit.
//   Plus     ("BASIC" tier id)      -> per student / month. Timetable, date sheets, WhatsApp, branded PDFs.
//   Flagship ("PRO" tier id)        -> per student / month. Plus + AI Workflows, Exam Studio, scan, AI remarks, analytics.
//   Network  ("ENTERPRISE" tier id) -> per student / month. Flagship + group console, API, dedicated onboarding.
//
// Tier IDs are stable so existing accounts keep their recorded plan; a school's
// saved terms (src/config/commercial-contract.ts) decide what it pays and gets.
//
// Where the app honours this file
//   - Billing maths (price x max(active students, minBilledStudents), annual
//     discount, AI credit allowance): src/lib/billing/plan-pricing.ts.
//   - Feature flags: assertFeatureEnabled (src/lib/billing/entitlements.ts) at
//     each server entry point, and the navigation filter for missing flags.

import { PlanDetails, PlanType } from "@/types";

export type PlanFeature =
  | "whatsappEnabled"
  | "pdfExportEnabled"
  | "pdfBulkExport"
  | "analyticsEnabled"
  | "timetableEnabled"
  | "examPlanningEnabled"
  | "aiWorkflowsEnabled"
  | "examStudioEnabled"
  | "markSheetScanEnabled"
  | "aiRemarksEnabled"
  | "groupConsoleEnabled"
  | "apiAccessEnabled";

/** Discount applied when billing annually (matches marketing pricing). */
export const ANNUAL_DISCOUNT = 0.2;

/** Billing cycles offered at checkout. */
export type BillingPeriod = "monthly" | "annual";

/**
 * Credits reset to the plan allowance at the start of each UTC calendar month
 * (not at billing renewal). Unused credits expire; the reset job does not roll
 * them forward. This policy is shared by pricing and
 * release validation so copy cannot promise rollover accidentally.
 */
export const AI_CREDIT_POLICY = {
  allowance: "plan-monthly",
  unused: "expire-at-calendar-month-reset",
  reset: "zero-used-on-calendar-month-boundary",
} as const;

/** Version for the commercial contract represented by this catalogue. */
export const COMMERCIAL_CATALOG_VERSION = "2026-11-12.1";

export const PLAN_ORDER: PlanType[] = ["FREE", "BASIC", "PRO", "ENTERPRISE"];

export const PLANS: Record<PlanType, PlanDetails> = {
  FREE: {
    type: "FREE",
    name: "Core",
    pricing: "per_student",
    price: 0,
    priceLabel: "Free",
    minBilledStudents: 0,
    features: [
      "Unlimited students, staff and campuses",
      "Admissions, records, attendance and marks",
      "Standard report cards with PDF export",
      "Fees, receipts and bank-statement import",
      "Parent and student apps, messages",
      "Library, transport, hostel, canteen, front desk",
    ],
    aiCredits: 0,
    aiCreditsPerStudent: 0,
    maxStudents: -1,
    maxTeachers: -1,
    maxCampuses: -1,
    whatsappEnabled: false,
    pdfExportEnabled: true,
    pdfBulkExport: false,
    analyticsEnabled: false,
    timetableEnabled: false,
    examPlanningEnabled: false,
    aiWorkflowsEnabled: false,
    examStudioEnabled: false,
    markSheetScanEnabled: false,
    aiRemarksEnabled: false,
    groupConsoleEnabled: false,
    apiAccessEnabled: false,
  },
  BASIC: {
    type: "BASIC",
    name: "Plus",
    pricing: "per_student",
    price: 15,
    priceLabel: "PKR 15 per student/mo",
    minBilledStudents: 100,
    stripePriceEnv: "STRIPE_BASIC_PRICE_ID",
    stripeAnnualPriceEnv: "STRIPE_BASIC_ANNUAL_PRICE_ID",
    features: [
      "Everything in Core",
      "Timetable with clash fixes and cover",
      "Date sheets, seating and invigilation",
      "WhatsApp report cards and family messages",
      "Branded report cards and bulk PDF export",
      "Priority support",
    ],
    aiCredits: 0,
    aiCreditsPerStudent: 0,
    maxStudents: -1,
    maxTeachers: -1,
    maxCampuses: -1,
    whatsappEnabled: true,
    pdfExportEnabled: true,
    pdfBulkExport: true,
    analyticsEnabled: false,
    timetableEnabled: true,
    examPlanningEnabled: true,
    aiWorkflowsEnabled: false,
    examStudioEnabled: false,
    markSheetScanEnabled: false,
    aiRemarksEnabled: false,
    groupConsoleEnabled: false,
    apiAccessEnabled: false,
  },
  PRO: {
    type: "PRO",
    name: "Flagship",
    pricing: "per_student",
    price: 40,
    priceLabel: "PKR 40 per student/mo",
    minBilledStudents: 100,
    stripePriceEnv: "STRIPE_PRO_PRICE_ID",
    stripeAnnualPriceEnv: "STRIPE_PRO_ANNUAL_PRICE_ID",
    features: [
      "Everything in Plus",
      "AI Workflows across every desk",
      "AI Exam Studio with sealed papers",
      "Mark-sheet photo scan",
      "AI report-card remarks in English and Urdu",
      "Analytics and at-risk insights",
    ],
    aiCredits: 1000,
    aiCreditsPerStudent: 10,
    maxStudents: -1,
    maxTeachers: -1,
    maxCampuses: -1,
    whatsappEnabled: true,
    pdfExportEnabled: true,
    pdfBulkExport: true,
    analyticsEnabled: true,
    timetableEnabled: true,
    examPlanningEnabled: true,
    aiWorkflowsEnabled: true,
    examStudioEnabled: true,
    markSheetScanEnabled: true,
    aiRemarksEnabled: true,
    groupConsoleEnabled: false,
    apiAccessEnabled: false,
  },
  ENTERPRISE: {
    type: "ENTERPRISE",
    name: "Network",
    pricing: "per_student",
    price: 60,
    priceLabel: "PKR 60 per student/mo",
    minBilledStudents: 600,
    features: [
      "Everything in Flagship",
      "Group console across campuses",
      "Group standards and approvals",
      "Curriculum packs shared across campuses",
      "API access",
      "Dedicated onboarding and custom security review",
    ],
    aiCredits: 9000,
    aiCreditsPerStudent: 15,
    maxStudents: -1,
    maxTeachers: -1,
    maxCampuses: -1,
    whatsappEnabled: true,
    pdfExportEnabled: true,
    pdfBulkExport: true,
    analyticsEnabled: true,
    timetableEnabled: true,
    examPlanningEnabled: true,
    aiWorkflowsEnabled: true,
    examStudioEnabled: true,
    markSheetScanEnabled: true,
    aiRemarksEnabled: true,
    groupConsoleEnabled: true,
    apiAccessEnabled: true,
  },
};

/** Monthly-equivalent price after the annual discount, or null for custom tiers. */
export function annualMonthlyPrice(price: number | null | undefined) {
  if (price == null) return null;
  return Math.round(Math.round(price * (1 - ANNUAL_DISCOUNT) * 12) / 12);
}

/** Students a per-student plan bills for: the active count, raised to the plan's minimum. */
export function billableStudents(plan: PlanType | string | null | undefined, activeStudents: number) {
  const details = getPlanLimits(plan);
  return details.price ? Math.max(activeStudents, details.minBilledStudents) : 0;
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
