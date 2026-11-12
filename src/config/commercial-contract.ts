import { AI_CREDIT_POLICY, COMMERCIAL_CATALOG_VERSION, PLAN_ORDER, PLANS, type PlanFeature } from "@/config/plans";
import { COUNTRIES, currencyForCountry, type Country } from "@/lib/locale/country";
import { planPriceLabel } from "@/lib/billing/plan-pricing";
import type { PlanDetails, PlanPricing, PlanType } from "@/types";

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

/** Feature flags in their metadata order: the four flags of terms saved before 2026-11-12.1, then the rest. */
const LEGACY_FEATURE_FLAGS = ["whatsappEnabled", "pdfExportEnabled", "pdfBulkExport", "analyticsEnabled"] as const;
export const PLAN_FEATURE_FLAGS = [
  ...LEGACY_FEATURE_FLAGS,
  "timetableEnabled", "examPlanningEnabled", "aiWorkflowsEnabled", "examStudioEnabled",
  "markSheetScanEnabled", "aiRemarksEnabled", "groupConsoleEnabled", "apiAccessEnabled",
] as const satisfies readonly PlanFeature[];
/** Flags first gated by catalogue 2026-11-12.1. Terms approved before it keep them (nothing was gated then). */
const NEW_FEATURE_FLAGS = PLAN_FEATURE_FLAGS.slice(LEGACY_FEATURE_FLAGS.length) as Exclude<PlanFeature, (typeof LEGACY_FEATURE_FLAGS)[number]>[];
const PRICING_MODELS: readonly PlanPricing[] = ["per_student", "per_school"];

type PlanFlags = Record<PlanFeature, boolean>;

export type PlanContract = PlanFlags & {
  catalogVersion: string;
  effectiveAt: string;
  plan: PlanType;
  name: string;
  pricing: PlanPricing;
  price: number | null;
  priceCurrency: string;
  priceLabel: string;
  minBilledStudents: number;
  /** Students a per-student quote was priced for; null for a flat price or terms not tied to a quote. */
  billedStudents: number | null;
  features: string[];
  aiCredits: number;
  aiCreditsPerStudent: number;
  maxStudents: number;
  maxTeachers: number;
  maxCampuses: number;
  aiCreditPolicy: typeof AI_CREDIT_POLICY;
};

type PlanContractOverrides = Partial<Omit<PlanContract, "plan" | "effectiveAt">> & { effectiveAt?: Date | string };

/** What terms approved before 2026-11-12.1 meant: one flat monthly price, and every feature it now gates. */
const LEGACY_TERMS = {
  pricing: "per_school",
  minBilledStudents: 0,
  aiCreditsPerStudent: 0,
  billedStudents: null,
  ...Object.fromEntries(NEW_FEATURE_FLAGS.map((flag) => [flag, true])),
} as Pick<PlanContract, "pricing" | "minBilledStudents" | "aiCreditsPerStudent" | "billedStudents" | (typeof NEW_FEATURE_FLAGS)[number]>;

export function createPlanContract(plan: PlanType, overrides: PlanContractOverrides = {}): PlanContract {
  const details = COMMERCIAL_CONTRACT.plans[plan];
  const price = overrides.price === undefined ? details.price : overrides.price;
  const aiCredits = overrides.aiCredits ?? details.aiCredits;
  const features = overrides.features ?? details.features.map((feature) =>
    /AI credits\/month/i.test(feature) ? `${aiCredits.toLocaleString()} AI credits/month` : feature
  );
  const pricing = overrides.pricing ?? details.pricing;
  const priceCurrency = overrides.priceCurrency ?? COMMERCIAL_CONTRACT.currency;
  return {
    catalogVersion: overrides.catalogVersion ?? COMMERCIAL_CONTRACT.version,
    effectiveAt: (overrides.effectiveAt instanceof Date ? overrides.effectiveAt : new Date(overrides.effectiveAt ?? Date.now())).toISOString(),
    plan,
    name: overrides.name ?? details.name,
    pricing,
    price,
    priceCurrency,
    priceLabel: overrides.priceLabel ?? (price === details.price && pricing === details.pricing ? details.priceLabel : planPriceLabel({ price, pricing }, priceCurrency)),
    minBilledStudents: overrides.minBilledStudents ?? details.minBilledStudents,
    billedStudents: overrides.billedStudents ?? null,
    features: [...features],
    aiCredits,
    aiCreditsPerStudent: overrides.aiCreditsPerStudent ?? details.aiCreditsPerStudent,
    maxStudents: overrides.maxStudents ?? details.maxStudents,
    maxTeachers: overrides.maxTeachers ?? details.maxTeachers,
    maxCampuses: overrides.maxCampuses ?? details.maxCampuses,
    ...Object.fromEntries(PLAN_FEATURE_FLAGS.map((flag) => [flag, overrides[flag] ?? details[flag]])) as PlanFlags,
    aiCreditPolicy: overrides.aiCreditPolicy ?? AI_CREDIT_POLICY,
  };
}

