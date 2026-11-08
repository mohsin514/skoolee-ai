import { z } from "zod";
import { evaluatePilotEligibility, pilotEligibilityInputSchema } from "./pilot-eligibility";

/**
 * SKAI-1018 (D2-12) school-specific pilot readiness gate and go/no-go review record.
 * Extends the SKAI-1007 eligibility rule: a pack that is eligible in principle stays unavailable
 * for a named school until every readiness item is evidenced and a signed go decision exists.
 * Markets are evaluated independently; nothing here activates a chain or all markets at once.
 */

export const MARKETS = ["PAKISTAN", "KSA", "DUBAI"] as const;
export type Market = (typeof MARKETS)[number];

/** Sequential release: KSA and Dubai readiness are independent, but neither precedes the Pakistan validation decision. */
export const MARKET_SEQUENCE: Record<Market, Market[]> = { PAKISTAN: [], KSA: ["PAKISTAN"], DUBAI: ["PAKISTAN"] };

export function marketOf(geography: string): Market | null {
  if (geography.startsWith("PAKISTAN_")) return "PAKISTAN";
  if (geography.startsWith("KSA_")) return "KSA";
  if (geography === "UAE_DUBAI") return "DUBAI";
  return null;
}

/** Each item names the owning ticket so a missing item points at who must supply the evidence. */
export const READINESS_ITEMS = {
  PACK_EDITION_APPROVAL: "SKAI-1008 / pack ticket",
  SOURCE_RIGHTS: "SKAI-1008 / pack ticket",
  LANGUAGE_QA: "SKAI-1013",
  END_TO_END_CYCLE: "SKAI-1014",
  EXCHANGE_RECOVERY: "SKAI-1015",
  LEGAL_SECURITY_PERMISSIONS: "SKAI-1016 / SKAI-1000",
  SCHOOL_PERMISSIONS: "School approver",
  COMMERCIAL_SCOPE: "D1 / SKAI-894",
  AI05_STATUS: "AI-05 release gate",
} as const;
export type ReadinessItem = keyof typeof READINESS_ITEMS;
const itemKeys = Object.keys(READINESS_ITEMS) as [ReadinessItem, ...ReadinessItem[]];

const ref = z.string().trim().min(4).max(300);
const isoDate = z.iso.date();
const person = z.string().trim().min(2).max(120).refine((v) => !/@/.test(v) && !/\d{7,}/.test(v.replace(/[\s-]/g, "")), "Use a role or pseudonym, not an email or phone number.");

const evidenceSchema = z.object({
  item: z.enum(itemKeys),
  status: z.enum(["MISSING", "IN_REVIEW", "PASSED", "WAIVED_NOT_APPLICABLE"]),
  reference: ref.optional(), reviewer: person.optional(), reviewedOn: isoDate.optional(),
  /** AI-05 may legitimately be "AI_OFF" (pilot runs with AI disabled); any other item cannot be waived. */
  note: z.string().trim().max(500).optional(),
}).strict();

export const readinessRecordSchema = z.object({
  schoolScope: z.object({
    schoolRef: z.string().trim().min(1).max(100), campusRefs: z.array(z.string().trim().min(1).max(100)).min(1).max(10),
    academicLead: person, teachers: z.array(person).min(1).max(10),
    /** Required when fewer than two campuses or two teachers are available. */
    scopeException: z.string().trim().min(10).max(500).optional(),
  }).strict(),
  pack: pilotEligibilityInputSchema,
  evidence: z.array(evidenceSchema).max(40),
  /** Existing SKO-430 measurement console pilot id; thresholds are set before any measurement. */
  measurement: z.object({ pilotId: z.string().trim().min(1).max(100), thresholdsAgreedOn: isoDate, thresholdsReference: ref, baselineDefined: z.boolean() }).strict().optional(),
  decision: z.object({
    outcome: z.enum(["GO", "NARROW", "STOP", "DEFER"]), rationale: z.string().trim().min(20).max(2000),
    founderApprover: person, schoolApprover: person, decidedOn: isoDate,
    rollbackPlan: ref, exitExportPlan: ref, salesClaimsReviewed: z.boolean(),
    negativeEvidence: z.array(z.string().trim().min(4).max(500)).max(50),
  }).strict().optional(),
}).strict();
export type ReadinessRecord = z.input<typeof readinessRecordSchema>;

