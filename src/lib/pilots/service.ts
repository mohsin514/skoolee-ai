import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { runUnscoped } from "@/lib/db/tenant-context";
import { scanBannedTerms } from "@/lib/school-ai/commercial-evidence";
import {
  MEASURE_KINDS, MEASURE_STATES, OBSERVATION_SOURCES, PERMISSIONS, PHASES,
  claimSupport, findingFor, findingHash, limitations, measureFinding, timeFinding,
  type Finding, type MeasureRow, type ObservationRow,
} from "./findings";

/**
 * SKO-430 pilot measurement. Platform-operator records (owner-only routes): a pilot charter,
 * pseudonymous task observations, measures with an explicit evidence state, and external claims
 * that are approved against a frozen finding and blocked from export once that finding changes.
 */

export class PilotError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

const date = z.iso.date();
const text = (min: number, max: number) => z.string().trim().min(min).max(max).refine((v) => scanBannedTerms(v).length === 0, "Recorded text may not use an excluded term.");
const workflowKey = z.string().trim().regex(/^[A-Z][A-Z0-9_]{1,40}$/u, "A workflow key looks like MARKS_ENTRY.");
/** Pseudonyms only: anything shaped like an email address or phone number is refused. */
const pseudonym = z.string().trim().min(1).max(40).refine((v) => !/@/.test(v) && !/\d{7,}/.test(v.replace(/[\s-]/g, "")), "Use a pseudonym such as T-03, not an email or phone number.");
const seconds = z.number().int().min(0).max(86_400).nullable();

const PilotInput = z.object({
  name: text(3, 120),
  targetSchoolId: z.string().trim().min(1).max(100).nullable().optional(),
  country: z.string().trim().regex(/^[A-Z]{2}$/u, "Use a two-letter country code."),
  curriculum: text(2, 80),
  language: z.enum(["en", "ar", "ur", "other"]),
  useCase: text(3, 160),
  startsOn: date,
  endsOn: date.nullable().optional(),
  championName: text(2, 120),
  measurementOwnerId: z.string().trim().min(1).max(100),
  workflows: z.array(z.object({ key: workflowKey, definition: text(10, 400), successDefinition: text(10, 400) })).min(1).max(12),
  synthetic: z.boolean().default(false),
}).refine((v) => !v.endsOn || v.endsOn >= v.startsOn, { message: "The pilot cannot end before it starts.", path: ["endsOn"] })
  .refine((v) => new Set(v.workflows.map((w) => w.key)).size === v.workflows.length, { message: "Workflow keys must be unique.", path: ["workflows"] });

const CommercialEvidence = z.object({
  charterReference: text(4, 200), schoolApproval: text(4, 200), vendorApproval: text(4, 200),
  scopeAndResponsibilities: text(10, 1000), baselineMethod: text(10, 500),
  price: z.number().finite().nonnegative(), currency: z.string().regex(/^[A-Z]{3}$/),
  paymentStatus: z.enum(["PENDING", "FAILED", "PAID"]), invoiceReference: text(4, 200),
  paymentReference: text(4, 200).nullable(), refundTerms: text(10, 500),
  authorityReference: text(4, 200).nullable(), privacyReference: text(4, 200).nullable(),
  deploymentReference: text(4, 200).nullable(), providerReference: text(4, 200).nullable(),
  cycles: z.array(z.object({ id: text(2, 80), workflow: workflowKey, completed: z.boolean(), reference: text(4, 200), date })).max(100),
  closure: z.object({ outcome: z.enum(["PAID", "RENEWED", "DECLINED", "STOPPED"]), reason: text(4, 500), reference: text(4, 200), date, exitReference: text(4, 200) }).nullable(),
}).refine(v => new Set(v.cycles.map(c => c.id)).size === v.cycles.length && new Set(v.cycles.map(c => `${c.workflow}:${c.date}:${c.reference}`)).size === v.cycles.length, "Cycle evidence must be distinct.")
  .refine(v => [...v.cycles.map(c => c.date), ...(v.closure ? [v.closure.date] : [])].every(d => d <= new Date().toISOString().slice(0, 10)), "Evidence dates cannot be in the future.");
