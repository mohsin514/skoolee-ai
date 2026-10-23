/**
 * SKO-500 (SKO-408 slice 1): the Teaching Line.
 *
 * The teacher's dated "taught up to here" lives in `teaching_progress`, beside the approved
 * curriculum and never inside it, so recording coverage never clones or re-approves a curriculum.
 * Pure: rows and curricula arrive as arguments; dates are `YYYY-MM-DD` strings; no clock is read.
 *
 * Order is the curriculum's own `outcomes` order, restricted to included outcomes. "Up to" is
 * inclusive. Moving the line forward writes the outcomes not yet recorded; moving it back removes
 * the recorded outcomes after it (un-teaching is explicit and audited by the caller).
 */
import type { CurriculumData } from "./assessment";

export type CurriculumOutcome = CurriculumData["outcomes"][number];
export interface ProgressRow { outcomeId: string; taughtOn: string }

export const isoDate = /^\d{4}-\d{2}-\d{2}$/;

/** Included outcomes in teaching order. */
export function lineOrder(curriculum: Pick<CurriculumData, "outcomes">): CurriculumOutcome[] {
  return curriculum.outcomes.filter(outcome => outcome.included);
}

/** The unit an outcome belongs to: its `unit`, else its source, so older curricula still group. */
export function unitOf(outcome: CurriculumOutcome): string {
  return outcome.unit?.trim() || outcome.sourceId || "";
}

/** Outcomes that count as taught: recorded on the Teaching Line, or flagged taught in the approved curriculum. */
export function taughtOutcomeIds(curriculum: Pick<CurriculumData, "outcomes">, rows: readonly ProgressRow[]): Set<string> {
  const recorded = new Set(rows.map(row => row.outcomeId));
  return new Set(lineOrder(curriculum).filter(outcome => outcome.taught || recorded.has(outcome.id)).map(outcome => outcome.id));
}

/** Where the line sits: the furthest taught outcome in order, or null before anything is taught. */
export function linePosition(curriculum: Pick<CurriculumData, "outcomes">, rows: readonly ProgressRow[]): string | null {
  const taught = taughtOutcomeIds(curriculum, rows);
  const order = lineOrder(curriculum);
  for (let index = order.length - 1; index >= 0; index -= 1) if (taught.has(order[index].id)) return order[index].id;
  return null;
}

export interface LineMove {
  /** Outcomes to record with `taughtOn`. */
  write: string[];
  /** Recorded outcomes after the new position, to remove. */
  remove: string[];
  /** Distinct units newly written; more than one in one move is shown to the head of department. */
  unitsCrossed: number;
  flagged: boolean;
}

/**
 * Move the line to `upToOutcomeId` (inclusive), or to the very start when null.
 * Throws when the outcome is not an included outcome of this curriculum.
 */
export function moveLine(curriculum: Pick<CurriculumData, "outcomes">, rows: readonly ProgressRow[], upToOutcomeId: string | null): LineMove {
  const order = lineOrder(curriculum);
  const position = upToOutcomeId === null ? -1 : order.findIndex(outcome => outcome.id === upToOutcomeId);
  if (upToOutcomeId !== null && position < 0) throw new Error("TEACHING_LINE_UNKNOWN_OUTCOME");
  const recorded = new Set(rows.map(row => row.outcomeId));
  const write = order.slice(0, position + 1).filter(outcome => !recorded.has(outcome.id) && !outcome.taught).map(outcome => outcome.id);
  const remove = order.slice(position + 1).filter(outcome => recorded.has(outcome.id)).map(outcome => outcome.id);
  const byId = new Map(order.map(outcome => [outcome.id, outcome]));
  const unitsCrossed = new Set(write.map(id => unitOf(byId.get(id)!))).size;
  return { write, remove, unitsCrossed, flagged: unitsCrossed > 1 };
}

/** The latest date on the line, used to label the brief's coverage suggestion. */
export function lastTaughtOn(rows: readonly ProgressRow[]): string | null {
  return rows.reduce<string | null>((latest, row) => latest === null || row.taughtOn > latest ? row.taughtOn : latest, null);
}

/**
 * For a common paper across sections: outcomes every section has taught, plus, per section, what it
 * has taught that another has not (shown as a warning; the paper is bounded by the intersection).
 */
export function intersectionCoverage(perSection: ReadonlyArray<{ classId: string; taught: ReadonlySet<string> }>): { common: string[]; ahead: Array<{ classId: string; outcomeIds: string[] }> } {
  if (!perSection.length) return { common: [], ahead: [] };
  const [first, ...rest] = perSection;
  const common = [...first.taught].filter(id => rest.every(section => section.taught.has(id)));
  const commonSet = new Set(common);
  return { common, ahead: perSection.map(section => ({ classId: section.classId, outcomeIds: [...section.taught].filter(id => !commonSet.has(id)) })).filter(entry => entry.outcomeIds.length > 0) };
}

/** Outcomes a paper assesses that were taught after the sitting date, or are not taught at all. */
export function taughtAfterSitting(assessedOutcomeIds: readonly string[], curriculum: Pick<CurriculumData, "outcomes">, rows: readonly ProgressRow[], sittingDate: string): string[] {
  const taughtOn = new Map(rows.map(row => [row.outcomeId, row.taughtOn]));
  const flagged = new Set(curriculum.outcomes.filter(outcome => outcome.taught).map(outcome => outcome.id));
  return [...new Set(assessedOutcomeIds)].filter(id => {
    if (flagged.has(id) && !taughtOn.has(id)) return false;
    const date = taughtOn.get(id);
    return date === undefined || date > sittingDate;
  });
}

const normalise = (text: string) => text.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();

/**
 * Carry progress from one curriculum version (or edition) to the next: by outcome id, then by code,
 * then by exact normalised title. Unmatched outcomes are returned for the teacher to map or leave.
 */
export function carryForward(previous: Pick<CurriculumData, "outcomes">, next: Pick<CurriculumData, "outcomes">, rows: readonly ProgressRow[]): { carried: Array<ProgressRow & { fromOutcomeId: string }>; unmatched: string[] } {
  const prevById = new Map(previous.outcomes.map(outcome => [outcome.id, outcome]));
  const nextIds = new Set(next.outcomes.map(outcome => outcome.id));
  const nextByCode = new Map(next.outcomes.filter(outcome => outcome.code).map(outcome => [normalise(outcome.code!), outcome.id]));
  const nextByTitle = new Map(next.outcomes.map(outcome => [normalise(outcome.title), outcome.id]));
  const carried: Array<ProgressRow & { fromOutcomeId: string }> = [], unmatched: string[] = [];
  const used = new Set<string>();
  for (const row of rows) {
    const from = prevById.get(row.outcomeId);
    const target = nextIds.has(row.outcomeId) ? row.outcomeId
      : from?.code && nextByCode.has(normalise(from.code)) ? nextByCode.get(normalise(from.code))!
      : from && nextByTitle.has(normalise(from.title)) ? nextByTitle.get(normalise(from.title))!
      : null;
    if (!target || used.has(target)) { unmatched.push(row.outcomeId); continue; }
    used.add(target);
    carried.push({ outcomeId: target, taughtOn: row.taughtOn, fromOutcomeId: row.outcomeId });
  }
  return { carried, unmatched };
}
