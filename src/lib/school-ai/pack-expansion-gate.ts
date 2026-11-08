import { z } from "zod";
import type { Market } from "./pilot-readiness";

/**
 * SKAI-1019 (D2-13) science and SKAI-1020 (D2-14) later-grade / alternative-board gate.
 * Every deferred pack is a separate candidate with its own identity; none inherits support from
 * another (0625 never inherits 0580, other Punjab boards never inherit BISE Lahore, BSEK SSC is
 * not BIEK HSC, US/IB are never "equivalent" to Cambridge). All start UNVERIFIED and unavailable.
 */

export const EXPANSION_KINDS = ["SCIENCE", "LATER_GRADE", "ALTERNATIVE_BOARD", "ALTERNATIVE_CURRICULUM"] as const;
export const DECISIONS = ["PENDING", "ADOPT", "DEFER", "REJECT"] as const;

export type ExpansionCandidate = {
  id: string; kind: (typeof EXPANSION_KINDS)[number]; market: Market;
  board: string; qualification: string; subject: string; grade: string;
  /** Mathematics pack whose verified workflow and go decision must exist first (science only). */
  requiresMathPack?: string;
};

/** Registry of in-market deferred candidates from the approved D2 plan. Identity only; nothing here is verified. */
export const EXPANSION_CANDIDATES: readonly ExpansionCandidate[] = [
  { id: "PK-FBISE-G9-PHYSICS", kind: "SCIENCE", market: "PAKISTAN", board: "FBISE", qualification: "SSC-I", subject: "Physics", grade: "9", requiresMathPack: "PK-FBISE-G9-MATH" },
  { id: "PK-BISELHR-G9-PHYSICS", kind: "SCIENCE", market: "PAKISTAN", board: "BISE Lahore", qualification: "SSC Part I", subject: "Physics", grade: "9", requiresMathPack: "PK-BISELHR-G9-MATH" },
  { id: "AE-CAIE-0625-PHYSICS", kind: "SCIENCE", market: "DUBAI", board: "Cambridge International", qualification: "IGCSE 0625", subject: "Physics", grade: "school-mapped", requiresMathPack: "AE-CAIE-0580-MATH" },
  { id: "SA-MOE-SCIENCE-SCHOOL-SELECTED", kind: "SCIENCE", market: "KSA", board: "MoE national curriculum", qualification: "Intermediate", subject: "Science", grade: "school-selected", requiresMathPack: "SA-MOE-INTERMEDIATE-MATH" },
  { id: "PK-FBISE-G10-MATH", kind: "LATER_GRADE", market: "PAKISTAN", board: "FBISE", qualification: "SSC-II", subject: "Mathematics", grade: "10" },
  { id: "PK-BISELHR-G10-MATH", kind: "LATER_GRADE", market: "PAKISTAN", board: "BISE Lahore", qualification: "SSC Part II", subject: "Mathematics", grade: "10" },
  { id: "PK-BSEK-SSC-MATH", kind: "ALTERNATIVE_BOARD", market: "PAKISTAN", board: "BSEK", qualification: "SSC", subject: "Mathematics", grade: "9" },
  { id: "PK-BIEK-HSC-MATH", kind: "ALTERNATIVE_BOARD", market: "PAKISTAN", board: "BIEK", qualification: "HSC", subject: "Mathematics", grade: "11" },
  { id: "AE-PEARSON-IGCSE-MATH", kind: "ALTERNATIVE_CURRICULUM", market: "DUBAI", board: "Pearson Edexcel", qualification: "International GCSE", subject: "Mathematics", grade: "school-mapped" },
  { id: "AE-CBSE-MATH", kind: "ALTERNATIVE_CURRICULUM", market: "DUBAI", board: "CBSE", qualification: "Secondary (Class X)", subject: "Mathematics", grade: "10" },
  { id: "AE-US-MATH", kind: "ALTERNATIVE_CURRICULUM", market: "DUBAI", board: "US curriculum (school-specific)", qualification: "school-specific", subject: "Mathematics", grade: "school-mapped" },
  { id: "AE-IB-MYP-MATH", kind: "ALTERNATIVE_CURRICULUM", market: "DUBAI", board: "IB", qualification: "MYP", subject: "Mathematics", grade: "school-mapped" },
];

/** Science-specific calibration a subject educator must sign off before any science pack activates. */
export const SCIENCE_CALIBRATION = ["COVERAGE", "DIAGRAMS", "UNITS", "SIGNIFICANT_FIGURES", "NUMERICAL_TOLERANCE", "METHOD_MARKS", "RUBRIC", "PRACTICAL_LIMITATIONS"] as const;

const isoDate = z.iso.date();
const ref = z.string().trim().min(4).max(300);
const signoff = z.object({ role: z.string().trim().min(2).max(120).refine((v) => !/@/.test(v), "Use a role, not an email."), reference: ref, on: isoDate }).strict();

