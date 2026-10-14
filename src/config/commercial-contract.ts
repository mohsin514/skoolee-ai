import { AI_CREDIT_POLICY, COMMERCIAL_CATALOG_VERSION, PLAN_ORDER, PLANS } from "@/config/plans";
import { COUNTRIES, currencyForCountry, type Country } from "@/lib/locale/country";
import type { PlanDetails, PlanType } from "@/types";

/** Approved values used by pricing, billing, signup and server entitlements. */
export const COMMERCIAL_CONTRACT = {
  version: COMMERCIAL_CATALOG_VERSION,
  currency: "PKR",
  billingPeriod: "calendar-month",
  aiCredits: AI_CREDIT_POLICY,
  planIds: PLAN_ORDER,
  plans: PLANS,
  claimsPolicy: {
    customerQuotes: "none-published-without-source-and-permission",
    measuredOutcomes: "none-published-without-method-source-and-review-date",
    competitorClaims: "none-published-without-current-source-and-review-date",
    syntheticExamples: "must-be-labeled-illustrative",
    capabilities: "only-implemented-and-gated-features-may-be-described-as-available",
  },
  existingCustomerTerms: "retain-approved-terms-until-authorized-change-process",
  regionalCurrencies: Object.fromEntries(COUNTRIES.map((country) => [country, currencyForCountry(country)])) as Record<Country, string>,
  regionalPriceDisclosure: "Regional currency is a display default. Catalog prices remain PKR until an approved regional price is configured; no exchange conversion is implied.",
} as const;

export type CommercialPlan = (typeof COMMERCIAL_CONTRACT.plans)[keyof typeof COMMERCIAL_CONTRACT.plans];

export type PlanContract = {
  catalogVersion: string;
  effectiveAt: string;
  plan: PlanType;
  name: string;
  price: number | null;
  priceCurrency: string;
  priceLabel: string;
  features: string[];
  aiCredits: number;
  maxStudents: number;
  maxTeachers: number;
  maxCampuses: number;
  whatsappEnabled: boolean;
  pdfExportEnabled: boolean;
  pdfBulkExport: boolean;
  analyticsEnabled: boolean;
  aiCreditPolicy: typeof AI_CREDIT_POLICY;
};

type PlanContractOverrides = Partial<Omit<PlanContract, "plan" | "effectiveAt">> & { effectiveAt?: Date | string };

export function createPlanContract(plan: PlanType, overrides: PlanContractOverrides = {}): PlanContract {
  const details = COMMERCIAL_CONTRACT.plans[plan];
  const price = overrides.price === undefined ? details.price : overrides.price;
  const aiCredits = overrides.aiCredits ?? details.aiCredits;
  const features = overrides.features ?? details.features.map((feature) =>
    /AI credits\/month/i.test(feature) ? `${aiCredits.toLocaleString()} AI credits/month` : feature
  );
  return {
    catalogVersion: overrides.catalogVersion ?? COMMERCIAL_CONTRACT.version,
    effectiveAt: (overrides.effectiveAt instanceof Date ? overrides.effectiveAt : new Date(overrides.effectiveAt ?? Date.now())).toISOString(),
    plan,
    name: overrides.name ?? details.name,
    price,
    priceCurrency: overrides.priceCurrency ?? COMMERCIAL_CONTRACT.currency,
    priceLabel: overrides.priceLabel ?? (price === details.price ? details.priceLabel : price === null ? "Custom" : `${COMMERCIAL_CONTRACT.currency} ${price.toLocaleString()}/mo`),
    features: [...features],
    aiCredits,
    maxStudents: overrides.maxStudents ?? details.maxStudents,
    maxTeachers: overrides.maxTeachers ?? details.maxTeachers,
    maxCampuses: overrides.maxCampuses ?? details.maxCampuses,
    whatsappEnabled: overrides.whatsappEnabled ?? details.whatsappEnabled,
    pdfExportEnabled: overrides.pdfExportEnabled ?? details.pdfExportEnabled,
    pdfBulkExport: overrides.pdfBulkExport ?? details.pdfBulkExport,
    analyticsEnabled: overrides.analyticsEnabled ?? details.analyticsEnabled,
    aiCreditPolicy: overrides.aiCreditPolicy ?? AI_CREDIT_POLICY,
  };
}

