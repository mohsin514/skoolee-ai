import { createHash } from "node:crypto";
import type { PaperData } from "./assessment";
import type { ExamReview } from "./exam";
import type { ItemAnalysis } from "./recovery";

/**
 * SKO-507 Exam Twin (phase 1, deterministic): before a class sits a paper, the expected share of marks on
 * each item from this class's own released evidence on the same item (same item group, or the same prompt,
 * type and options). An estimate, labelled as one; NOT_MEASURED below the minimum sample. Phase 2 sets the
 * estimate beside what the class then scored.
 *
 * Item Watch: after release, items whose evidence questions the item itself — negative or low
 * discrimination (top 27% against bottom 27% of the class by total), or a wrong option the top quarter
 * preferred — each with the remedy to preview. Never a statement about learners.
 */
import { TWIN_MIN_SAMPLE, WATCH_MIN_SAMPLE } from "./exam-twin-constants";
export { TWIN_MIN_SAMPLE, WATCH_MIN_SAMPLE };
type Rows = ReadonlyArray<{ review: Pick<ExamReview, "marks">; responses: Record<string, string> }>;
type Question = PaperData["questions"][number];

// A missing mark is not a zero. Corrupt/imported marks must never turn an estimate into NaN,
// Infinity, or a percentage outside the paper's scale.
function observedScore(question: Question, row: Rows[number]) {
  if (!row.responses[question.id]?.trim() || !Number.isFinite(question.marks) || question.marks <= 0) return null;
  const mark = row.review.marks.find(entry => entry.questionId === question.id)?.marks;
  return typeof mark === "number" && Number.isFinite(mark) && mark >= 0 && mark <= question.marks ? mark / question.marks : null;
}

export function itemKey(paper: PaperData, question: Question) {
  const group = paper.itemGroupIds?.[question.id];
  if (group) return `group:${group}`;
  const normal = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
  return `content:${createHash("sha256").update(JSON.stringify([question.type, normal(question.prompt), question.options.map(option => normal(option.text))])).digest("hex").slice(0, 24)}`;
}

export interface TwinItem { questionId: string; number: number; facility: number | null; sample: number; sittings: number; reading: "ESTIMATE" | "NOT_MEASURED" }

export function twinForecast(target: PaperData, evidence: ReadonlyArray<{ paper: PaperData; rows: Rows }>): TwinItem[] {
  const pool = new Map<string, { scores: number[]; sittings: number }>();
  for (const sitting of evidence) for (const question of sitting.paper.questions) {
    const key = itemKey(sitting.paper, question), entry = pool.get(key) ?? { scores: [], sittings: 0 };
    let used = false;
    for (const row of sitting.rows) {
      // Only answered work is evidence of how hard the item is; a blank is not.
      const score = observedScore(question, row);
      if (score === null) continue;
      entry.scores.push(score);
      used = true;
    }
    if (used) entry.sittings++;
    pool.set(key, entry);
  }
  return target.questions.map((question, index) => {
    const entry = pool.get(itemKey(target, question)), sample = entry?.scores.length ?? 0;
    const measured = sample >= TWIN_MIN_SAMPLE;
    return { questionId: question.id, number: index + 1, sample, sittings: entry?.sittings ?? 0, reading: measured ? "ESTIMATE" : "NOT_MEASURED", facility: measured ? Math.round(entry!.scores.reduce((sum, value) => sum + value, 0) / sample * 1000) / 10 : null };
  });
}

/** Phase 2: "Twin said / class scored", item by item, with the difference only where both exist. */
export function twinVersusClass(forecast: readonly TwinItem[], actual: readonly ItemAnalysis[]) {
  return forecast.map(item => {
    const result = actual.find(row => row.questionId === item.questionId);
    const actualSample = result?.answered ?? 0;
    const scored = actualSample >= TWIN_MIN_SAMPLE ? result?.percentage ?? null : null;
    return { questionId: item.questionId, number: item.number, twin: item.facility, sample: item.sample, actualSample, scored, difference: item.facility !== null && scored !== null ? Math.round((scored - item.facility) * 10) / 10 : null };
  });
}

