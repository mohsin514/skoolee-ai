import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { runUnscoped, runWithTenantContext } from "@/lib/db/tenant-context";
import { evaluateAllMarkets, evaluateMarketTrust, TRUST_MARKETS, TRUST_REQUIREMENTS, type TrustEvidence, type TrustMarket } from "@/lib/school-ai/market-trust-readiness";
import { classifyStage, MARKET_CURRENCY, validateProposal, type PilotProposal } from "@/lib/school-ai/pilot-offer";
import { evaluatePilotReadiness, MARKETS, readinessRecordSchema, type Market } from "@/lib/school-ai/pilot-readiness";

/**
 * SKAI-1016/1017/1018 persistence. Platform-owner routes call these; every school-specific row is
 * written and read inside that school's tenant context, so a record can never leak to another school.
 */
export class PilotGateError extends Error {
  constructor(message: string, public status = 400, public problems: string[] = []) { super(message); }
}

const ref = z.string().trim().min(4).max(300);
const person = z.string().trim().min(2).max(120).refine((v) => !/@/.test(v) && !/\d{7,}/.test(v.replace(/[\s-]/g, "")), "Use a role or pseudonym, not an email or phone number.");
const parse = <T extends z.ZodType>(schema: T, input: unknown): z.infer<T> => {
  const r = schema.safeParse(input);
  if (!r.success) throw new PilotGateError(r.error.issues[0]?.message ?? "Invalid input", 400, r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  return r.data;
};
const inSchool = <T>(schoolId: string, fn: () => Promise<T>) => runWithTenantContext({ schoolId }, fn);

/** Readiness uses DUBAI; trust and offer use UAE_DUBAI. */
export const trustMarketFor = (m: Market): TrustMarket => (m === "DUBAI" ? "UAE_DUBAI" : m);

// ── SKAI-1016 market trust reviews ──────────────────────────────────────────
const TrustReviewInput = z.object({
  market: z.enum(TRUST_MARKETS), requirement: z.enum(TRUST_REQUIREMENTS), reference: ref, reviewer: person,
  reviewedAt: z.coerce.date(), reviewDueAt: z.coerce.date().optional(), locales: z.array(z.enum(["en", "ur", "ar"])).max(3).default([]),
}).strict();

export async function recordTrustReview(input: unknown, actorId: string) {
  const data = parse(TrustReviewInput, input);
  if (data.reviewedAt > new Date()) throw new PilotGateError("The review date cannot be in the future.");
  if (data.reviewDueAt && data.reviewDueAt <= data.reviewedAt) throw new PilotGateError("The expiry must follow the review date.");
  return prisma.$transaction(async (tx) => {
    await tx.marketTrustReview.updateMany({ where: { market: data.market, requirement: data.requirement, supersededAt: null }, data: { supersededAt: new Date() } });
    return tx.marketTrustReview.create({ data: { ...data, reviewDueAt: data.reviewDueAt ?? null, recordedById: actorId } });
  });
}

async function activeTrustEvidence(): Promise<Record<TrustMarket, TrustEvidence[]>> {
  const rows = await prisma.marketTrustReview.findMany({ where: { supersededAt: null }, orderBy: { createdAt: "desc" } });
  const out = { PAKISTAN: [], KSA: [], UAE_DUBAI: [] } as Record<TrustMarket, TrustEvidence[]>;
  for (const r of rows) if (r.market in out) out[r.market as TrustMarket].push({ requirement: r.requirement as TrustEvidence["requirement"], reference: r.reference, reviewedAt: r.reviewedAt, reviewDueAt: r.reviewDueAt ?? undefined, locales: r.locales });
  return out;
}

export async function marketTrustBoard(now = new Date()) {
  const rows = await prisma.marketTrustReview.findMany({ where: { supersededAt: null }, orderBy: [{ market: "asc" }, { requirement: "asc" }] });
  return { markets: evaluateAllMarkets(await activeTrustEvidence(), now), reviews: rows };
}

// ── SKAI-1017 proposals and commercial stage ────────────────────────────────
const ProposalInput = z.object({
  market: z.enum(["PAKISTAN", "KSA", "UAE_DUBAI"]), city: z.string().trim().min(2).max(80), pack: z.string().trim().min(2).max(120),
  academicYear: z.string().trim().min(4).max(20), campuses: z.number().int(), users: z.number().int().min(1).max(10000),
  startsOn: z.iso.date(), endsOn: z.iso.date(), amount: z.number().nullable(), currency: z.enum(["PKR", "SAR", "AED"]),
  budgetApprover: person.optional(), academicChampion: person.optional(), dataProcessingApprover: person.optional(),
  baselineCriteria: z.string().trim().max(1000).optional(), exitExport: z.string().trim().max(1000).optional(),
  claims: z.array(z.string().trim().min(1).max(500)).max(30).default([]),
}).strict();

/** Saves a new version even when invalid, so the builder keeps drafts; `problems` lists validateProposal output. */
export async function saveProposal(schoolId: string, input: unknown, actorId: string) {
  const data = parse(ProposalInput, input);
  return inSchool(schoolId, async () => {
    const latest = await prisma.pilotProposal.findFirst({ where: { schoolId }, orderBy: { version: "desc" }, select: { version: true } });
    const proposal: PilotProposal = { ...data, version: (latest?.version ?? 0) + 1 };
    const problems = validateProposal(proposal);
    const row = await prisma.pilotProposal.create({ data: {
      schoolId, version: proposal.version, market: data.market, currency: data.currency, amount: data.amount === null ? null : new Prisma.Decimal(data.amount),
      scope: proposal as unknown as Prisma.InputJsonValue, budgetApprover: data.budgetApprover ?? null, academicChampion: data.academicChampion ?? null,
      dataProcessingApprover: data.dataProcessingApprover ?? null, problems, recordedById: actorId,
    } });
    return { ...row, amount: row.amount === null ? null : Number(row.amount), problems, expectedCurrency: MARKET_CURRENCY[data.market] };
  });
}

const StageInput = z.object({ demoAttended: z.boolean().default(false), declinedToPay: z.boolean().default(false), signedAgreementRef: ref.optional(), settlementRef: ref.optional() }).strict();

export async function recordCommercialEvent(schoolId: string, input: unknown, actorId: string) {
  const data = parse(StageInput, input);
  if (data.settlementRef && !data.signedAgreementRef) throw new PilotGateError("A settlement needs the signed agreement reference first.");
  return inSchool(schoolId, () => prisma.pilotCommercialEvent.create({ data: { schoolId, stage: classifyStage(data), demoAttended: data.demoAttended, declinedToPay: data.declinedToPay, signedAgreementRef: data.signedAgreementRef ?? null, settlementRef: data.settlementRef ?? null, recordedById: actorId } }));
}

// ── SKAI-1018 readiness records ─────────────────────────────────────────────
/** Markets whose own GO is recorded on the latest record of at least one school (for MARKET_SEQUENCE). */
async function approvedMarkets(): Promise<Set<Market>> {
  const rows = await runUnscoped("pilot readiness: markets with a recorded go decision across schools", () =>
    prisma.pilotReadinessRecord.findMany({ where: { ready: true, outcome: "GO" }, select: { market: true }, distinct: ["market"] }));
  return new Set(rows.map((r) => r.market).filter((m): m is Market => (MARKETS as readonly string[]).includes(m ?? "")));
}

export async function saveReadinessRecord(schoolId: string, input: unknown, actorId: string, pilotId?: string | null) {
  const record = parse(readinessRecordSchema, input);
  const result = evaluatePilotReadiness(record, await approvedMarkets());
  return inSchool(schoolId, async () => {
    const latest = await prisma.pilotReadinessRecord.findFirst({ where: { schoolId }, orderBy: { version: "desc" }, select: { version: true } });
    return prisma.pilotReadinessRecord.create({ data: {
      schoolId, pilotId: pilotId ?? null, version: (latest?.version ?? 0) + 1, market: result.market, record: record as Prisma.InputJsonValue,
      outcome: record.decision?.outcome ?? null, signer: record.decision?.founderApprover ?? null, ready: result.ready,
      blockers: result.ready ? [] : result.blockers, recordedById: actorId,
    } });
  });
}

export async function schoolPilotRecords(schoolId: string) {
  return inSchool(schoolId, async () => {
    const [proposals, events, readiness] = await Promise.all([
      prisma.pilotProposal.findMany({ where: { schoolId }, orderBy: { version: "desc" }, take: 20 }),
      prisma.pilotCommercialEvent.findMany({ where: { schoolId }, orderBy: { createdAt: "desc" }, take: 50 }),
      prisma.pilotReadinessRecord.findMany({ where: { schoolId }, orderBy: { version: "desc" }, take: 20 }),
    ]);
    return { proposals: proposals.map((p) => ({ ...p, amount: p.amount === null ? null : Number(p.amount) })), events, readiness };
  });
}

export type ActivationGate = { allowed: true; market: Market } | { allowed: false; blockers: { item: string; reason: string }[] };

/**
 * SKAI-1018 enforcement: fail-closed. Re-evaluates the latest readiness record now (dates expire)
 * and requires the SKAI-1016 trust gate for that market. Used by the pilot console before ACTIVE.
 */
export async function pilotActivationGate(schoolId: string | null, now = new Date()): Promise<ActivationGate> {
  if (!schoolId) return { allowed: false, blockers: [{ item: "SCHOOL", reason: "Link the pilot to a school before it can become active." }] };
  const latest = await inSchool(schoolId, () => prisma.pilotReadinessRecord.findFirst({ where: { schoolId }, orderBy: { version: "desc" } }));
  if (!latest) return { allowed: false, blockers: [{ item: "READINESS", reason: "No pilot readiness record exists for this school." }] };
  const result = evaluatePilotReadiness(latest.record, await approvedMarkets(), now);
  const blockers = result.ready ? [] : [...result.blockers];
  const market = result.market;
  if (market) {
    const trust = evaluateMarketTrust(trustMarketFor(market), (await activeTrustEvidence())[trustMarketFor(market)], now);
    if (!trust.ready) for (const reason of trust.reasons) blockers.push({ item: "MARKET_TRUST", reason });
  }
  return blockers.length || !market ? { allowed: false, blockers } : { allowed: true, market };
}