export type PilotCommercialEvidence = z.infer<typeof CommercialEvidence>;
const CharterInput = z.object({
  version: z.number().int().nonnegative().default(0),
  commercial: CommercialEvidence.optional(),
  workflows: PilotInput.shape.workflows.optional(),

  consentReference: text(4, 200).nullable().optional(),
  caseStudyPermission: z.enum(PERMISSIONS).optional(),
  permissionReference: text(4, 200).nullable().optional(),
  status: z.enum(["PLANNED", "ACTIVE", "CLOSED"]).optional(),
  endsOn: date.nullable().optional(),
});

const ObservationInput = z.object({
  workflow: workflowKey, phase: z.enum(PHASES), participant: pseudonym,
  task: text(2, 120), difficulty: text(1, 40),
  activeSeconds: seconds, elapsedSeconds: seconds, correctionSeconds: seconds,
  completed: z.boolean(), assisted: z.boolean().default(false),
  failureNote: text(3, 400).nullable().optional(),
  source: z.enum(OBSERVATION_SOURCES), synthetic: z.boolean().default(false), observedOn: date,
});

const MeasureInput = z.object({
  kind: z.enum(MEASURE_KINDS), workflow: workflowKey.nullable().optional(),
  periodStart: date, periodEnd: date,
  value: z.number().finite().min(0).nullable(), denominator: z.number().finite().positive().nullable().optional(),
  unit: text(1, 40), state: z.enum(MEASURE_STATES), method: text(5, 400), reference: text(3, 300).nullable().optional(),
  synthetic: z.boolean().default(false),
  /** Serving cost must state that failed, retried and abandoned calls are included. */
  includesFailedCalls: z.boolean().optional(),
  supersedesId: z.string().trim().min(1).max(100).nullable().optional(),
});

const ClaimInput = z.object({ statement: text(20, 600), findingKey: z.string().trim().min(3).max(120), identifiable: z.boolean().default(false) });
const ReviewInput = z.object({ decision: z.enum(["APPROVE", "RETURN", "WITHDRAW"]), note: text(8, 1000), version: z.number().int().positive() });

function parse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) throw new PilotError(result.error.issues[0]?.message ?? "Invalid request", 400);
  return result.data;
}
const asDate = (value: string) => new Date(`${value}T00:00:00Z`);

async function requirePilot(id: string) {
  const pilot = await prisma.pilot.findUnique({ where: { id } });
  if (!pilot) throw new PilotError("Pilot not found", 404);
  return pilot;
}
function workflowKeys(pilot: { workflows: Prisma.JsonValue }): string[] {
  return Array.isArray(pilot.workflows) ? (pilot.workflows as { key: string }[]).map((w) => w.key) : [];
}

export async function createPilot(input: unknown, actorId: string) {
  const data = parse(PilotInput, input);
  const owner = await runUnscoped("pilot: verify measurement owner is a platform operator", () => prisma.user.findFirst({ where: { id: data.measurementOwnerId, role: "APP_OWNER", isActive: true }, select: { id: true } }));
  if (!owner) throw new PilotError("The measurement owner must be an active platform operator.");
  if (data.targetSchoolId && !(await prisma.school.findUnique({ where: { id: data.targetSchoolId }, select: { id: true } }))) throw new PilotError("The linked school does not exist.");
  return prisma.pilot.create({ data: {
    name: data.name, targetSchoolId: data.targetSchoolId ?? null, country: data.country, curriculum: data.curriculum, language: data.language, useCase: data.useCase,
    startsOn: asDate(data.startsOn), endsOn: data.endsOn ? asDate(data.endsOn) : null, championName: data.championName, measurementOwnerId: data.measurementOwnerId,
    workflows: data.workflows, synthetic: data.synthetic, createdById: actorId,
  } });
}