/** Compact, signed-provider metadata for preserving an open checkout's quote. */
export function encodePlanContractMetadata(contract: PlanContract) {
  const flags = [contract.whatsappEnabled, contract.pdfExportEnabled, contract.pdfBulkExport, contract.analyticsEnabled]
    .map((enabled) => enabled ? "1" : "0").join("");
  const value = JSON.stringify([
    contract.catalogVersion, contract.effectiveAt, contract.plan, contract.name, contract.price,
    contract.priceCurrency, contract.priceLabel, contract.aiCredits, contract.maxStudents,
    contract.maxTeachers, contract.maxCampuses, flags, contract.features,
    Object.values(contract.aiCreditPolicy),
  ]);
  if (value.length > 500) throw new Error("Plan contract metadata exceeds the payment provider limit");
  return value;
}

export function decodePlanContractMetadata(value: string | null | undefined, expectedPlan: PlanType): PlanContract | null {
  if (!value) return null;
  try {
    const saved: unknown = JSON.parse(value);
    if (!Array.isArray(saved) || saved.length !== 14) return null;
    const [catalogVersion, effectiveAt, plan, name, price, priceCurrency, priceLabel, aiCredits, maxStudents, maxTeachers, maxCampuses, flags, features, creditPolicy] = saved;
    if (
      typeof catalogVersion !== "string" || typeof effectiveAt !== "string" || !Number.isFinite(Date.parse(effectiveAt)) ||
      plan !== expectedPlan || typeof name !== "string" || !(price === null || Number.isFinite(price)) ||
      priceCurrency !== COMMERCIAL_CONTRACT.currency || typeof priceLabel !== "string" ||
      ![aiCredits, maxStudents, maxTeachers, maxCampuses].every(Number.isInteger) ||
      typeof flags !== "string" || !/^[01]{4}$/.test(flags) ||
      !Array.isArray(features) || !features.every((item) => typeof item === "string") ||
      !Array.isArray(creditPolicy) || creditPolicy.length !== 3 || !creditPolicy.every((item) => typeof item === "string")
    ) return null;
    return createPlanContract(expectedPlan, {
      catalogVersion, effectiveAt, name, price: price as number | null, priceCurrency, priceLabel,
      aiCredits: aiCredits as number, maxStudents: maxStudents as number, maxTeachers: maxTeachers as number,
      maxCampuses: maxCampuses as number, whatsappEnabled: flags[0] === "1", pdfExportEnabled: flags[1] === "1",
      pdfBulkExport: flags[2] === "1", analyticsEnabled: flags[3] === "1", features: features as string[],
      aiCreditPolicy: { allowance: creditPolicy[0], unused: creditPolicy[1], reset: creditPolicy[2] } as typeof AI_CREDIT_POLICY,
    });
  } catch {
    return null;
  }
}

