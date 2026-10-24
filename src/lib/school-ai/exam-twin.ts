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
      if (!row.responses[question.id]?.trim()) continue;
      entry.scores.push((row.review.marks.find(mark => mark.questionId === question.id)?.marks ?? 0) / question.marks);
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
    const scored = actual.find(row => row.questionId === item.questionId)?.percentage ?? null;
    return { questionId: item.questionId, number: item.number, twin: item.facility, sample: item.sample, scored, difference: item.facility !== null && scored !== null ? Math.round((scored - item.facility) * 10) / 10 : null };
  });
}

export type WatchFlag = "NEGATIVE_DISCRIMINATION" | "LOW_DISCRIMINATION" | "TOP_QUARTILE_DISTRACTOR";
export interface WatchItem { questionId: string; number: number; reading: "MEASURED" | "NOT_MEASURED"; discrimination: number | null; flags: WatchFlag[]; preferredOption: string | null; remedy: "ITEM_NEUTRALIZATION" | "KEY_CORRECTION" | null }

export function itemWatch(paper: PaperData, rows: Rows): WatchItem[] {
  const totals = rows.map(row => ({ row, total: row.review.marks.reduce((sum, mark) => sum + mark.marks, 0) })).sort((a, b) => b.total - a.total);
  const band = Math.max(1, Math.ceil(totals.length * 0.27)), quarter = Math.max(1, Math.ceil(totals.length * 0.25));
  const upper = totals.slice(0, band), lower = totals.slice(-band), top = totals.slice(0, quarter);
  return paper.questions.map((question, index): WatchItem => {
    if (rows.length < WATCH_MIN_SAMPLE) return { questionId: question.id, number: index + 1, reading: "NOT_MEASURED", discrimination: null, flags: [], preferredOption: null, remedy: null };
    const facility = (group: typeof totals) => group.reduce((sum, entry) => sum + (entry.row.review.marks.find(mark => mark.questionId === question.id)?.marks ?? 0) / question.marks, 0) / group.length;
    const discrimination = Math.round((facility(upper) - facility(lower)) * 100) / 100;
    const flags: WatchFlag[] = [];
    if (discrimination < 0) flags.push("NEGATIVE_DISCRIMINATION");
    else if (discrimination < 0.2) flags.push("LOW_DISCRIMINATION");
    let preferredOption: string | null = null;
    if (question.options.length) {
      const keys = new Set([question.correctOptionId, ...(question.correctOptionIds ?? [])].filter(Boolean));
      const counts = new Map<string, number>();
      for (const entry of top) { const answer = entry.row.responses[question.id]?.trim(); if (answer) counts.set(answer, (counts.get(answer) ?? 0) + 1); }
      const [choice, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
      if (choice && count && count >= 2 && !keys.has(choice)) { flags.push("TOP_QUARTILE_DISTRACTOR"); preferredOption = question.options.find(option => option.id === choice)?.text ?? choice; }
    }
    const remedy = flags.includes("TOP_QUARTILE_DISTRACTOR") ? "KEY_CORRECTION" : flags.includes("NEGATIVE_DISCRIMINATION") ? "ITEM_NEUTRALIZATION" : null;
    return { questionId: question.id, number: index + 1, reading: "MEASURED", discrimination, flags, preferredOption, remedy };
  });
}