export type WatchFlag = "NEGATIVE_DISCRIMINATION" | "LOW_DISCRIMINATION" | "TOP_QUARTILE_DISTRACTOR";
export interface WatchItem { questionId: string; number: number; sample: number; reading: "MEASURED" | "NOT_MEASURED"; discrimination: number | null; flags: WatchFlag[]; preferredOption: string | null; remedy: "ITEM_NEUTRALIZATION" | "KEY_CORRECTION" | null }

export function itemWatch(paper: PaperData, rows: Rows): WatchItem[] {
  return paper.questions.map((question, index): WatchItem => {
    const totals = rows.flatMap(row => {
      const score = observedScore(question, row);
      if (score === null) return [];
      const total = row.review.marks.reduce((sum, mark) => sum + (Number.isFinite(mark.marks) ? mark.marks : 0), 0);
      return [{ row, total, score }];
    }).sort((a, b) => b.total - a.total);
    const sample = totals.length;
    const unmeasured: WatchItem = { questionId: question.id, number: index + 1, sample, reading: "NOT_MEASURED", discrimination: null, flags: [], preferredOption: null, remedy: null };
    if (sample < WATCH_MIN_SAMPLE) return unmeasured;
    const band = Math.ceil(sample * 0.27), quarter = Math.ceil(sample * 0.25);
    if (totals[0].total === totals[sample - 1].total) return unmeasured;
    // Give each member of a boundary tie the same fractional weight. Otherwise database order
    // can decide which item is flagged. A completely tied cohort has no ranking to compare.
    const facility = (upper: boolean) => {
      const boundary = totals[upper ? band - 1 : sample - band].total;
      const beyond = totals.filter(entry => upper ? entry.total > boundary : entry.total < boundary);
      const tied = totals.filter(entry => entry.total === boundary);
      const weight = (band - beyond.length) / tied.length;
      return (beyond.reduce((sum, entry) => sum + entry.score, 0) + tied.reduce((sum, entry) => sum + entry.score * weight, 0)) / band;
    };
    const top = totals.filter(entry => entry.total >= totals[quarter - 1].total);
    const discrimination = Math.round((facility(true) - facility(false)) * 100) / 100;
    const flags: WatchFlag[] = [];
    if (discrimination < 0) flags.push("NEGATIVE_DISCRIMINATION");
    else if (discrimination < 0.2) flags.push("LOW_DISCRIMINATION");
    let preferredOption: string | null = null;
    if (question.options.length) {
      const keys = new Set([question.correctOptionId, ...(question.correctOptionIds ?? [])].filter(Boolean));
      const counts = new Map<string, number>();
      for (const entry of top) {
        const answer = entry.row.responses[question.id]?.trim();
        let selected: unknown = [answer];
        if (question.type === "MULTIPLE_CHOICE") {
          try { selected = JSON.parse(answer); } catch { selected = []; }
        }
        if (!Array.isArray(selected)) continue;
        for (const choice of new Set(selected)) {
          if (typeof choice === "string" && question.options.some(option => option.id === choice)) counts.set(choice, (counts.get(choice) ?? 0) + 1);
        }
      }
      const [choice, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
      const runnerUp = [...counts.entries()].filter(([option]) => option !== choice).reduce((best, [, votes]) => Math.max(best, votes), 0);
      if (keys.size && choice && count && count >= 2 && count > runnerUp && !keys.has(choice)) { flags.push("TOP_QUARTILE_DISTRACTOR"); preferredOption = question.options.find(option => option.id === choice)!.text; }
    }
    const remedy = flags.includes("TOP_QUARTILE_DISTRACTOR") ? "KEY_CORRECTION" : flags.includes("NEGATIVE_DISCRIMINATION") ? "ITEM_NEUTRALIZATION" : null;
    return { questionId: question.id, number: index + 1, sample, reading: "MEASURED", discrimination, flags, preferredOption, remedy };
  });
}
