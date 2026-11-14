import type { RequestFailure } from "@/lib/http/request-state";
import type { SlotView } from "@/lib/school-ai/paper-slot-service";

/** SKAI-1456: statuses that put a paper in the moderator's queue. */
export const QUEUE_STATUSES = ["READY_FOR_REVIEW", "NEEDS_CORRECTION", "MODERATED", "SEALED", "CHANGED_AFTER_APPROVAL"] as const;

/** The papers this viewer moderates, from the mine endpoint payload. */
export function moderatorQueue(payload: { viewerId: string; slots: SlotView[] }): SlotView[] {
  return payload.slots.filter(slot => slot.moderatorUserId === payload.viewerId && (QUEUE_STATUSES as readonly string[]).includes(slot.status));
}

/**
 * What the queue shows. A failed read is never an empty queue; a refresh that fails keeps the last loaded papers;
 * a denied role sees nothing; only a successful empty list is hidden.
 */
export type QueueView = "denied" | "loading" | "failed" | "hidden" | "list";

export function queueView({ slots, failure }: { slots: SlotView[] | null; failure: RequestFailure | null }): QueueView {
  if (failure?.kind === "denied") return "denied";
  if (slots === null) return failure ? "failed" : "loading";
  if (!slots.length && !failure) return "hidden";
  return "list";
}
