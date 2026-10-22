/**
 * SKO-500 (SKO-408 slice 1): the status of a paper slot, derived from the records it links.
 *
 * A slot's status is never stored or typed by anyone: it is read from the paper record, its item
 * review states, the moderation decision, the seal, the print run, the sitting window, attendance,
 * marks and publication. Pure; every fact arrives as an argument, including `today`.
 *
 * The words are the Studio's status words where they mean the same thing (DRAFT, NEEDS_CORRECTION,
 * READY_FOR_REVIEW, APPROVED, CHANGED_AFTER_APPROVAL, STALE, SEALED, GATE_OPEN) plus the office's own
 * (REQUESTED, MODERATED, PRINTED, SAT, MARKED, PUBLISHED, CANCELLED). The Studio's frozen sixteen-word
 * vocabulary is not extended; the office words are a separate list with their own copy.
 */
import type { ItemReviewState } from "./item-review";

export const PAPER_SLOT_STATUSES = [
  "REQUESTED", "DRAFT", "NEEDS_CORRECTION", "READY_FOR_REVIEW", "MODERATED", "APPROVED", "CHANGED_AFTER_APPROVAL",
  "SEALED", "STALE", "PRINTED", "GATE_OPEN", "SAT", "MARKED", "PUBLISHED", "CANCELLED",
] as const;
export type PaperSlotStatus = (typeof PAPER_SLOT_STATUSES)[number];

/** The office words, which have no Studio token. */
export const OFFICE_SLOT_STATUSES = ["REQUESTED", "MODERATED", "PRINTED", "SAT", "MARKED", "PUBLISHED", "CANCELLED"] as const;
export type OfficeSlotStatus = (typeof OFFICE_SLOT_STATUSES)[number];
export const isOfficeSlotStatus = (status: PaperSlotStatus): status is OfficeSlotStatus => (OFFICE_SLOT_STATUSES as readonly string[]).includes(status);

export interface SlotFacts {
  cancelledAt: string | null;
  dueOn: string;
  /** The linked PAPER record, or null when nothing is written yet. */
  paper: { status: "DRAFT" | "IN_REVIEW" | "APPROVED" | "ARCHIVED"; version: number; itemStates: readonly ItemReviewState[] } | null;
  /** The latest moderation decision on this slot (slice 2), with the paper version it was taken on. */
  moderation: { decision: "SIGNED" | "RETURNED"; paperVersion: number } | null;
  seal: { paperVersion: number; sittingDate: string | null } | null;
  /** Every distinct sitting date of the linked date-sheet rows. */
  sittingDates: readonly string[];
  printed: boolean;
  windowOpen: boolean;
  attendanceComplete: boolean;
  marksComplete: boolean;
  published: boolean;
}

/** Pre-ready states: the paper still owes work to the office. */
export const OWED_SLOT_STATUSES: readonly PaperSlotStatus[] = ["REQUESTED", "DRAFT", "NEEDS_CORRECTION"];

export function deriveSlotStatus(facts: SlotFacts): PaperSlotStatus {
  if (facts.cancelledAt) return "CANCELLED";
  if (facts.published) return "PUBLISHED";
  if (facts.marksComplete) return "MARKED";
  if (facts.attendanceComplete) return "SAT";
  if (facts.windowOpen) return "GATE_OPEN";
  const paper = facts.paper && facts.paper.status !== "ARCHIVED" ? facts.paper : null;
  if (facts.seal) {
    if (paper && paper.version > facts.seal.paperVersion) return "CHANGED_AFTER_APPROVAL";
    if (facts.seal.sittingDate && facts.sittingDates.some(date => date !== facts.seal!.sittingDate)) return "STALE";
    return facts.printed ? "PRINTED" : "SEALED";
  }
  if (!paper) return "REQUESTED";
  if (facts.moderation) {
    if (paper.version > facts.moderation.paperVersion) return "CHANGED_AFTER_APPROVAL";
    if (facts.moderation.decision === "RETURNED") return "NEEDS_CORRECTION";
    return paper.status === "APPROVED" ? "APPROVED" : "MODERATED";
  }
  if (paper.status === "APPROVED") return "APPROVED";
  if (paper.itemStates.includes("NEEDS_CORRECTION")) return "NEEDS_CORRECTION";
  const reviewed = paper.itemStates.length > 0 && paper.itemStates.every(state => state === "READY_FOR_REVIEW" || state === "APPROVED");
  if (paper.status === "IN_REVIEW" || reviewed) return "READY_FOR_REVIEW";
  return "DRAFT";
}

