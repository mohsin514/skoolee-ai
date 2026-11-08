import { createHash } from "node:crypto";

/**
 * SKO-430 pilot findings. Pure: the service loads rows, this computes what may be said about them.
 *
 * Honesty rules enforced here rather than by convention:
 * - Every figure carries its denominator, its exclusions and its missing cases; a percentage is
 *   produced only from enough paired, comparable observations, otherwise it is null with a reason.
 * - Task time is active time plus review/correction time. Elapsed (wall) time is reported beside it
 *   and never substituted for it.
 * - Synthetic records are never counted, and are reported as excluded.
 * - Scan extraction accuracy and final approved accuracy are separate findings.
 * - A measure's state (measured, self-reported, target, verbal intent, unknown) travels with it;
 *   only MEASURED values can support an external claim. Unknown is null, never zero.
 */

export const PHASES = ["BASELINE", "FOLLOW_UP"] as const;
export const OBSERVATION_SOURCES = ["OBSERVED", "TELEMETRY", "SELF_REPORTED"] as const;
export const MEASURE_KINDS = ["CORRECTNESS_EXTRACTION", "CORRECTNESS_FINAL", "WEEKLY_ACTIVE", "SUPPORT_MINUTES", "SERVING_COST", "AI_CREDITS", "SATISFACTION", "PAID_CONVERSION", "RENEWAL"] as const;
export const MEASURE_STATES = ["MEASURED", "SELF_REPORTED", "TARGET", "VERBAL_INTENT", "UNKNOWN"] as const;
export const PERMISSIONS = ["NONE", "AGGREGATE", "NAMED"] as const;
export type MeasureKind = (typeof MEASURE_KINDS)[number];
export type MeasureState = (typeof MEASURE_STATES)[number];

/** Fewer paired observations than this give counts and medians, but no percentage. */
export const MIN_PAIRS_FOR_PERCENT = 5;

export type ObservationRow = {
  id: string; workflow: string; phase: string; participant: string; task: string; difficulty: string;
  activeSeconds: number | null; elapsedSeconds: number | null; correctionSeconds: number | null;
  completed: boolean; assisted: boolean; source: string; synthetic: boolean; excludedReason: string | null; observedOn: Date | string;
};
export type MeasureRow = {
  id: string; kind: string; workflow: string | null; periodStart: Date | string; periodEnd: Date | string;
  value: number | null; denominator: number | null; unit: string; state: string; method: string; reference: string | null;
  synthetic: boolean; supersededAt: Date | string | null;
};

const day = (value: Date | string) => (typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10));
function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
const taskTime = (row: ObservationRow) => (row.activeSeconds == null || row.correctionSeconds == null ? null : row.activeSeconds + row.correctionSeconds);

export type TimeFinding = {
  key: string; workflow: string; method: string;
  counts: { baseline: number; followUp: number; paired: number };
  excluded: { id: string; reason: string }[];
  missing: { baselineOnly: number; followUpOnly: number; noTaskTime: number; incomplete: number; difficultyChanged: number };
  selfReported: number; assisted: number;
  medianTaskSeconds: { baseline: number | null; followUp: number | null };
  medianChangeSeconds: number | null;
  changePercent: number | null;
  percentWithheld: string | null;
  medianElapsedSeconds: { baseline: number | null; followUp: number | null };
  latestObservation: string | null;
};

/**
 * Pairs each participant's baseline and follow-up attempt at the same task and difficulty. Only
 * completed, non-synthetic, non-excluded attempts with both active and correction time pair.
 */