export async function updateCharter(id: string, input: unknown, actorId?: string) {
  const pilot = await requirePilot(id);
  const data = parse(CharterInput, input);
  let status = data.status ?? pilot.status;
  const history = Array.isArray(pilot.charterHistory) ? pilot.charterHistory : [];
  if (data.version !== history.length) throw new PilotError("This pilot changed. Reload and try again.", 409);
  if (data.workflows && !data.commercial) throw new PilotError("Scope changes need both parties’ approval references.", 409);
  const previous = history.at(-1) as { commercial?: unknown } | undefined;
  const commercial = data.commercial ?? (previous?.commercial ? parse(CommercialEvidence, previous.commercial) : null);
  const consent = data.consentReference === undefined ? pilot.consentReference : data.consentReference;
  const permission = data.caseStudyPermission ?? pilot.caseStudyPermission;
  const permissionReference = data.permissionReference === undefined ? pilot.permissionReference : data.permissionReference;
  if (status === "ACTIVE" && pilot.synthetic) throw new PilotError("A synthetic pilot cannot become active.", 409);
  if (status === "ACTIVE" && !consent) throw new PilotError("Record the school's consent before the pilot becomes active.", 409);
  if (permission !== "NONE" && !permissionReference) throw new PilotError("Case-study permission needs a reference to the school's written permission.", 409);
  if (data.endsOn && asDate(data.endsOn) < pilot.startsOn) throw new PilotError("The pilot cannot end before it starts.");
  const prior = previous?.commercial ? parse(CommercialEvidence, previous.commercial) : null;
  const scopeChanged = (data.workflows && JSON.stringify(data.workflows) !== JSON.stringify(pilot.workflows)) || (prior && commercial?.scopeAndResponsibilities !== prior.scopeAndResponsibilities);
  if (scopeChanged && prior && (commercial?.schoolApproval === prior.schoolApproval || commercial?.vendorApproval === prior.vendorApproval)) throw new PilotError("Scope changes need fresh approval references from both parties.", 409);
  if (status === "ACTIVE") {
    if (!commercial) status = "WAITING_CHARTER";
    else if (commercial.paymentStatus !== "PAID" || !commercial.paymentReference) status = "WAITING_PAYMENT";
    else if (!commercial.providerReference) status = "WAITING_PROVIDER";
    else if (!commercial.authorityReference || !commercial.privacyReference || !commercial.deploymentReference) status = "WAITING_READINESS";
  }
  if (status === "CLOSED" && !pilot.synthetic && !commercial?.closure) throw new PilotError("Record the closure outcome, source, date and exit evidence.", 409);
  const workflows = data.workflows ?? pilot.workflows;
  if (data.workflows && JSON.stringify(data.workflows.map(w => w.key).sort()) !== JSON.stringify(workflowKeys(pilot).sort())) throw new PilotError("Preserve the agreed workflow keys when revising definitions.", 409);
  if (commercial?.cycles.some(c => !workflowKeys({ workflows }).includes(c.workflow))) throw new PilotError("That workflow is not defined in this pilot's charter.");
  const snapshot = { recordedById: actorId ?? null, original: history.length ? null : { workflows: pilot.workflows, consentReference: pilot.consentReference, startsOn: pilot.startsOn.toISOString(), endsOn: pilot.endsOn?.toISOString() ?? null }, at: new Date().toISOString(), commercial, workflows, championName: pilot.championName, startsOn: pilot.startsOn.toISOString(), endsOn: data.endsOn === undefined ? pilot.endsOn?.toISOString() ?? null : data.endsOn, consentReference: consent, caseStudyPermission: permission, permissionReference, status };
  const updated = await prisma.pilot.updateMany({ where: { id, updatedAt: pilot.updatedAt, charterHistory: { equals: history as Prisma.InputJsonValue } }, data: {
    ...(data.consentReference !== undefined ? { consentReference: data.consentReference, consentRecordedAt: data.consentReference ? new Date() : null } : {}),
    ...(data.caseStudyPermission ? { caseStudyPermission: data.caseStudyPermission } : {}),
    ...(data.permissionReference !== undefined ? { permissionReference: data.permissionReference } : {}),
    status, ...(data.workflows ? { workflows: data.workflows } : {}), charterHistory: [...history, snapshot] as Prisma.InputJsonValue,
    ...(data.endsOn !== undefined ? { endsOn: data.endsOn ? asDate(data.endsOn) : null } : {}),
  } });
  if (!updated.count) throw new PilotError("This pilot changed. Reload and try again.", 409);
  return requirePilot(id);
}

export async function recordObservation(id: string, input: unknown, actorId: string) {
  const pilot = await requirePilot(id);
  const data = parse(ObservationInput, input);
  if (!workflowKeys(pilot).includes(data.workflow)) throw new PilotError("That workflow is not defined in this pilot's charter.");
  if (!data.completed && !data.failureNote) throw new PilotError("Say what happened when a task was not completed.");
  if (pilot.synthetic && !data.synthetic) throw new PilotError("A synthetic pilot can only hold synthetic observations.");
  return prisma.pilotObservation.create({ data: { ...data, failureNote: data.failureNote ?? null, observedOn: asDate(data.observedOn), pilotId: id, recordedById: actorId } });
}

