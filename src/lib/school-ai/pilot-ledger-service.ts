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
    db.examPaperSlot.findMany({ where: { schoolId, sealedAt: { gte: since } }, select: { requestedAt: true, sealedAt: true, dueOn: true } }),
    db.schoolAiResultCorrection.findMany({ where: { schoolId, createdAt: { gte: since } }, select: { status: true } }),
    db.familyResultNote.findMany({ where: { schoolId, createdAt: { gte: since } }, select: { status: true } }),
    db.examBriefReceipt.count({ where: { schoolId, acknowledgedAt: { gte: since } } }),
    db.schoolAiExamAssignment.findMany({ where: { schoolId, resultsReleasedAt: { gte: since } }, select: { id: true, campusId: true, classId: true, startsAt: true, resultsReleasedAt: true, paperSnapshot: true }, take: 50 }),
  ]);
  const onTime = sealed.filter(slot => slot.sealedAt! <= new Date(slot.dueOn.getTime() + 86_400_000));
  const decided = corrections.filter(row => row.status === "APPROVED" || row.status === "REJECTED");
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
    await prisma.pilotLedgerSetting.upsert({ where: { schoolId: user.schoolId }, update: { optedIn: action === "opt-in", changedById: user.userId, changedAt: new Date() }, create: { schoolId: user.schoolId, optedIn: action === "opt-in", changedById: user.userId } });
    // Opting out removes what was kept, not only what will be computed.
    if (action === "opt-out") await prisma.pilotLedgerSnapshot.deleteMany({ where: { schoolId: user.schoolId } });
    await prisma.auditLog.create({ data: { schoolId: user.schoolId, tableName: "pilot_ledger_settings", recordId: user.schoolId, userId: user.userId, newValue: { action } } });
  } else await snapshotSchool(user.schoolId);
  return pilotLedger(user);
}

/** Compute and keep one snapshot for an opted-in school (the nightly job and "compute now"). */
export async function snapshotSchool(schoolId: string, now = new Date()) {
  return runWithTenantContext({ schoolId }, async () => {
    const setting = await prisma.pilotLedgerSetting.findUnique({ where: { schoolId } });
    if (!setting?.optedIn) throw new ApiError("Opt in to the Pilot Ledger before anything is computed.", 409);
    const metrics = await prisma.$transaction(tx => computeLedgerMetrics(tx, schoolId, now), { timeout: 60_000 });
    return prisma.pilotLedgerSnapshot.create({ data: { schoolId, computedAt: now, metrics: metrics as never } });
  });
}