export function timeFinding(workflow: string, rows: ObservationRow[]): TimeFinding {
  const scoped = rows.filter((row) => row.workflow === workflow);
  const excluded: TimeFinding["excluded"] = [];
  const usable: ObservationRow[] = [];
  for (const row of scoped) {
    if (row.synthetic) excluded.push({ id: row.id, reason: "Synthetic record" });
    else if (row.excludedReason) excluded.push({ id: row.id, reason: row.excludedReason });
    else usable.push(row);
  }
  const missing = { baselineOnly: 0, followUpOnly: 0, noTaskTime: 0, incomplete: 0, difficultyChanged: 0 };
  const byKey = new Map<string, { baseline?: ObservationRow; followUp?: ObservationRow }>();
  for (const row of usable) {
    if (!row.completed) { missing.incomplete++; continue; }
    if (taskTime(row) == null) { missing.noTaskTime++; continue; }
    const key = `${row.participant}\u0000${row.task}`;
    const slot = byKey.get(key) ?? {};
    // The most recent attempt per phase stands; an earlier duplicate is not double-counted.
    if (row.phase === "BASELINE") slot.baseline = !slot.baseline || day(row.observedOn) >= day(slot.baseline.observedOn) ? row : slot.baseline;
    else slot.followUp = !slot.followUp || day(row.observedOn) >= day(slot.followUp.observedOn) ? row : slot.followUp;
    byKey.set(key, slot);
  }
  const pairs: { baseline: ObservationRow; followUp: ObservationRow }[] = [];
  for (const slot of byKey.values()) {
    if (slot.baseline && slot.followUp) {
      if (slot.baseline.difficulty !== slot.followUp.difficulty) missing.difficultyChanged++;
      else pairs.push({ baseline: slot.baseline, followUp: slot.followUp });
    } else if (slot.baseline) missing.baselineOnly++;
    else if (slot.followUp) missing.followUpOnly++;
  }
  const baseTimes = pairs.map((p) => taskTime(p.baseline)!), followTimes = pairs.map((p) => taskTime(p.followUp)!);
  const medianBase = median(baseTimes), medianFollow = median(followTimes);
  const medianChange = median(pairs.map((p) => taskTime(p.followUp)! - taskTime(p.baseline)!));
  let changePercent: number | null = null, percentWithheld: string | null = null;
  if (pairs.length < MIN_PAIRS_FOR_PERCENT) percentWithheld = `Too few paired observations for a percentage (${pairs.length} of ${MIN_PAIRS_FOR_PERCENT} needed).`;
  else if (!medianBase) percentWithheld = "The baseline median is zero, so no percentage can be computed.";
  else changePercent = Math.round(((medianFollow! - medianBase) / medianBase) * 1000) / 10;
  const elapsed = (phase: string) => median(pairs.map((p) => (phase === "BASELINE" ? p.baseline : p.followUp).elapsedSeconds).filter((v): v is number => v != null));
  const latest = usable.map((row) => day(row.observedOn)).sort().at(-1) ?? null;
  return {
    key: `TIME:${workflow}`, workflow,
    method: "Median of paired task time (active + review/correction seconds), same participant, task and difficulty, baseline vs follow-up. Elapsed time is reported separately and never substituted.",
    counts: { baseline: usable.filter((r) => r.phase === "BASELINE").length, followUp: usable.filter((r) => r.phase === "FOLLOW_UP").length, paired: pairs.length },
    excluded, missing,
    selfReported: pairs.filter((p) => p.baseline.source === "SELF_REPORTED" || p.followUp.source === "SELF_REPORTED").length,
    assisted: pairs.filter((p) => p.baseline.assisted || p.followUp.assisted).length,
    medianTaskSeconds: { baseline: medianBase, followUp: medianFollow },
    medianChangeSeconds: medianChange, changePercent, percentWithheld,
    medianElapsedSeconds: { baseline: elapsed("BASELINE"), followUp: elapsed("FOLLOW_UP") },
    latestObservation: latest,
  };
}

export type MeasureFinding = {
  key: string; kind: string; workflow: string | null;
  current: { id: string; value: number | null; denominator: number | null; unit: string; state: string; method: string; reference: string | null; periodStart: string; periodEnd: string }[];
  excludedSynthetic: number; superseded: number;
  rate: number | null; rateWithheld: string | null;
};

