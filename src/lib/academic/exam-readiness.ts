/**
 * SKO-506 Control tower: "are we ready for <day>?" answered from the ledger by one visible rule. A day is
 * ready when every paper sitting that day passes every check below; each failure names the paper and the
 * check, so the office knows what to do next. Open exceptions are listed beside the answer but do not
 * stop a sitting — they stop report cards (`publishExam`).
 */
export const READINESS_CHECKS = ["PUBLISHED", "SEALED", "DELIVERY", "ROOMED", "INVIGILATED", "SEATED"] as const;
export type ReadinessCheck = (typeof READINESS_CHECKS)[number];

export interface ReadinessPaperInput {
  scheduleId: string; label: string; date: string; startTime: string | null; endTime: string | null;
  /** The same row in the latest published date-sheet version, if any. */
  published: { date: string; startTime: string | null; endTime: string | null } | null;
  slot: { sealedAt: Date | null; sealHash: string | null; compromisedAt?: Date | null; cancelledAt?: Date | null; deliveryKind: string } | null;
  printed: boolean; onlineSitting: boolean;
  rooms: Array<{ invigilated: boolean }>; candidates: number; seated: number;
}
export interface ReadinessPaper { scheduleId: string; label: string; startTime: string | null; checks: Array<{ check: ReadinessCheck; ok: boolean }>; ready: boolean }

export function paperReadiness(paper: ReadinessPaperInput): ReadinessPaper {
  const online = paper.slot?.deliveryKind === "ONLINE";
  const ok: Record<ReadinessCheck, boolean> = {
    // The families' copy must say what the office plans: same day and times as the live row.
    PUBLISHED: Boolean(paper.published && paper.published.date === paper.date && paper.published.startTime === paper.startTime && paper.published.endTime === paper.endTime),
    SEALED: Boolean(paper.slot?.sealedAt && paper.slot.sealHash && !paper.slot.compromisedAt && !paper.slot.cancelledAt),
    DELIVERY: online ? paper.onlineSitting : paper.printed,
    ROOMED: paper.rooms.length > 0,
    INVIGILATED: paper.rooms.length > 0 && paper.rooms.every(room => room.invigilated),
    SEATED: paper.candidates > 0 && paper.seated >= paper.candidates,
  };
  const checks = READINESS_CHECKS.map(check => ({ check, ok: ok[check] }));
  return { scheduleId: paper.scheduleId, label: paper.label, startTime: paper.startTime, checks, ready: checks.every(row => row.ok) };
}

/** Delivery evidence must cover the current roster under the current seal, not an older print. */
export function deliveryReady(
  slot: ReadinessPaperInput["slot"], candidates: readonly string[],
  prints: ReadonlyArray<{ sealPrefix: string; candidates: number; copies: number; createdAt: Date }>,
  scripts: ReadonlyArray<{ studentId: string; sealPrefix: string }>,
  sittings: ReadonlyArray<{ contentHash: string | null; studentIds: unknown }>,
) {
  if (!slot?.sealedAt || !slot.sealHash || slot.compromisedAt || slot.cancelledAt || !candidates.length) return false;
  if (slot.deliveryKind === "ONLINE") {
    const assigned = new Set(sittings.filter(sitting => sitting.contentHash === slot.sealHash).flatMap(sitting => Array.isArray(sitting.studentIds) ? sitting.studentIds : []));
    return candidates.every(id => assigned.has(id));
  }
  const prefix = slot.sealHash.slice(0, 16);
  const printed = prints.some(run => run.sealPrefix === prefix && run.createdAt >= slot.sealedAt! && run.candidates >= candidates.length && run.copies >= candidates.length);
  const covered = new Set(scripts.filter(script => script.sealPrefix === prefix).map(script => script.studentId));
  return printed && candidates.every(id => covered.has(id));
}

/** The day the office is asking about: the requested date, else the first day from today that has papers. */
export function readinessDay(dates: readonly string[], today: string, requested?: string | null) {
  if (requested && /^\d{4}-\d{2}-\d{2}$/.test(requested)) return requested;
  return [...new Set(dates)].sort().find(date => date >= today) ?? null;
}

export function dayReadiness(papers: readonly ReadinessPaperInput[], day: string | null, openExceptions: number) {
  const rows = papers.filter(paper => paper.date === day).map(paperReadiness).sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? "") || a.label.localeCompare(b.label));
  return { day, papers: rows, ready: rows.length > 0 && rows.every(row => row.ready), blocking: rows.reduce((sum, row) => sum + row.checks.filter(check => !check.ok).length, 0), openExceptions };
}