/**
 * Compact, signed-provider metadata for preserving an open checkout's quote. Eighteen fields since catalogue
 * 2026-11-12.1 (pricing, billing minimum, per-student credits and the quoted student count appended, twelve
 * flag bits); an open checkout quoted before it carries the fourteen-field form and decodes as legacy terms.
 */
export function encodePlanContractMetadata(contract: PlanContract) {
  const flags = PLAN_FEATURE_FLAGS.map((flag) => contract[flag] ? "1" : "0").join("");
  const value = JSON.stringify([
    contract.catalogVersion, contract.effectiveAt, contract.plan, contract.name, contract.price,
    contract.priceCurrency, contract.priceLabel, contract.aiCredits, contract.maxStudents,
    contract.maxTeachers, contract.maxCampuses, flags, contract.features,
    Object.values(contract.aiCreditPolicy),
    contract.pricing, contract.minBilledStudents, contract.aiCreditsPerStudent, contract.billedStudents,
  ]);
  if (value.length > 500) throw new Error("Plan contract metadata exceeds the payment provider limit");
  return value;
}

export function decodePlanContractMetadata(value: string | null | undefined, expectedPlan: PlanType): PlanContract | null {
  if (!value) return null;
  try {
    const saved: unknown = JSON.parse(value);
    if (!Array.isArray(saved) || (saved.length !== 14 && saved.length !== 18)) return null;
    const legacy = saved.length === 14;
    const [catalogVersion, effectiveAt, plan, name, price, priceCurrency, priceLabel, aiCredits, maxStudents, maxTeachers, maxCampuses, flags, features, creditPolicy, pricing, minBilledStudents, aiCreditsPerStudent, billedStudents] = saved;
    if (
      typeof catalogVersion !== "string" || typeof effectiveAt !== "string" || !Number.isFinite(Date.parse(effectiveAt)) ||
      plan !== expectedPlan || typeof name !== "string" || !(price === null || Number.isFinite(price)) ||
      priceCurrency !== COMMERCIAL_CONTRACT.currency || typeof priceLabel !== "string" ||
      ![aiCredits, maxStudents, maxTeachers, maxCampuses].every(Number.isInteger) ||
      typeof flags !== "string" || !(legacy ? /^[01]{4}$/ : /^[01]{12}$/).test(flags) ||
      !Array.isArray(features) || !features.every((item) => typeof item === "string") ||
      !Array.isArray(creditPolicy) || creditPolicy.length !== 3 || !creditPolicy.every((item) => typeof item === "string")
    ) return null;
    if (!legacy && (
      !PRICING_MODELS.includes(pricing as PlanPricing) || ![minBilledStudents, aiCreditsPerStudent].every((n) => Number.isInteger(n) && n >= 0) ||
      !(billedStudents === null || (Number.isInteger(billedStudents) && billedStudents >= 0))
    )) return null;
    const bits = Object.fromEntries((legacy ? LEGACY_FEATURE_FLAGS : PLAN_FEATURE_FLAGS).map((flag, index) => [flag, flags[index] === "1"]));
    return createPlanContract(expectedPlan, {
      catalogVersion, effectiveAt, name, price: price as number | null, priceCurrency, priceLabel,
      aiCredits: aiCredits as number, maxStudents: maxStudents as number, maxTeachers: maxTeachers as number,
      maxCampuses: maxCampuses as number, features: features as string[],
      aiCreditPolicy: { allowance: creditPolicy[0], unused: creditPolicy[1], reset: creditPolicy[2] } as typeof AI_CREDIT_POLICY,
      ...(legacy ? LEGACY_TERMS : {
        pricing: pricing as PlanPricing, minBilledStudents: minBilledStudents as number,
        aiCreditsPerStudent: aiCreditsPerStudent as number, billedStudents: billedStudents as number | null,
      }),
      ...bits,
    });
  } catch {
    return null;
  }
}

