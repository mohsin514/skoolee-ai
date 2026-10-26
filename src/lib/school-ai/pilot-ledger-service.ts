import { z } from "zod";
import type { AuthUser } from "@/lib/auth";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { ApiError, canLeadAcademics } from "@/lib/api/scope";
import { runWithTenantContext } from "@/lib/db/tenant-context";
import { paperDataSchema } from "./assessment";
import { twinFor } from "./exam-twin-service";

/**
 * SKO-507 Pilot Ledger. Every number is computed by the product from the school's own records, carries
 * the claim id it supports in `docs/leap/claims-register.md`, its sample size and its window, and says
 * when it is an estimate. Nothing is computed or kept for a school that has not opted in.
 */
export const LEDGER_WINDOW_DAYS = 90;
import type { LedgerMetric } from "./pilot-ledger-types";
export type { LedgerMetric };

const median = (values: number[]) => { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b), mid = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2; };
const round = (value: number) => Math.round(value * 10) / 10;

export async function computeLedgerMetrics(db: TxClient, schoolId: string, now = new Date()): Promise<LedgerMetric[]> {
  const since = new Date(now.getTime() - LEDGER_WINDOW_DAYS * 86_400_000);
  const [sealed, corrections, notes, receipts, sittings] = await Promise.all([
    db.examPaperSlot.findMany({ where: { schoolId, sealedAt: { gte: since, lte: now } }, select: { requestedAt: true, sealedAt: true, dueOn: true } }),
    db.schoolAiResultCorrection.findMany({ where: { schoolId, status: { in: ["APPROVED", "REJECTED"] }, decidedAt: { gte: since, lte: now } }, select: { status: true, proposedById: true, decidedById: true } }),
    db.familyResultNote.findMany({ where: { schoolId, status: "SENT", sentAt: { gte: since, lte: now } }, select: { status: true } }),
    db.examBriefReceipt.count({ where: { schoolId, acknowledgedAt: { gte: since, lte: now } } }),
    db.schoolAiExamAssignment.findMany({ where: { schoolId, resultsReleasedAt: { gte: since, lte: now } }, orderBy: [{ resultsReleasedAt: "asc" }, { id: "asc" }], select: { id: true, campusId: true, classId: true, startsAt: true, resultsReleasedAt: true, paperSnapshot: true } }),
  ]);
  const onTime = sealed.filter(slot => slot.sealedAt! < new Date(slot.dueOn.getTime() + 86_400_000));
  const decided = corrections.filter(row => row.decidedById && row.decidedById !== row.proposedById);
  const differences: number[] = [];
  for (const sitting of sittings) {
    const paper = paperDataSchema.safeParse(sitting.paperSnapshot);
    if (!paper.success) continue;
    const twin = await twinFor(db, schoolId, sitting, paper.data);
    for (const row of twin.comparison ?? []) if (row.difference !== null) differences.push(Math.abs(row.difference));
  }
  return [
    { claim: "PL-1", key: "sealedOnTime", value: sealed.length ? round(onTime.length / sealed.length * 100) : null, unit: "PERCENT", sample: sealed.length, estimate: false },
    { claim: "PL-2", key: "daysToSeal", value: (() => { const days = median(sealed.map(slot => (slot.sealedAt!.getTime() - slot.requestedAt.getTime()) / 86_400_000)); return days === null ? null : round(days); })(), unit: "DAYS", sample: sealed.length, estimate: false },
    { claim: "PL-3", key: "correctionsSecondReviewer", value: decided.length, unit: "COUNT", sample: corrections.length, estimate: false },
    { claim: "PL-4", key: "familyNotesSent", value: notes.filter(note => note.status === "SENT").length, unit: "COUNT", sample: notes.length, estimate: false },
    { claim: "PL-5", key: "briefAcknowledged", value: receipts, unit: "COUNT", sample: receipts, estimate: false },
    { claim: "PL-6", key: "twinDifference", value: differences.length ? round(differences.reduce((sum, value) => sum + value, 0) / differences.length) : null, unit: "POINTS", sample: differences.length, estimate: true },
  ];
}

function assertLedgerReader(user: AuthUser) {
  if (!["PRINCIPAL", "CAMPUS_ADMIN", "ADMIN", "SUPER_ADMIN"].includes(user.role)) throw new ApiError("The Pilot Ledger is for the school's academic lead.", 403);
}

export async function pilotLedger(user: AuthUser) {
  assertLedgerReader(user);
  if (user.role !== "PRINCIPAL" && user.role !== "SUPER_ADMIN" && !(await canLeadAcademics(user).catch(() => false))) throw new ApiError("The Pilot Ledger is for the school's academic lead.", 403);
  // Snapshots and consent are school-wide. A campus appointment must not grant visibility or
  // deletion rights over another campus's evidence. Group-wide access belongs to SUPER_ADMIN.
  if (user.role !== "SUPER_ADMIN") {
    const campuses = await prisma.campus.findMany({ where: { schoolId: user.schoolId }, select: { id: true } });
    if (campuses.length !== 1 || campuses[0].id !== user.campusId) throw new ApiError("This ledger contains evidence for the whole school. In a school with multiple campuses, open it with the group administrator account.", 403);
  }
  const [setting, latest] = await Promise.all([
    prisma.pilotLedgerSetting.findUnique({ where: { schoolId: user.schoolId } }),
    prisma.pilotLedgerSnapshot.findFirst({ where: { schoolId: user.schoolId }, orderBy: { computedAt: "desc" } }),
  ]);
  return { optedIn: Boolean(setting?.optedIn), windowDays: LEDGER_WINDOW_DAYS, snapshot: setting?.optedIn && latest ? { computedAt: latest.computedAt, metrics: latest.metrics as unknown as LedgerMetric[] } : null };
}

const actionSchema = z.strictObject({ action: z.enum(["opt-in", "opt-out", "compute"]) });

export async function updatePilotLedger(user: AuthUser, raw: unknown) {
  const { action } = actionSchema.parse(raw);
  await pilotLedger(user);
  if (action !== "compute") {
    await prisma.$transaction(async tx => {
      // The setting row is also locked by computation, so opt-out cannot race a late snapshot insert.
      await tx.pilotLedgerSetting.upsert({ where: { schoolId: user.schoolId }, update: { optedIn: action === "opt-in", changedById: user.userId, changedAt: new Date() }, create: { schoolId: user.schoolId, optedIn: action === "opt-in", changedById: user.userId } });
      if (action === "opt-out") await tx.pilotLedgerSnapshot.deleteMany({ where: { schoolId: user.schoolId } });
      await tx.auditLog.create({ data: { schoolId: user.schoolId, tableName: "pilot_ledger_settings", recordId: user.schoolId, userId: user.userId, newValue: { action } } });
    }, { timeout: 60_000 });
  } else await snapshotSchool(user.schoolId);
  return pilotLedger(user);
}

/** Compute and keep one snapshot for an opted-in school (the nightly job and "compute now"). */
export async function snapshotSchool(schoolId: string, now = new Date()) {
  return runWithTenantContext({ schoolId }, async () => {
    return prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT school_id FROM pilot_ledger_settings WHERE school_id = ${schoolId} FOR UPDATE`;
      const setting = await tx.pilotLedgerSetting.findUnique({ where: { schoolId } });
      if (!setting?.optedIn) throw new ApiError("Opt in to the Pilot Ledger before anything is computed.", 409);
      const metrics = await computeLedgerMetrics(tx, schoolId, now);
      return tx.pilotLedgerSnapshot.create({ data: { schoolId, computedAt: now, metrics: metrics as never } });
    }, { timeout: 60_000 });
  });
}
