/**
 * SKO-500 (SKO-408 slice 1): the one next step Exam Studio shows each person.
 *
 * Pure and ordered, so a wrong "next step" is a test failure, never a guess. The order is published
 * in copy as the rule the card follows:
 *
 *   1. something failed or blocks (an unsaved change, a blocking rehearsal);
 *   2. something is owed by a date (a paper slot past or near its deadline);
 *   3. a person must read something (moderation, an approval waiting on this person, items to review);
 *   4. a sitting is open now;
 *   5. a released result has no next lesson yet;
 *   6. nothing exists yet: add the syllabus; otherwise start a quiz.
 *
 * The function returns a kind and the record it points at; the card turns that into words and a link.
 */
import type { PaperSlotStatus } from "./paper-slot-status";
import { OWED_SLOT_STATUSES } from "./paper-slot-status";

export type NextStepKind =
  | "SAVE_FAILED" | "REHEARSAL_BLOCKING" | "SLOT_OVERDUE" | "SLOT_DUE" | "MODERATE" | "APPROVE"
  | "REVIEW_ITEMS" | "OPEN_SITTING" | "NEXT_LESSON" | "ADD_SYLLABUS" | "CREATE_QUIZ";

export interface NextStepInput {
  today: string;
  saveFailed: boolean;
  blockingRehearsals: ReadonlyArray<{ paperId: string; title: string }>;
  /** Slots this person authors. */
  mySlots: ReadonlyArray<{ id: string; title: string; status: PaperSlotStatus; dueOn: string }>;
  /** Slots waiting for this person's moderation. */
  toModerate: ReadonlyArray<{ id: string; title: string; dueOn: string }>;
  /** Records waiting for this person's approval. */
  toApprove: ReadonlyArray<{ id: string; kind: "SOURCE" | "CURRICULUM" | "PAPER" | "PRACTICE"; title: string }>;
  /** Papers this person authors with items still in DRAFT or NEEDS_CORRECTION. */
  itemsToReview: ReadonlyArray<{ paperId: string; title: string; count: number }>;
  openSittings: ReadonlyArray<{ id: string; title: string }>;
  releasedWithoutNextLesson: ReadonlyArray<{ id: string; title: string }>;
  hasApprovedCurriculum: boolean;
}

export interface NextStep { kind: NextStepKind; targetId: string | null; title: string | null; dueOn?: string; count?: number; recordKind?: "SOURCE" | "CURRICULUM" | "PAPER" | "PRACTICE" }

const byDue = <T extends { dueOn: string }>(rows: readonly T[]) => [...rows].sort((a, b) => a.dueOn.localeCompare(b.dueOn));

/** Days until a deadline, by calendar date; negative when past. */
export function daysUntil(today: string, dueOn: string): number {
  return Math.round((Date.parse(`${dueOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

export function nextStudioStep(input: NextStepInput): NextStep {
  if (input.saveFailed) return { kind: "SAVE_FAILED", targetId: null, title: null };
  const blocking = input.blockingRehearsals[0];
  if (blocking) return { kind: "REHEARSAL_BLOCKING", targetId: blocking.paperId, title: blocking.title };
  const owed = byDue(input.mySlots.filter(slot => OWED_SLOT_STATUSES.includes(slot.status)));
  const overdue = owed.find(slot => slot.dueOn < input.today);
  if (overdue) return { kind: "SLOT_OVERDUE", targetId: overdue.id, title: overdue.title, dueOn: overdue.dueOn };
  if (owed[0]) return { kind: "SLOT_DUE", targetId: owed[0].id, title: owed[0].title, dueOn: owed[0].dueOn };
  const moderate = byDue(input.toModerate)[0];
  if (moderate) return { kind: "MODERATE", targetId: moderate.id, title: moderate.title, dueOn: moderate.dueOn };
  const approve = input.toApprove[0];
  if (approve) return { kind: "APPROVE", targetId: approve.id, title: approve.title, count: input.toApprove.length, recordKind: approve.kind };
  const review = input.itemsToReview[0];
  if (review) return { kind: "REVIEW_ITEMS", targetId: review.paperId, title: review.title, count: review.count };
  const open = input.openSittings[0];
  if (open) return { kind: "OPEN_SITTING", targetId: open.id, title: open.title };
  const lesson = input.releasedWithoutNextLesson[0];
  if (lesson) return { kind: "NEXT_LESSON", targetId: lesson.id, title: lesson.title };
  if (!input.hasApprovedCurriculum) return { kind: "ADD_SYLLABUS", targetId: null, title: null };
  return { kind: "CREATE_QUIZ", targetId: null, title: null };
}

/** Where each kind opens inside Exam Studio (rail hash), or the marking desk for a sitting. */
export function nextStepHref(step: NextStep): string {
  switch (step.kind) {
    case "SAVE_FAILED": return "/ai/studio";
    case "REHEARSAL_BLOCKING": return "/ai/studio#space=rehearsal";
    case "SLOT_OVERDUE": case "SLOT_DUE": return `/ai/studio#space=brief&slot=${encodeURIComponent(step.targetId ?? "")}`;
    case "MODERATE": case "REVIEW_ITEMS": return "/ai/studio#space=review";
    case "APPROVE": return step.recordKind === "PAPER" ? "/ai/studio#space=review" : "/ai/studio#space=brief";
    case "OPEN_SITTING": return "/ai/studio#space=control-room";
    case "NEXT_LESSON": return "/ai/studio#space=improve";
    case "ADD_SYLLABUS": case "CREATE_QUIZ": return "/ai/studio#space=brief";
  }
}
