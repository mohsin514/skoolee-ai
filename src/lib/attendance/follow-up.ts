/**
 * SKAI-823: the absence follow-up queue. Every unexplained absence is put in one of three lanes so staff
 * chase the right problem: no alert went out, every alert failed to deliver, or the family was reached
 * but has not replied yet.
 */
export type FollowUpLane = "NOT_SENT" | "DELIVERY_FAILED" | "AWAITING_RESPONSE";

export interface FollowUpAlert { status: string; channel: string; failedReason: string | null }

export function followUpLane(alerts: readonly FollowUpAlert[]): FollowUpLane {
  if (!alerts.length) return "NOT_SENT";
  return alerts.every(alert => alert.status === "FAILED") ? "DELIVERY_FAILED" : "AWAITING_RESPONSE";
}

/** The attendance alert idempotency keys (see absenceAlertKey) all carry `:<studentId>:<yyyy-mm-dd>`. */
export function alertKeyFragment(studentId: string, date: Date) {
  return `:${studentId}:${date.toISOString().slice(0, 10)}:`;
}
