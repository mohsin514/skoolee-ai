import { z } from "zod";

/**
 * SKAI-790: fresh-check follow-ups.
 *
 * RETRIEVAL means the follow-up repeats material the learner already practised;
 * TRANSFER means a fresh task the learner has not seen. A retrieval score is
 * never shown as independent transfer evidence. Outcomes are stored as JSON, so
 * rows saved before this field existed have no kind: they read as RETRIEVAL, the
 * conservative choice, rather than claiming transfer.
 *
 * A follow-up is DUE on the review date, OVERDUE once the review date has passed
 * without a review, and MISSING when a review was recorded with no follow-up
 * evidence. These stay listed so absent learners are not silently dropped.
 */
export const FollowUpKind = z.enum(["RETRIEVAL", "TRANSFER"]);
export type FollowUpKind = z.infer<typeof FollowUpKind>;
export type FollowUpGap = "DUE" | "OVERDUE" | "MISSING";

export function followUpKind(outcome: unknown): FollowUpKind | null {
  const followUp = (outcome as { followUp?: { kind?: unknown } | null } | null)?.followUp;
  if (!followUp) return null;
  const parsed = FollowUpKind.safeParse(followUp.kind);
  return parsed.success ? parsed.data : "RETRIEVAL";
}

export function followUpGap(row: { status: string; reviewDate: string | null; outcome: unknown }, today: string): FollowUpGap | null {
  const outcome = row.outcome as { followUp?: unknown } | null;
  if (outcome && row.status !== "ACTIVE") return outcome.followUp ? null : "MISSING";
  if (row.status !== "ACTIVE" || !row.reviewDate) return null;
  if (row.reviewDate < today) return "OVERDUE";
  return row.reviewDate === today ? "DUE" : null;
}