/** Resolve current-account terms from its persisted snapshot, falling back only for pre-migration rows. */
export function getSchoolPlanContract(plan: PlanType, snapshot: unknown): PlanDetails & { contractVersion: string; priceCurrency: string; aiCreditPolicy: typeof AI_CREDIT_POLICY } {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return { ...PLANS[plan], contractVersion: COMMERCIAL_CONTRACT.version, priceCurrency: COMMERCIAL_CONTRACT.currency, aiCreditPolicy: AI_CREDIT_POLICY };
  }
  const saved = snapshot as Record<string, unknown>;
  const numericFields = ["price", "aiCredits", "maxStudents", "maxTeachers", "maxCampuses"] as const;
  if (saved.plan !== plan || numericFields.slice(1).some((field) => !Number.isFinite(saved[field]))) {
    return { ...PLANS[plan], contractVersion: COMMERCIAL_CONTRACT.version, priceCurrency: COMMERCIAL_CONTRACT.currency, aiCreditPolicy: AI_CREDIT_POLICY };
  }
  const featureFlags = ["whatsappEnabled", "pdfExportEnabled", "pdfBulkExport", "analyticsEnabled"] as const;
  if (featureFlags.some((field) => typeof saved[field] !== "boolean")) {
    return { ...PLANS[plan], contractVersion: COMMERCIAL_CONTRACT.version, priceCurrency: COMMERCIAL_CONTRACT.currency, aiCreditPolicy: AI_CREDIT_POLICY };
  }
  const savedPolicy = saved.aiCreditPolicy && typeof saved.aiCreditPolicy === "object" && !Array.isArray(saved.aiCreditPolicy)
    ? saved.aiCreditPolicy as typeof AI_CREDIT_POLICY
    : AI_CREDIT_POLICY;
  return {
    ...PLANS[plan],
    name: typeof saved.name === "string" ? saved.name : PLANS[plan].name,
    price: saved.price === null || Number.isFinite(saved.price) ? saved.price as number | null : PLANS[plan].price,
    priceLabel: typeof saved.priceLabel === "string" ? saved.priceLabel : PLANS[plan].priceLabel,
    features: Array.isArray(saved.features) && saved.features.every((item) => typeof item === "string") ? saved.features as string[] : PLANS[plan].features,
    aiCredits: saved.aiCredits as number,
    maxStudents: saved.maxStudents as number,
    maxTeachers: saved.maxTeachers as number,
    maxCampuses: saved.maxCampuses as number,
    whatsappEnabled: saved.whatsappEnabled as boolean,
    pdfExportEnabled: saved.pdfExportEnabled as boolean,
    pdfBulkExport: saved.pdfBulkExport as boolean,
    analyticsEnabled: saved.analyticsEnabled as boolean,
    contractVersion: typeof saved.catalogVersion === "string" ? saved.catalogVersion : COMMERCIAL_CONTRACT.version,
    priceCurrency: typeof saved.priceCurrency === "string" ? saved.priceCurrency : COMMERCIAL_CONTRACT.currency,
    aiCreditPolicy: savedPolicy,
  };
}

/** Throw on any entitlement field or credit policy drift before a release. */
export function validateCommercialContract() {
  const errors: string[] = [];
  for (const type of PLAN_ORDER) {
    const plan = COMMERCIAL_CONTRACT.plans[type];
    if (plan.type !== type) errors.push(`${type}: plan id differs from catalogue key`);
    if (plan.price !== null && plan.price < 0) errors.push(`${type}: price cannot be negative`);
    if (plan.aiCredits < 0 || plan.maxStudents < -1 || plan.maxTeachers < -1 || plan.maxCampuses < -1) {
      errors.push(`${type}: invalid allowance or limit`);
    }
    if (plan.features.some((feature) => /rollover/i.test(feature))) {
      errors.push(`${type}: marketing feature promises credit rollover, but credits expire at reset`);
    }
    const expectedLimits = [
      `${plan.aiCredits.toLocaleString()} AI credits/month`,
      plan.maxStudents < 0 ? "Unlimited students" : `Up to ${plan.maxStudents.toLocaleString()} students`,
    ];
    for (const expected of expectedLimits) {
      if (!plan.features.some((feature) => feature.toLowerCase() === expected.toLowerCase())) {
        errors.push(`${type}: feature copy must match enforced limit “${expected}”`);
      }
    }
  }
  if (COMMERCIAL_CONTRACT.currency !== "PKR") errors.push("The configured price amounts must retain their PKR currency identity");
  if (AI_CREDIT_POLICY.unused !== "expire-at-calendar-month-reset") errors.push("The displayed credit policy must match the monthly reset job");
  return errors;
}