/** A school's terms: its plan details as saved, the catalogue version they came from, and the quoted student count. */
export type SchoolPlanTerms = PlanDetails & {
  contractVersion: string;
  priceCurrency: string;
  aiCreditPolicy: typeof AI_CREDIT_POLICY;
  billedStudents: number | null;
};

function catalogueTerms(plan: PlanType): SchoolPlanTerms {
  return { ...PLANS[plan], contractVersion: COMMERCIAL_CONTRACT.version, priceCurrency: COMMERCIAL_CONTRACT.currency, aiCreditPolicy: AI_CREDIT_POLICY, billedStudents: null };
}

/**
 * Resolve current-account terms from its persisted snapshot, falling back only for pre-migration rows.
 *
 * Terms saved before catalogue 2026-11-12.1 have no `pricing`. A paid school keeps them as approved — a flat
 * monthly price, its limits and credits — and keeps every feature the new catalogue gates, because none was
 * gated when they were approved ("retain-approved-terms-until-authorized-change-process"). The free plan has no
 * approved terms to keep: an old free snapshot reads as today's Core (no caps, PDF export, no flagship).
 */
export function getSchoolPlanContract(plan: PlanType, snapshot: unknown): SchoolPlanTerms {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return catalogueTerms(plan);
  const saved = snapshot as Record<string, unknown>;
  const numericFields = ["price", "aiCredits", "maxStudents", "maxTeachers", "maxCampuses"] as const;
  if (saved.plan !== plan || numericFields.slice(1).some((field) => !Number.isFinite(saved[field]))) return catalogueTerms(plan);
  if (LEGACY_FEATURE_FLAGS.some((field) => typeof saved[field] !== "boolean")) return catalogueTerms(plan);
  const legacy = saved.pricing === undefined;
  if (legacy && plan === "FREE") return catalogueTerms(plan);
  if (!legacy && (
    !PRICING_MODELS.includes(saved.pricing as PlanPricing) ||
    !["minBilledStudents", "aiCreditsPerStudent"].every((field) => Number.isFinite(saved[field]) && (saved[field] as number) >= 0) ||
    NEW_FEATURE_FLAGS.some((field) => typeof saved[field] !== "boolean")
  )) return catalogueTerms(plan);
  const savedPolicy = saved.aiCreditPolicy && typeof saved.aiCreditPolicy === "object" && !Array.isArray(saved.aiCreditPolicy)
    ? saved.aiCreditPolicy as typeof AI_CREDIT_POLICY
    : AI_CREDIT_POLICY;
  const savedTerms = legacy ? LEGACY_TERMS : {
    pricing: saved.pricing as PlanPricing,
    minBilledStudents: saved.minBilledStudents as number,
    aiCreditsPerStudent: saved.aiCreditsPerStudent as number,
    billedStudents: Number.isInteger(saved.billedStudents) ? saved.billedStudents as number : null,
    ...Object.fromEntries(NEW_FEATURE_FLAGS.map((flag) => [flag, saved[flag] as boolean])),
  };
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
    ...Object.fromEntries(LEGACY_FEATURE_FLAGS.map((flag) => [flag, saved[flag] as boolean])),
    ...savedTerms,
    contractVersion: typeof saved.catalogVersion === "string" ? saved.catalogVersion : COMMERCIAL_CONTRACT.version,
    priceCurrency: typeof saved.priceCurrency === "string" ? saved.priceCurrency : COMMERCIAL_CONTRACT.currency,
    aiCreditPolicy: savedPolicy,
  } as SchoolPlanTerms;
}

