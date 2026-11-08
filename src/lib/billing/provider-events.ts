import { prisma } from "@/lib/db/prisma";

/**
 * SKO-373: durable receipts for verified billing-provider events (Stripe and
 * SafePay share one table). A receipt is claimed before any effect, so a
 * replayed event is a no-op; a verified event that cannot be applied safely
 * (unknown institution, missing amount) is parked as NEEDS_REVIEW for a
 * platform operator instead of being silently marked processed.
 */

export type ReceiptState = "PROCESSING" | "PROCESSED" | "FAILED" | "NEEDS_REVIEW" | "RESOLVED";
export type ClaimResult = "claimed" | "duplicate" | "in_progress";

/** Thrown inside a handler when the event is genuine but must not be applied automatically. */
export class NeedsReview extends Error {
  constructor(message: string, readonly schoolId?: string | null) { super(message); }
}

const STALE_MS = 2 * 60 * 1000;

export async function claimProviderEvent(input: { provider: "STRIPE" | "SAFEPAY"; eventId: string; eventType: string; eventCreated: number }): Promise<ClaimResult> {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - STALE_MS);
  const existing = await prisma.stripeWebhookReceipt.findUnique({ where: { eventId: input.eventId } });
  // Applied, parked for review or resolved by an operator: never apply again.
  if (existing && ["PROCESSED", "NEEDS_REVIEW", "RESOLVED"].includes(existing.state)) return "duplicate";
  if (existing?.state === "PROCESSING" && existing.receivedAt > staleBefore) return "in_progress";
  if (existing) {
    const claimed = await prisma.stripeWebhookReceipt.updateMany({
      where: { eventId: input.eventId, OR: [{ state: "FAILED" }, { state: "PROCESSING", receivedAt: { lte: staleBefore } }] },
      data: { state: "PROCESSING", eventType: input.eventType, eventCreated: input.eventCreated, receivedAt: now, processedAt: null, error: null, attemptCount: { increment: 1 } },
    });
    return claimed.count === 1 ? "claimed" : "in_progress";
  }
  try {
    await prisma.stripeWebhookReceipt.create({ data: { eventId: input.eventId, eventType: input.eventType, eventCreated: input.eventCreated, provider: input.provider, state: "PROCESSING" } });
    return "claimed";
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "P2002")) throw error;
    return "in_progress";
  }
}

export async function finishProviderEvent(eventId: string, state: "PROCESSED" | "FAILED" | "NEEDS_REVIEW", detail?: { error?: unknown; schoolId?: string | null }) {
  const message = detail?.error instanceof Error ? detail.error.message : typeof detail?.error === "string" ? detail.error : state === "FAILED" ? "Unknown provider event failure" : null;
  await prisma.stripeWebhookReceipt.update({
    where: { eventId },
    data: { state, processedAt: state === "FAILED" ? null : new Date(), error: message ? message.slice(0, 4000) : null, ...(detail?.schoolId !== undefined ? { schoolId: detail.schoolId } : {}) },
  });
}

/** Platform operator queue: events that failed or need a human decision. */
export async function listProviderEventsForReview() {
  return prisma.stripeWebhookReceipt.findMany({
    where: { state: { in: ["NEEDS_REVIEW", "FAILED"] } },
    orderBy: { receivedAt: "asc" },
    take: 100,
    select: { eventId: true, provider: true, eventType: true, state: true, error: true, schoolId: true, attemptCount: true, receivedAt: true },
  });
}

/**
 * Closing a parked event records the operator's note; it never applies the
 * event. Any billing correction it implies is made through the reviewed
 * subscription request or the provider, so the audit trail stays honest.
 */
export async function resolveProviderEvent(eventId: string, reviewerId: string, note: string) {
  const clean = note.trim();
  if (clean.length < 8) throw Object.assign(new Error("Explain how this event was handled"), { status: 400 });
  return prisma.$transaction(async tx => {
    const current = await tx.stripeWebhookReceipt.findUnique({ where: { eventId } });
    const changed = await tx.stripeWebhookReceipt.updateMany({
      where: { eventId, state: { in: ["NEEDS_REVIEW", "FAILED"] } },
      data: { state: "RESOLVED", reviewNote: clean.slice(0, 2000), reviewedById: reviewerId, reviewedAt: new Date() },
    });
    if (!changed.count || !current) throw Object.assign(new Error("This event is no longer waiting for review"), { status: 409 });
    if (current.schoolId) await tx.auditLog.create({ data: { schoolId: current.schoolId, userId: reviewerId, tableName: "billing_provider_event", recordId: eventId,
      oldValue: { state: current.state, error: current.error }, newValue: { state: "RESOLVED", note: clean } } });
    return { eventId, state: "RESOLVED" as const };
  });
}