export async function excludeObservation(id: string, observationId: string, reason: unknown) {
  const why = parse(text(8, 300), reason);
  const updated = await prisma.pilotObservation.updateMany({ where: { id: observationId, pilotId: id, excludedReason: null }, data: { excludedReason: why } });
  if (!updated.count) throw new PilotError("Observation not found or already excluded", 404);
  return { excluded: observationId };
}

export async function recordMeasure(id: string, input: unknown, actorId: string) {
  const pilot = await requirePilot(id);
  const data = parse(MeasureInput, input);
  if (data.periodEnd < data.periodStart) throw new PilotError("The period cannot end before it starts.");
  if (data.state === "UNKNOWN" ? data.value != null : data.value == null) throw new PilotError("Record UNKNOWN, with no value, when the figure is not known; never record it as zero.");
  if (data.kind.startsWith("CORRECTNESS")) {
    if (!data.workflow || !workflowKeys(pilot).includes(data.workflow)) throw new PilotError("A correctness sample belongs to one of the pilot's workflows.");
    if (data.denominator == null || (data.value != null && data.value > data.denominator)) throw new PilotError("A correctness sample needs its sample size, and correct items cannot exceed it.");
    if (!data.reference) throw new PilotError("Name the human-reviewed reference the sample was checked against.");
  }
  if (data.kind === "SERVING_COST" && data.state === "MEASURED" && data.includesFailedCalls !== true) throw new PilotError("Serving cost must include failed, retried and abandoned provider calls.");
  if (pilot.synthetic && !data.synthetic) throw new PilotError("A synthetic pilot can only hold synthetic measures.");
  return prisma.$transaction(async (tx) => {
    if (data.supersedesId) {
      const replaced = await tx.pilotMeasure.updateMany({ where: { id: data.supersedesId, pilotId: id, kind: data.kind, supersededAt: null }, data: { supersededAt: new Date() } });
      if (!replaced.count) throw new PilotError("The value being corrected was not found or was already corrected.", 409);
    }
    const method = data.kind === "SERVING_COST" && data.includesFailedCalls ? `${data.method} (includes failed, retried and abandoned calls)` : data.method;
    return tx.pilotMeasure.create({ data: {
      pilotId: id, kind: data.kind, workflow: data.workflow ?? null, periodStart: asDate(data.periodStart), periodEnd: asDate(data.periodEnd),
      value: data.value, denominator: data.denominator ?? null, unit: data.unit, state: data.state, method, reference: data.reference ?? null,
      synthetic: data.synthetic, recordedById: actorId,
    } });
  });
}

type ClaimRow = Awaited<ReturnType<typeof prisma.pilotClaim.findMany>>[number];
type PilotRow = NonNullable<Awaited<ReturnType<typeof prisma.pilot.findUnique>>>;

/** Whether this approved claim may leave the platform now, and why not. */
function cycleBlock(pilot: PilotRow, findingKey: string): string | null {
  if (!findingKey.includes(":")) return null;
  const workflow = findingKey.slice(findingKey.indexOf(":") + 1);
  const history = Array.isArray(pilot.charterHistory) ? pilot.charterHistory : [];
  const last = history.at(-1) as { commercial?: unknown } | undefined;
  const result = CommercialEvidence.safeParse(last?.commercial);
  if (!result.success || !workflowKeys(pilot).includes(workflow) || result.data.cycles.filter(c => c.workflow === workflow && c.completed).length < 2) return "Record two complete cycles for this workflow before approving a claim.";
  return null;
}
function exportBlock(pilot: PilotRow, claim: ClaimRow, finding: Finding | null): string | null {
  const cycles = cycleBlock(pilot, claim.findingKey);
  if (cycles) return cycles;

  if (pilot.synthetic) return "Synthetic pilot: never exported as a result.";
  if (claim.status !== "APPROVED") return `Claim is ${claim.status.toLowerCase()}.`;
  if (claim.snapshotHash !== findingHash(finding)) return "The evidence changed after approval; review the claim again.";
  if (pilot.caseStudyPermission === "NONE" || !pilot.permissionReference) return "The school has not given case-study permission.";
  if (claim.identifiable && pilot.caseStudyPermission !== "NAMED") return "The claim identifies the school, but permission covers anonymised figures only.";
  const revisions = Array.isArray(pilot.charterHistory) ? pilot.charterHistory : [];
  const latest = revisions.at(-1) as { at?: string } | undefined;
  if (latest?.at && (!claim.reviewedAt || new Date(latest.at) > claim.reviewedAt)) return "The charter changed after approval; review the claim again.";
  return null;
}