/** Feature copy that names a gated capability, and the flag that must back it ("capabilities" claims policy). */
const FEATURE_CLAIMS: Array<[RegExp, PlanFeature]> = [
  [/\btimetable\b/i, "timetableEnabled"],
  [/\bdate sheets?\b|\bseating\b|\binvigilation\b/i, "examPlanningEnabled"],
  [/\bwhatsapp\b/i, "whatsappEnabled"],
  [/\bPDF export\b/i, "pdfExportEnabled"],
  [/\bbulk PDF\b/i, "pdfBulkExport"],
  [/\bAI Workflows\b/i, "aiWorkflowsEnabled"],
  [/\bExam Studio\b/i, "examStudioEnabled"],
  [/\bscan\b/i, "markSheetScanEnabled"],
  [/\bremarks\b/i, "aiRemarksEnabled"],
  [/\banalytics\b/i, "analyticsEnabled"],
  [/\bgroup console\b/i, "groupConsoleEnabled"],
  [/\bAPI access\b/i, "apiAccessEnabled"],
];

/** Throw on any entitlement field or credit policy drift before a release. */
export function validateCommercialContract() {
  const errors: string[] = [];
  PLAN_ORDER.forEach((type, index) => {
    const plan = COMMERCIAL_CONTRACT.plans[type];
    if (plan.type !== type) errors.push(`${type}: plan id differs from catalogue key`);
    if (plan.price !== null && plan.price < 0) errors.push(`${type}: price cannot be negative`);
    if (!PRICING_MODELS.includes(plan.pricing)) errors.push(`${type}: unknown pricing model`);
    if (!Number.isInteger(plan.minBilledStudents) || plan.minBilledStudents < 0) errors.push(`${type}: invalid billing minimum`);
    if (plan.pricing === "per_school" && plan.minBilledStudents !== 0) errors.push(`${type}: a flat price has no student billing minimum`);
    if (plan.aiCredits < 0 || plan.aiCreditsPerStudent < 0 || plan.maxStudents < -1 || plan.maxTeachers < -1 || plan.maxCampuses < -1) {
      errors.push(`${type}: invalid allowance or limit`);
    }
    if (plan.features.some((feature) => /rollover/i.test(feature))) {
      errors.push(`${type}: marketing feature promises credit rollover, but credits expire at reset`);
    }
    // Copy that states a limit or allowance must state the enforced value; a capped plan must state its cap.
    const credits = plan.features.find((feature) => /AI credits\/month/i.test(feature));
    if (credits && credits.toLowerCase() !== `${plan.aiCredits.toLocaleString()} AI credits/month`.toLowerCase()) {
      errors.push(`${type}: feature copy must match enforced limit “${plan.aiCredits.toLocaleString()} AI credits/month”`);
    }
    const studentsCopy = plan.maxStudents < 0 ? "Unlimited students" : `Up to ${plan.maxStudents.toLocaleString()} students`;
    const studentClaim = plan.features.find((feature) => /^(unlimited students|up to [\d,]+ students)/i.test(feature));
    if ((studentClaim || plan.maxStudents >= 0) && !studentClaim?.toLowerCase().startsWith(studentsCopy.toLowerCase())) {
      errors.push(`${type}: feature copy must match enforced limit “${studentsCopy}”`);
    }
    for (const [claim, flag] of FEATURE_CLAIMS) {
      if (!plan[flag] && plan.features.some((feature) => claim.test(feature))) errors.push(`${type}: feature copy describes ${flag}, which the plan does not enable`);
    }
    // "Everything in <previous plan>" promises every feature that plan enables.
    const previous = index > 0 ? COMMERCIAL_CONTRACT.plans[PLAN_ORDER[index - 1]] : null;
    if (previous && plan.features.includes(`Everything in ${previous.name}`)) {
      for (const flag of PLAN_FEATURE_FLAGS) if (previous[flag] && !plan[flag]) errors.push(`${type}: “Everything in ${previous.name}” but ${flag} is off`);
    }
  });
  if (COMMERCIAL_CONTRACT.currency !== "PKR") errors.push("The configured price amounts must retain their PKR currency identity");
  if (AI_CREDIT_POLICY.unused !== "expire-at-calendar-month-reset") errors.push("The displayed credit policy must match the monthly reset job");
  return errors;
}