/** Current (non-superseded, non-synthetic) measures of one kind; a rate only with a denominator. */
export function measureFinding(kind: string, workflow: string | null, rows: MeasureRow[]): MeasureFinding {
  const scoped = rows.filter((row) => row.kind === kind && (workflow == null || row.workflow === workflow));
  const current = scoped.filter((row) => !row.synthetic && !row.supersededAt)
    .sort((a, b) => day(a.periodStart).localeCompare(day(b.periodStart)) || a.id.localeCompare(b.id))
    .map((row) => ({ id: row.id, value: row.state === "UNKNOWN" ? null : row.value, denominator: row.denominator, unit: row.unit, state: row.state, method: row.method, reference: row.reference, periodStart: day(row.periodStart), periodEnd: day(row.periodEnd) }));
  const measured = current.filter((row) => row.state === "MEASURED" && row.value != null);
  const value = measured.reduce((sum, row) => sum + row.value!, 0), denominator = measured.reduce((sum, row) => sum + (row.denominator ?? 0), 0);
  let rate: number | null = null, rateWithheld: string | null = null;
  if (!measured.length) rateWithheld = "No measured value yet.";
  else if (measured.some((row) => row.denominator == null) || denominator <= 0) rateWithheld = "No valid denominator, so no percentage is shown.";
  else rate = Math.round((value / denominator) * 1000) / 10;
  return {
    key: workflow ? `${kind}:${workflow}` : kind, kind, workflow, current,
    excludedSynthetic: scoped.filter((row) => row.synthetic).length,
    superseded: scoped.filter((row) => !row.synthetic && row.supersededAt).length,
    rate, rateWithheld,
  };
}

export type Finding = TimeFinding | MeasureFinding;

/** Resolves a claim's finding key (`TIME:<workflow>`, `<KIND>:<workflow>` or `<KIND>`). */
export function findingFor(key: string, observations: ObservationRow[], measures: MeasureRow[]): Finding | null {
  const [head, ...rest] = key.split(":"), workflow = rest.join(":") || null;
  if (head === "TIME") return workflow ? timeFinding(workflow, observations) : null;
  if ((MEASURE_KINDS as readonly string[]).includes(head)) return measureFinding(head, workflow, measures);
  return null;
}

/** Whether a finding can carry an external statement at all, and if not, why. */
export function claimSupport(finding: Finding | null): { supported: boolean; reason: string | null } {
  if (!finding) return { supported: false, reason: "The cited finding does not exist." };
  if ("counts" in finding) {
    if (finding.counts.paired === 0) return { supported: false, reason: "No paired baseline and follow-up observations." };
    if (finding.changePercent == null) return { supported: false, reason: finding.percentWithheld };
    return { supported: true, reason: null };
  }
  if (!finding.current.some((row) => row.state === "MEASURED" && row.value != null)) return { supported: false, reason: "Only targets, self-reports, intent or unknown values are recorded; none is a measured result." };
  if (["PAID_CONVERSION", "RENEWAL"].includes(finding.kind) && finding.current.some((row) => row.state === "MEASURED" && !row.reference)) return { supported: false, reason: "Commercial outcomes need source evidence (an invoice or signed order reference)." };
  return { supported: true, reason: null };
}

/** Stable fingerprint of what a claim rests on, so a corrected source makes an approval stale. */
export function findingHash(finding: Finding | null): string {
  const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable)
    : value && typeof value === "object" ? Object.fromEntries(Object.keys(value as object).sort().map((k) => [k, stable((value as Record<string, unknown>)[k])])) : value;
  return createHash("sha256").update(JSON.stringify(stable(finding))).digest("hex");
}

/** Human-readable limits carried with every exported statement. */
export function limitations(finding: Finding): string[] {
  const out: string[] = [];
  if ("counts" in finding) {
    out.push(`${finding.counts.paired} paired observations; ${finding.missing.baselineOnly} baseline-only, ${finding.missing.followUpOnly} follow-up-only, ${finding.missing.incomplete} incomplete, ${finding.missing.noTaskTime} without task time, ${finding.missing.difficultyChanged} with changed difficulty.`);
    if (finding.excluded.length) out.push(`${finding.excluded.length} observations excluded (${[...new Set(finding.excluded.map((e) => e.reason))].join("; ")}).`);
    if (finding.selfReported) out.push(`${finding.selfReported} pairs include self-reported times.`);
    if (finding.assisted) out.push(`${finding.assisted} pairs had assistance.`);
    out.push("Uncontrolled before/after comparison; it does not show that the product caused the change.");
  } else {
    const measured = finding.current.filter((row) => row.state === "MEASURED");
    out.push(`${measured.length} measured records; method: ${[...new Set(measured.map((row) => row.method))].join("; ") || "none"}.`);
    if (finding.current.length > measured.length) out.push(`${finding.current.length - measured.length} non-measured records (targets, self-reports, intent or unknown) are not counted.`);
    if (finding.superseded) out.push(`${finding.superseded} earlier values were corrected and superseded.`);
  }
  return out;
}
