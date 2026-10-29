import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/scope";
import { EXPANSION_CANDIDATES, evaluateExpansion, expansionAvailability, expansionRecordSchema, type ExpansionCandidate } from "./pack-expansion-gate";

/**
 * SKAI-1019/1020 persistence for the deferred-pack gate. Decisions are append-only (history is never overwritten);
 * the newest row per candidate is current. Every write carries founder + educator sign-off references and a
 * platform audit row in the same transaction. Availability is always recomputed from the stored record by
 * `evaluateExpansion`, so an ADOPT decision alone never activates a pack.
 */

type Db = Pick<typeof prisma, "packExpansionDecision" | "superAdminAuditLog" | "$transaction">;

export type ExpansionStatus = ExpansionCandidate & {
  outcome: "PENDING" | "ADOPT" | "DEFER" | "REJECT";
  decidedAt: string | null;
  boundedTicket: string | null;
  rationale: string | null;
  available: boolean;
  blockers: string[];
};

const NO_RECORD = ["No adopt/defer/reject decision or gate evidence is recorded."];

async function latestRecords(db: Pick<Db, "packExpansionDecision">) {
  const rows = await db.packExpansionDecision.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
  const latest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) if (!latest.has(row.candidateId)) latest.set(row.candidateId, row);
  return latest;
}

/** Founder-console listing: every candidate, its current decision and exactly which prerequisites block it. */
export async function listExpansionStatus(verifiedMathPacks: ReadonlySet<string> = new Set(), db: Db = prisma): Promise<ExpansionStatus[]> {
  const latest = await latestRecords(db);
  return EXPANSION_CANDIDATES.map((c) => {
    const row = latest.get(c.id);
    if (!row) return { ...c, outcome: "PENDING", decidedAt: null, boundedTicket: null, rationale: null, available: false, blockers: NO_RECORD };
    const result = evaluateExpansion(row.record, verifiedMathPacks);
    const rationale = (row.record as { decision?: { rationale?: string } })?.decision?.rationale ?? null;
    return { ...c, outcome: row.outcome as ExpansionStatus["outcome"], decidedAt: row.createdAt.toISOString(), boundedTicket: row.boundedTicket, rationale, available: result.available, blockers: result.available ? [] : result.blockers };
  });
}

/**
 * Public hook for the curriculum pack registry: the ids of deferred expansion packs that pass the gate.
 * Anything not returned here must be listed as unavailable. Fails closed (empty set) if the store cannot be read.
 */
export async function availableExpansionPackIds(verifiedMathPacks: ReadonlySet<string> = new Set(), db: Pick<Db, "packExpansionDecision"> = prisma): Promise<ReadonlySet<string>> {
  try {
    const latest = await latestRecords(db);
    return new Set(expansionAvailability([...latest.values()].map((r) => r.record), verifiedMathPacks).filter((a) => a.available).map((a) => a.id));
  } catch {
    return new Set();
  }
}

/** True only for registry ids that are deferred expansion candidates (science, later grades, other boards). */
export function isExpansionCandidate(packId: string): boolean {
  return EXPANSION_CANDIDATES.some((c) => c.id === packId);
}

/** Records one ADOPT/DEFER/REJECT decision with its full gate evidence. */
export async function recordExpansionDecision(actor: { userId: string; role: string }, raw: unknown, opts: { ipAddress?: string; userAgent?: string } = {}, db: Db = prisma) {
  if (actor.role !== "APP_OWNER") throw new ApiError("Forbidden", 403);
  const parsed = expansionRecordSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError(`Invalid expansion record: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`, 400);
  const record = parsed.data;
  if (!EXPANSION_CANDIDATES.some((c) => c.id === record.candidateId)) throw new ApiError("Unknown candidate: new geographies belong to SKAI-1006.", 400);
  const d = record.decision;
  if (!d || d.outcome === "PENDING") throw new ApiError("Record an ADOPT, DEFER or REJECT decision with founder and educator sign-off.", 400);
  if (d.outcome === "ADOPT" && !d.boundedTicket) throw new ApiError("An adopted pack needs its own bounded implementation ticket.", 400);
  return db.$transaction(async (tx) => {
    const row = await tx.packExpansionDecision.create({ data: { candidateId: record.candidateId, outcome: d.outcome, record: record as Prisma.InputJsonValue, boundedTicket: d.boundedTicket ?? null, decidedById: actor.userId } });
    await tx.superAdminAuditLog.create({ data: { userId: actor.userId, action: "pack_expansion_decision_recorded", targetType: "pack_expansion_candidate", targetId: record.candidateId, targetName: record.candidateId, newValues: { decisionId: row.id, outcome: d.outcome, boundedTicket: d.boundedTicket ?? null, founder: d.founder.reference, educator: d.educator.reference, calibrationAreas: record.calibration.map((c) => c.area) }, ipAddress: opts.ipAddress, userAgent: opts.userAgent } });
    return row;
  });
}