/** True when the deadline has passed and the paper still owes work. */
export function slotOverdue(status: PaperSlotStatus, dueOn: string, today: string): boolean {
  return OWED_SLOT_STATUSES.includes(status) && dueOn < today;
}

export type ReadinessTick = "AUTHOR" | "MODERATOR" | "PAPER" | "ITEMS_REVIEWED" | "MODERATED" | "SEALED" | "PRINTED";

/** The ledger's readiness ticks, in the order the office reads them. PRINTED applies to paper sittings only. */
export function slotReadiness(input: { authorUserId: string | null; moderatorUserId: string | null; deliveryKind: string; facts: SlotFacts }): Array<{ tick: ReadinessTick; done: boolean }> {
  const { facts } = input;
  const items = facts.paper?.itemStates ?? [];
  const ticks: Array<{ tick: ReadinessTick; done: boolean }> = [
    { tick: "AUTHOR", done: input.authorUserId !== null },
    { tick: "MODERATOR", done: input.moderatorUserId !== null },
    { tick: "PAPER", done: facts.paper !== null && facts.paper.status !== "ARCHIVED" },
    { tick: "ITEMS_REVIEWED", done: items.length > 0 && items.every(state => state === "READY_FOR_REVIEW" || state === "APPROVED") },
    { tick: "MODERATED", done: facts.moderation?.decision === "SIGNED" && facts.paper !== null && facts.paper.version <= facts.moderation.paperVersion },
    { tick: "SEALED", done: facts.seal !== null },
  ];
  if (input.deliveryKind !== "ONLINE") ticks.push({ tick: "PRINTED", done: facts.printed });
  return ticks;
}

/**
 * The session-wide default deadline: `workingDays` working days before the first sitting, counting
 * back over the campus's weekend days (ISO weekday numbers, Monday = 1).
 */
export function workingDaysBefore(firstSitting: string, workingDays: number, weekendIsoDays: readonly number[]): string {
  const date = new Date(`${firstSitting}T00:00:00Z`);
  let remaining = workingDays;
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() - 1);
    const iso = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
    if (!weekendIsoDays.includes(iso)) remaining -= 1;
  }
  return date.toISOString().slice(0, 10);
}

/** Grouping key for one paper per grade-subject: trimmed, whitespace-collapsed, case-folded. */
export function slotKey(subjectName: string, gradeName: string): { subjectName: string; gradeName: string } {
  const fold = (text: string) => text.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
  return { subjectName: fold(subjectName), gradeName: fold(gradeName) };
}

/** The marks deadline: `workingDays` working days after the last sitting. */
export function workingDaysAfter(lastSitting: string, workingDays: number, weekendIsoDays: readonly number[]): string {
  const date = new Date(`${lastSitting}T00:00:00Z`);
  let remaining = workingDays;
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const iso = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
    if (!weekendIsoDays.includes(iso)) remaining -= 1;
  }
  return date.toISOString().slice(0, 10);
}

/** The defaults a new slot takes (plan §14.1): 15 working days before the first sitting, marks 5 after the last. */
export const PAPER_DUE_WORKING_DAYS = 15;
export const MARKS_DUE_WORKING_DAYS = 5;

/**
 * The default paper deadline: 15 working days before the first sitting, but never already past when
 * the request is made (then three working days from today), and never on or after the first sitting.
 */
export function defaultPaperDue(firstSitting: string, today: string, weekendIsoDays: readonly number[]): string {
  const planned = workingDaysBefore(firstSitting, PAPER_DUE_WORKING_DAYS, weekendIsoDays);
  if (planned >= today) return planned;
  const soonest = workingDaysAfter(today, 3, weekendIsoDays);
  const lastDay = workingDaysBefore(firstSitting, 1, weekendIsoDays);
  return soonest < lastDay ? soonest : lastDay < today ? today : lastDay;
}