export type ReadinessResult =
  | { ready: true; market: Market }
  | { ready: false; market: Market | null; blockers: { item: string; reason: string }[] };

/**
 * Fail-closed: every listed item must be PASSED with a reference, reviewer and date, the
 * SKAI-1007 eligibility rule must pass, measurement thresholds must predate the decision, and
 * the signed decision must be GO. `approvedMarkets` are markets whose own go decision is recorded.
 */
export function evaluatePilotReadiness(raw: unknown, approvedMarkets: ReadonlySet<Market> = new Set(), now = new Date()): ReadinessResult {
  const parsed = readinessRecordSchema.safeParse(raw);
  if (!parsed.success) return { ready: false, market: null, blockers: [{ item: "RECORD", reason: "The readiness record is incomplete or invalid." }] };
  const r = parsed.data;
  const market = marketOf(r.pack.geography);
  const blockers: { item: string; reason: string }[] = [];
  const eligibility = evaluatePilotEligibility(r.pack, now);
  if (!eligibility.eligible) blockers.push({ item: "PACK_ELIGIBILITY", reason: eligibility.reason });
  if (!market) return { ready: false, market, blockers: [...blockers, { item: "MARKET", reason: "Geography is outside the three D2 markets." }] };
  for (const prior of MARKET_SEQUENCE[market]) if (!approvedMarkets.has(prior)) blockers.push({ item: "SEQUENCE", reason: `${prior} validation must reach a recorded go decision first.` });

  const { campusRefs, teachers, scopeException } = r.schoolScope;
  if ((new Set(campusRefs).size < 2 || new Set(teachers).size < 2) && !scopeException) blockers.push({ item: "SCHOOL_SCOPE", reason: "Two campuses and two teachers are expected; document the exception." });

  for (const item of itemKeys) {
    const rows = r.evidence.filter((e) => e.item === item);
    if (rows.length !== 1) { blockers.push({ item, reason: rows.length ? "Recorded more than once." : `Missing evidence (owner ${READINESS_ITEMS[item]}).` }); continue; }
    const e = rows[0];
    const waivable = item === "AI05_STATUS" && e.status === "WAIVED_NOT_APPLICABLE" && /AI_OFF/.test(e.note ?? "");
    if (e.status !== "PASSED" && !waivable) { blockers.push({ item, reason: `Status is ${e.status}.` }); continue; }
    if (!e.reference || !e.reviewer || !e.reviewedOn) blockers.push({ item, reason: "Evidence needs a reference, reviewer and review date." });
    else if (e.reviewedOn > now.toISOString().slice(0, 10)) blockers.push({ item, reason: "Review date is in the future." });
  }

  if (!r.measurement?.baselineDefined) blockers.push({ item: "MEASUREMENT", reason: "Link the measurement-console pilot and define the baseline before go." });
  const d = r.decision;
  if (!d) blockers.push({ item: "DECISION", reason: "No signed go/no-go decision is recorded." });
  else {
    if (d.outcome !== "GO") blockers.push({ item: "DECISION", reason: `Decision is ${d.outcome}; the pilot stays unavailable.` });
    if (!d.salesClaimsReviewed) blockers.push({ item: "DECISION", reason: "Sales and demo claims have not been reviewed for truthfulness." });
    if (r.measurement && r.measurement.thresholdsAgreedOn > d.decidedOn) blockers.push({ item: "MEASUREMENT", reason: "Success thresholds must be agreed before the decision." });
  }
  return blockers.length ? { ready: false, market, blockers } : { ready: true, market };
}