export const expansionRecordSchema = z.object({
  candidateId: z.string().trim().min(1),
  /** Exact, separately verified identity; must match the candidate registry entry. */
  source: z.object({
    board: z.string().trim().min(1), qualification: z.string().trim().min(1), subject: z.string().trim().min(1), grade: z.string().trim().min(1),
    edition: z.string().trim().min(1), examYear: z.string().trim().min(1), academicYear: z.string().trim().min(1), term: z.string().trim().min(1),
    tier: z.string().trim().min(1), language: z.enum(["en", "ar", "ur"]),
    officialUrl: z.url(), retrievedOn: isoDate, rightsStatus: z.enum(["UNKNOWN", "REQUESTED", "SCHOOL_APPROVED", "LICENSED", "DENIED"]),
    verification: z.enum(["UNVERIFIED", "VERIFIED"]),
    /** Must be absent: support is never copied from another pack or an older edition. */
    inheritsFrom: z.string().optional(),
  }).strict(),
  schoolSelection: z.object({ academicOwner: z.string().trim().min(2).max(120), reference: ref, on: isoDate }).strict().optional(),
  /** KSA foreign-curriculum schools reusing an approved Cambridge pack: exact match + school grade mapping. */
  reuseOf: z.object({ approvedPackId: z.string().min(1), qualificationMatches: z.boolean(), tierMatches: z.boolean(), examYearMatches: z.boolean(), schoolGradeMapping: ref }).strict().optional(),
  calibration: z.array(z.object({ area: z.enum(SCIENCE_CALIBRATION), signoff }).strict()).max(20).default([]),
  educatorSignoff: signoff.optional(),
  /** Question/practical types that stay disabled; must be explicit for science even if empty-by-review. */
  disabledQuestionTypes: z.array(z.string().trim().min(2).max(80)).max(50).optional(),
  decision: z.object({ outcome: z.enum(DECISIONS), founder: signoff, educator: signoff, rationale: z.string().trim().min(20).max(2000), boundedTicket: z.string().regex(/^SKAI-\d+$/u).optional() }).strict().optional(),
  /** Readiness outcome of the gate in SKAI-1018, evaluated for this pack's own school pilot. */
  pilotReadinessPassed: z.boolean().default(false),
}).strict();
export type ExpansionRecord = z.input<typeof expansionRecordSchema>;

export type ExpansionResult = { available: true } | { available: false; blockers: string[] };

const norm = (v: string) => v.trim().toLowerCase();

/**
 * Fail-closed availability for one deferred pack. `verifiedMathPacks` lists mathematics packs whose
 * workflow is verified and whose SKAI-1018 go decision is recorded.
 */
export function evaluateExpansion(raw: unknown, verifiedMathPacks: ReadonlySet<string> = new Set()): ExpansionResult {
  const parsed = expansionRecordSchema.safeParse(raw);
  if (!parsed.success) return { available: false, blockers: ["The expansion record is incomplete or invalid."] };
  const r = parsed.data;
  const c = EXPANSION_CANDIDATES.find((x) => x.id === r.candidateId);
  if (!c) return { available: false, blockers: ["Unknown candidate: new geographies belong to SKAI-1006 and new packs need a registry entry."] };
  const b: string[] = [];
  const s = r.source;
  for (const k of ["board", "qualification", "subject"] as const) if (norm(s[k]) !== norm(c[k])) b.push(`Source ${k} "${s[k]}" does not match candidate ${c[k]}.`);
  if (!c.grade.startsWith("school-") && norm(s.grade) !== norm(c.grade)) b.push(`Source grade ${s.grade} does not match candidate grade ${c.grade}.`);
  if (s.inheritsFrom) b.push(`Support cannot be inherited from ${s.inheritsFrom}; verify this pack independently.`);
  if (s.verification !== "VERIFIED") b.push("Source edition is unverified.");
  if (s.rightsStatus !== "SCHOOL_APPROVED" && s.rightsStatus !== "LICENSED") b.push(`Source rights are ${s.rightsStatus}.`);
  if (!r.schoolSelection) b.push("The school academic owner has not selected this pack.");
  if (c.requiresMathPack && !verifiedMathPacks.has(c.requiresMathPack)) b.push(`Mathematics pack ${c.requiresMathPack} must be verified with a go decision first.`);
  if (c.kind === "SCIENCE") {
    const done = new Set(r.calibration.map((x) => x.area));
    for (const area of SCIENCE_CALIBRATION) if (!done.has(area)) b.push(`Educator calibration missing: ${area}.`);
    if (!r.disabledQuestionTypes) b.push("Record which practical/diagram/question types stay disabled.");
  }
  if (r.reuseOf) {
    if (c.market !== "KSA") b.push("Pack reuse is only defined for KSA foreign-curriculum schools.");
    if (!/CAIE|CAMBRIDGE/i.test(r.reuseOf.approvedPackId)) b.push("Only an exact approved Cambridge pack may be reused; US/IB equivalence is never inferred.");
    if (!(r.reuseOf.qualificationMatches && r.reuseOf.tierMatches && r.reuseOf.examYearMatches)) b.push("Reuse requires exact qualification, tier and exam-year match.");
  }
  if (!r.educatorSignoff) b.push("Subject/native educator sign-off is missing.");
  const d = r.decision;
  if (!d) b.push("No adopt/defer/reject decision is recorded.");
  else {
    if (d.outcome !== "ADOPT") b.push(`Decision is ${d.outcome}.`);
    if (!d.boundedTicket) b.push("An adopted pack needs its own bounded implementation ticket.");
  }
  if (!r.pilotReadinessPassed) b.push("SKAI-1018 pilot readiness has not passed for this pack.");
  return b.length ? { available: false, blockers: b } : { available: true };
}

/** Capability/sales label: every candidate is unavailable unless its own record passes the gate. */
export function expansionAvailability(records: readonly unknown[], verifiedMathPacks: ReadonlySet<string> = new Set()) {
  const byId = new Map<string, unknown>();
  for (const rec of records) { const id = (rec as { candidateId?: unknown })?.candidateId; if (typeof id === "string") byId.set(id, rec); }
  return EXPANSION_CANDIDATES.map((c) => ({ id: c.id, available: byId.has(c.id) && evaluateExpansion(byId.get(c.id), verifiedMathPacks).available }));
}
