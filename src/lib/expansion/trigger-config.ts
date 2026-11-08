/**
 * SKAI-1108: market expansion triggers from the founder decision log
 * (docs/product-review-2026-10/SKAI-1006-market-expansion.md, section 4: "DEFER with triggers").
 * Every threshold lives here. A market reopens only when all of its conditions are met.
 */
export type TriggerKind = "count" | "boolean";
export type TriggerCondition = { id: string; metric: string; kind: TriggerKind; threshold: number | true; source: string };
export type ExpansionTrigger = { market: string; conditions: readonly TriggerCondition[]; anyOf?: boolean };

export const EXPANSION_TRIGGERS: readonly ExpansionTrigger[] = [
  { market: "Rest of UAE", conditions: [
    { id: "uae-dubai-go", metric: "Dubai cohort meets the SKAI-1005 GO metrics", kind: "boolean", threshold: true, source: "SKAI-1005 cohort review" },
    { id: "uae-dubai-paying", metric: "Paying schools in Dubai", kind: "count", threshold: 5, source: "Billing" },
  ] },
  { market: "Qatar, Oman, Kuwait, Bahrain", conditions: [
    { id: "ksa-community-go", metric: "KSA community-school segment is GO", kind: "boolean", threshold: true, source: "SKAI-1005 cohort review" },
    { id: "gcc-inbound", metric: "Inbound requests from one of these countries", kind: "count", threshold: 3, source: "Sales inbox" },
    { id: "gcc-data-law", metric: "Data-law review complete", kind: "boolean", threshold: true, source: "Legal" },
  ] },
  { market: "UK supplementary", anyOf: true, conditions: [
    { id: "uk-demand", metric: "Schools with unsolicited demand", kind: "count", threshold: 10, source: "Sales inbox" },
    { id: "uk-gcse-pack", metric: "A GCSE/A-level content pack exists", kind: "boolean", threshold: true, source: "Curriculum catalogue" },
  ] },
  { market: "Egypt, Bangladesh, Malaysia", conditions: [
    { id: "second-curriculum-family", metric: "A second curriculum family ships in Exam Studio", kind: "boolean", threshold: true, source: "Curriculum catalogue" },
    { id: "pk-gcc-arr", metric: "PK + GCC ARR target in d1-business-model.md met", kind: "boolean", threshold: true, source: "Finance" },
  ] },
];

/**
 * Observed values, updated by PR at the quarterly review (no live data source exists yet). A missing
 * value counts as not met: the tracker fails closed.
 */
export const EXPANSION_OBSERVATIONS: { asOf: string; values: Partial<Record<string, number | boolean>> } = {
  asOf: "2026-10-29",
  values: {},
};
