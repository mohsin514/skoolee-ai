// ===========================================
// SkooleeAI - Subscription Plan Configuration
// ===========================================

import { PlanDetails, PlanType } from "@/types";

export const PLANS: Record<PlanType, PlanDetails> = {
  FREE: {
    type: "FREE",
    name: "Free",
    price: 0,
    features: [
      "Up to 50 students",
      "2 teacher accounts",
      "100 AI credits/month",
      "Basic report cards",
      "Email support",
    ],
    aiCredits: 100,
    maxStudents: 50,
    maxTeachers: 2,
    whatsappEnabled: false,
    pdfBulkExport: false,
  },
  BASIC: {
    type: "BASIC",
    name: "Basic",
    price: 29,
    features: [
      "Up to 500 students",
      "10 teacher accounts",
      "1,000 AI credits/month",
      "Branded report cards",
      "WhatsApp notifications",
      "Bulk PDF export",
      "Priority support",
    ],
    aiCredits: 1000,
    maxStudents: 500,
    maxTeachers: 10,
    whatsappEnabled: true,
    pdfBulkExport: true,
  },
  PRO: {
    type: "PRO",
    name: "Pro",
    price: 79,
    features: [
      "Unlimited students",
      "Unlimited teachers",
      "5,000 AI credits/month",
      "Custom branded report cards",
      "WhatsApp + Email notifications",
      "Bulk PDF export",
      "Analytics dashboard",
      "API access",
      "Dedicated support",
    ],
    aiCredits: 5000,
    maxStudents: -1, // unlimited
    maxTeachers: -1, // unlimited
    whatsappEnabled: true,
    pdfBulkExport: true,
  },
};

export function getPlanLimits(plan: PlanType) {
  return PLANS[plan];
}

export function canUseFeature(
  plan: PlanType,
  feature: keyof Pick<PlanDetails, "whatsappEnabled" | "pdfBulkExport">
): boolean {
  return PLANS[plan][feature];
}