export async function pilotDetail(id: string) {
  const pilot = await requirePilot(id);
  const [observations, measures, claims] = await Promise.all([
    prisma.pilotObservation.findMany({ where: { pilotId: id }, orderBy: [{ observedOn: "desc" }, { createdAt: "desc" }], take: 500 }),
    prisma.pilotMeasure.findMany({ where: { pilotId: id }, orderBy: [{ periodStart: "desc" }, { createdAt: "desc" }], take: 500 }),
    prisma.pilotClaim.findMany({ where: { pilotId: id }, orderBy: { createdAt: "desc" } }),
  ]);
  const workflows = workflowKeys(pilot);
  const findings = {
    time: workflows.map((w) => timeFinding(w, observations as ObservationRow[])),
    correctness: workflows.map((w) => ({ workflow: w, extraction: measureFinding("CORRECTNESS_EXTRACTION", w, measures as MeasureRow[]), final: measureFinding("CORRECTNESS_FINAL", w, measures as MeasureRow[]) })),
    other: MEASURE_KINDS.filter((k) => !k.startsWith("CORRECTNESS")).map((k) => measureFinding(k, null, measures as MeasureRow[])),
  };
  const claimViews = claims.map((claim) => {
    const finding = findingFor(claim.findingKey, observations as ObservationRow[], measures as MeasureRow[]);
    const stale = claim.status === "APPROVED" && claim.snapshotHash !== findingHash(finding);
    return { ...claim, stale, support: claimSupport(finding), exportBlockedBy: claim.status === "APPROVED" ? exportBlock(pilot, claim, finding) : null };
  });
  return { pilot, observations, measures, findings, claims: claimViews };
}

export async function listPilots() {
  const pilots = await prisma.pilot.findMany({ orderBy: [{ synthetic: "asc" }, { createdAt: "desc" }], include: { _count: { select: { observations: true, measures: true, claims: true } } } });
  // Cohorts stay separate (country · curriculum · language · use case); no cross-cohort average is computed.
  return pilots.map((p) => ({ ...p, cohort: `${p.country} · ${p.curriculum} · ${p.language} · ${p.useCase}` }));
}

export async function proposeClaim(id: string, input: unknown, actorId: string) {
  await requirePilot(id);
  const data = parse(ClaimInput, input);
  return prisma.pilotClaim.create({ data: { pilotId: id, statement: data.statement, findingKey: data.findingKey, identifiable: data.identifiable, createdById: actorId,
    history: [{ at: new Date().toISOString(), by: actorId, action: "PROPOSED", statement: data.statement }] } });
}

