// SKAI-160 setup progress metrics. Pure: the readiness service hands over the records it already read for this viewer,
// this turns them into totals that a person can check against those same records.
//
// Metric definitions (scope: one school, every non-archived campus; period: the moment `generatedAt` names):
// - Setup area: one per wizard area (SKAI-111). Done when its readiness task is DONE. DEFERRED ("Later") is not done
//   and is counted on its own; OPEN, IN_PROGRESS (SKAI-155) or a missing task are outstanding.
// - Follow-up: every readiness task, the setup areas included, bucketed the same way.
// - Required check: a readiness check (SKO-397) that is required for the school's adoption mode; done when it passes.
// - Overall: (setup areas done + required checks passed) ÷ (setup areas + required checks), rounded down.
// - Campus: classes and pupils on its roll (non-archived); ready with at least one class and one pupil (SKAI-154).
// Reconciliation: each bucket sums to its total, and the campus columns sum to the school-wide class and pupil counts.
// Freshness: `generatedAt` is when the records were read; a reading older than PROGRESS_STALE_MS is stale, and a
// reading whose source was capped (import batches) is partial.

import { setupAreaFromTaskKey, type SetupAreaId } from "@/lib/onboarding/setup-areas";
import { checkHref, type CheckViewer, type ReadinessCheck } from "./checks";

export const PROGRESS_STALE_MS = 15 * 60_000;
export type TaskBucket = "done" | "inProgress" | "open" | "deferred";
export type Tally = Record<TaskBucket, number> & { total: number };
type TaskLike = { key: string; status: string };

export function taskBucket(status: string | null | undefined): TaskBucket {
  return status === "DONE" ? "done" : status === "DEFERRED" ? "deferred" : status === "IN_PROGRESS" ? "inProgress" : "open";
}
const emptyTally = (): Tally => ({ done: 0, inProgress: 0, open: 0, deferred: 0, total: 0 });
function tally(buckets: TaskBucket[]): Tally {
  const out = emptyTally();
  for (const bucket of buckets) { out[bucket] += 1; out.total += 1; }
  return out;
}

export interface ProgressInput {
  tasks: TaskLike[];
  /** Setup areas with where this viewer opens each (setupAreaHref); omitted for viewers who are not leads. */
  areas?: Array<{ id: SetupAreaId; href: string | null }>;
  checks?: ReadinessCheck[];
  campuses?: Array<{ id: string; name: string; classes: number; students: number; ready: boolean }>;
  /** School-wide counts the campus columns must add up to. */
  school?: { classes: number; students: number };
  viewer: CheckViewer;
  generatedAt: Date;
  /** Sources that were read only in part (a capped query), so the totals may undercount. */
  partial?: string[];
}

export function buildSetupProgress(input: ProgressInput) {
  const areaTasks = new Map<SetupAreaId, TaskLike>();
  for (const task of input.tasks) { const id = setupAreaFromTaskKey(task.key); if (id) areaTasks.set(id, task); }
  const areas = (input.areas ?? []).map(area => ({ id: area.id, bucket: taskBucket(areaTasks.get(area.id)?.status), href: area.href }));
  const areaTally = tally(areas.map(area => area.bucket));
  const followUps = tally(input.tasks.map(task => taskBucket(task.status)));
  const required = (input.checks ?? []).filter(check => check.required);
  const checks = { passed: required.filter(check => check.passed).length, total: required.length };
  const denominator = areaTally.total + checks.total;
  const percent = denominator ? Math.floor(((areaTally.done + checks.passed) * 100) / denominator) : 0;

  // Drill-through: the console this viewer may open for the records behind a campus count (never a forbidden one).
  const classesHref = checkHref("campusCoverage", input.viewer).href, pupilsHref = checkHref("roster", input.viewer).href;
  const campuses = (input.campuses ?? []).map(campus => ({ ...campus, classesHref, pupilsHref }));
  const campusTotals = { total: campuses.length, ready: campuses.filter(c => c.ready).length, classes: sum(campuses.map(c => c.classes)), students: sum(campuses.map(c => c.students)) };

  const reconciliation = {
    areas: bucketsAddUp(areaTally) && areaTally.total === areas.length,
    followUps: bucketsAddUp(followUps) && followUps.total === input.tasks.length,
    campuses: !input.school || (campusTotals.classes === input.school.classes && campusTotals.students === input.school.students),
  };
  return {
    generatedAt: input.generatedAt.toISOString(),
    staleAfterMs: PROGRESS_STALE_MS,
    partial: input.partial ?? [],
    percent,
    areas, areaTally, followUps, checks,
    campuses, campusTotals, school: input.school ?? null,
    reconciled: reconciliation.areas && reconciliation.followUps && reconciliation.campuses,
    reconciliation,
  };
}

export type SetupProgress = ReturnType<typeof buildSetupProgress>;
export type Freshness = "fresh" | "partial" | "stale";
/** Stale wins over partial: an old reading should be refreshed before anyone acts on it. */
export function progressFreshness(progress: Pick<SetupProgress, "generatedAt" | "staleAfterMs" | "partial">, now = Date.now()): Freshness {
  if (now - new Date(progress.generatedAt).getTime() > progress.staleAfterMs) return "stale";
  return progress.partial.length ? "partial" : "fresh";
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const bucketsAddUp = (t: Tally) => t.done + t.inProgress + t.open + t.deferred === t.total;
