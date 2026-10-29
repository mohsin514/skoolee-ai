/**
 * SKAI-1016: per-market trust gate for real-school processing. Requires legal review.
 * Each market is evaluated on its own so an unresolved KSA or Dubai item never blocks another market.
 */
export const TRUST_MARKETS = ["PAKISTAN", "KSA", "UAE_DUBAI"] as const;
export type TrustMarket = (typeof TRUST_MARKETS)[number];

export const TRUST_REQUIREMENTS = [
  "LEGAL_REVIEW", "SECURITY_REVIEW", "TRANSFER_BASIS", "DPA_VERSION", "NOTICES",
  "SOURCE_RIGHTS_AI_DISCLOSURE", "DELETION_EXPORT_TESTED", "SCHOOL_ACCEPTANCE",
] as const;
export type TrustRequirement = (typeof TRUST_REQUIREMENTS)[number];

export const REQUIRED_NOTICE_LOCALES: Record<TrustMarket, readonly string[]> = {
  PAKISTAN: ["en", "ur"], KSA: ["ar", "en"], UAE_DUBAI: ["ar", "en"],
};

export type TrustEvidence = {
  requirement: TrustRequirement;
  /** Restricted-storage reference; never personal data or agreement text. */
  reference: string;
  reviewedAt: Date;
  reviewDueAt?: Date;
  locales?: string[];
};

export type MarketReadiness =
  | { market: TrustMarket; ready: true }
  | { market: TrustMarket; ready: false; missing: TrustRequirement[]; reasons: string[] };

export function evaluateMarketTrust(market: TrustMarket, evidence: readonly TrustEvidence[], now = new Date()): MarketReadiness {
  const missing: TrustRequirement[] = [];
  const reasons: string[] = [];
  for (const requirement of TRUST_REQUIREMENTS) {
    const item = evidence.find((e) => e.requirement === requirement && e.reference.trim().length >= 4);
    if (!item) { missing.push(requirement); reasons.push(`${requirement} has no recorded review.`); continue; }
    if (item.reviewedAt > now) { missing.push(requirement); reasons.push(`${requirement} is dated in the future.`); continue; }
    if (item.reviewDueAt && item.reviewDueAt <= now) { missing.push(requirement); reasons.push(`${requirement} review has expired.`); continue; }
    if (requirement === "NOTICES") {
      const absent = REQUIRED_NOTICE_LOCALES[market].filter((l) => !item.locales?.includes(l));
      if (absent.length) { missing.push(requirement); reasons.push(`Notices missing locales: ${absent.join(", ")}.`); }
    }
  }
  return missing.length ? { market, ready: false, missing, reasons } : { market, ready: true };
}

export function evaluateAllMarkets(evidence: Partial<Record<TrustMarket, readonly TrustEvidence[]>>, now = new Date()) {
  return TRUST_MARKETS.map((m) => evaluateMarketTrust(m, evidence[m] ?? [], now));
}