export async function reviewClaim(id: string, claimId: string, input: unknown, reviewerId: string) {
  const pilot = await requirePilot(id);
  const data = parse(ReviewInput, input);
  const claim = await prisma.pilotClaim.findFirst({ where: { id: claimId, pilotId: id } });
  if (!claim) throw new PilotError("Claim not found", 404);
  if (claim.version !== data.version) throw new PilotError("This claim changed since you opened it. Reload and review again.", 409);
  let update: Prisma.PilotClaimUpdateManyMutationInput;
  const entry = { at: new Date().toISOString(), by: reviewerId, action: data.decision, note: data.note } as Record<string, unknown>;
  if (data.decision === "APPROVE") {
    if (pilot.synthetic) throw new PilotError("A synthetic pilot cannot support an external claim.", 409);
    const cycles = cycleBlock(pilot, claim.findingKey);
    if (cycles) throw new PilotError(cycles, 409);
    const [observations, measures] = await Promise.all([prisma.pilotObservation.findMany({ where: { pilotId: id } }), prisma.pilotMeasure.findMany({ where: { pilotId: id } })]);
    const finding = findingFor(claim.findingKey, observations as ObservationRow[], measures as MeasureRow[]);
    const support = claimSupport(finding);
    if (!support.supported) throw new PilotError(support.reason ?? "The evidence does not support this claim.", 409);
    if (pilot.caseStudyPermission === "NONE") throw new PilotError("Record the school's case-study permission before approving an external claim.", 409);
    if (claim.identifiable && pilot.caseStudyPermission !== "NAMED") throw new PilotError("This claim identifies the school; its permission covers anonymised figures only.", 409);
    const snapshot = { finding, limitations: limitations(finding!), approvedAt: entry.at } as unknown as Prisma.InputJsonValue;
    const hash = findingHash(finding);
    entry.snapshotHash = hash;
    update = { status: "APPROVED", snapshot, snapshotHash: hash };
  } else {
    update = { status: data.decision === "RETURN" ? "RETURNED" : "WITHDRAWN" };
  }
  const history = [...(Array.isArray(claim.history) ? claim.history : []), entry] as Prisma.InputJsonValue;
  const done = await prisma.pilotClaim.updateMany({ where: { id: claimId, version: data.version }, data: { ...update, version: { increment: 1 }, reviewNote: data.note, reviewedById: reviewerId, reviewedAt: new Date(), history } });
  if (!done.count) throw new PilotError("This claim changed since you opened it. Reload and review again.", 409);
  return prisma.pilotClaim.findUnique({ where: { id: claimId } });
}

/**
 * External export: only approved claims whose evidence is unchanged and whose permission still
 * holds. A claim whose finding changed is marked STALE (its approved snapshot stays in history).
 * The school is named only for an identifiable claim with NAMED permission; otherwise the cohort
 * descriptor stands in. Participant-level rows never leave.
 */
export async function exportClaims() {
  const claims = await prisma.pilotClaim.findMany({ where: { status: { in: ["APPROVED", "STALE"] } }, include: { pilot: true }, orderBy: { createdAt: "asc" } });
  const statements: unknown[] = [], excluded: { claimId: string; pilot: string; reason: string }[] = [];
  for (const claim of claims) {
    const { pilot } = claim;
    if (claim.status === "STALE") { excluded.push({ claimId: claim.id, pilot: pilot.name, reason: "The evidence changed after approval; review the claim again." }); continue; }
    const [observations, measures] = await Promise.all([prisma.pilotObservation.findMany({ where: { pilotId: pilot.id } }), prisma.pilotMeasure.findMany({ where: { pilotId: pilot.id } })]);
    const finding = findingFor(claim.findingKey, observations as ObservationRow[], measures as MeasureRow[]);
    const blocked = exportBlock(pilot, claim, finding);
    if (blocked) {
      if (claim.snapshotHash !== findingHash(finding) && !pilot.synthetic) {
        const history = [...(Array.isArray(claim.history) ? claim.history : []), { at: new Date().toISOString(), action: "STALE", note: blocked }] as Prisma.InputJsonValue;
        await prisma.pilotClaim.updateMany({ where: { id: claim.id, version: claim.version }, data: { status: "STALE", version: { increment: 1 }, history } });
      }
      excluded.push({ claimId: claim.id, pilot: pilot.name, reason: blocked });
      continue;
    }
    const school = claim.identifiable && pilot.caseStudyPermission === "NAMED" && pilot.targetSchoolId
      ? (await prisma.school.findUnique({ where: { id: pilot.targetSchoolId }, select: { name: true } }))?.name ?? null : null;
    const snapshot = claim.snapshot as { finding: Finding; limitations: string[] };
    const sample = "counts" in snapshot.finding ? { paired: snapshot.finding.counts.paired, excluded: snapshot.finding.excluded.length }
      : { measuredRecords: snapshot.finding.current.filter((row) => row.state === "MEASURED").length };
    statements.push({ claimId: claim.id, version: claim.version, statement: claim.statement, school, cohort: { country: pilot.country, curriculum: pilot.curriculum, language: pilot.language, useCase: pilot.useCase },
      period: { from: pilot.startsOn.toISOString().slice(0, 10), to: pilot.endsOn?.toISOString().slice(0, 10) ?? null }, findingKey: claim.findingKey, sample,
      limitations: snapshot.limitations, approvedAt: claim.reviewedAt?.toISOString() ?? null });
  }
  return { generatedAt: new Date().toISOString(), statements, excluded };
}
