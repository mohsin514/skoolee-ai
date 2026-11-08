/**
 * SKAI-1017: bounded pilot offer, commercial-stage classification and payment-readiness label.
 * Pure helpers; no outreach, signing or payment is executed here. Contract text requires legal review.
 */
export type PilotMarket = "PAKISTAN" | "KSA" | "UAE_DUBAI";
export const MARKET_CURRENCY: Record<PilotMarket, "PKR" | "SAR" | "AED"> = { PAKISTAN: "PKR", KSA: "SAR", UAE_DUBAI: "AED" };

/** Provider/rail availability recorded from the repository on 2026-10-29. Only SafePay (PKR) exists, sandbox only. */
export const PAYMENT_RAILS: Record<PilotMarket, { provider: string | null; sandboxTested: PaymentPath[] }> = {
  PAKISTAN: { provider: "SafePay", sandboxTested: [] },
  KSA: { provider: null, sandboxTested: [] },
  UAE_DUBAI: { provider: null, sandboxTested: [] },
};

export const PAYMENT_PATHS = ["SUCCESS", "FAILURE", "REFUND", "WEBHOOK", "RECONCILIATION"] as const;
export type PaymentPath = (typeof PAYMENT_PATHS)[number];

export type PaymentReadiness = { market: PilotMarket; label: "UNAVAILABLE" | "SANDBOX_INCOMPLETE" | "SANDBOX_VERIFIED"; missing: PaymentPath[] };

/** Currency formatting never implies readiness; only recorded sandbox evidence for every path does. Live readiness is out of scope. */
export function paymentReadiness(market: PilotMarket, rails = PAYMENT_RAILS): PaymentReadiness {
  const rail = rails[market];
  if (!rail.provider) return { market, label: "UNAVAILABLE", missing: [...PAYMENT_PATHS] };
  const missing = PAYMENT_PATHS.filter((p) => !rail.sandboxTested.includes(p));
  return { market, label: missing.length ? "SANDBOX_INCOMPLETE" : "SANDBOX_VERIFIED", missing };
}

export type CommercialStage = "DEMO_INTEREST" | "DECLINED_PAYMENT" | "UNDECIDED" | "CONSENTED_PILOT" | "PAID_COMMITMENT";
export type StageEvidence = {
  demoAttended?: boolean; declinedToPay?: boolean;
  signedAgreementRef?: string; settlementRef?: string;
};

/** Strongest stage the evidence proves; intentions without references never advance. */
export function classifyStage(e: StageEvidence): CommercialStage {
  const has = (v?: string) => typeof v === "string" && v.trim().length >= 4;
  if (has(e.signedAgreementRef) && has(e.settlementRef)) return "PAID_COMMITMENT";
  if (has(e.signedAgreementRef)) return "CONSENTED_PILOT";
  if (e.declinedToPay) return "DECLINED_PAYMENT";
  if (e.demoAttended) return "DEMO_INTEREST";
  return "UNDECIDED";
}

export type PilotProposal = {
  version: number; market: PilotMarket; city: string; pack: string; academicYear: string;
  campuses: number; users: number; startsOn: string; endsOn: string;
  /** null = explicitly undecided. */
  amount: number | null; currency: "PKR" | "SAR" | "AED";
  budgetApprover?: string; academicChampion?: string; dataProcessingApprover?: string;
  baselineCriteria?: string; exitExport?: string; claims: string[];
};

const FORBIDDEN_CLAIMS: [RegExp, string][] = [
  [/\b(erp|sis)\s+replace/i, "ERP/SIS replacement"],
  [/guarantee/i, "guaranteed accuracy or time savings"],
  [/\b(certified|certification|official(ly)? (approved|endorsed))\b/i, "official certification"],
  [/\b(noor|madrasati|khda)\b.*\b(integrat|connect|sync)/i, "unsupported live connector"],
  [/\b(compliant|compliance with)\b/i, "unreviewed compliance claim"],
];

export function validateProposal(p: PilotProposal): string[] {
  const problems: string[] = [];
  if (p.currency !== MARKET_CURRENCY[p.market]) problems.push(`Currency must be ${MARKET_CURRENCY[p.market]} for ${p.market}.`);
  if (p.campuses < 1 || p.campuses > 2) problems.push("A bounded pilot covers one school and at most two campuses.");
  if (p.amount !== null && p.amount < 0) problems.push("Amount cannot be negative; use null for undecided.");
  if (!(p.startsOn < p.endsOn)) problems.push("End date must follow start date.");
  for (const [field, label] of [["budgetApprover", "budget approver"], ["academicChampion", "academic champion"], ["dataProcessingApprover", "data-processing approver"], ["baselineCriteria", "baseline/follow-up criteria"], ["exitExport", "exit/export arrangement"]] as const) {
    if (!p[field]?.trim()) problems.push(`Record the ${label}.`);
  }
  for (const claim of p.claims) for (const [re, label] of FORBIDDEN_CLAIMS) if (re.test(claim)) problems.push(`Claim not allowed (${label}): "${claim}"`);
  return problems;
}
