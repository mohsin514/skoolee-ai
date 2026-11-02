/**
 * NFR-REL-02 (SKAI-864): one delivery state per family message, read from the send status and the
 * provider receipts, so every log tells queued, sent, delivered, failed and unknown apart.
 *
 * "Unknown" is a WhatsApp message the provider accepted but never confirmed within a day: it may or
 * may not have arrived, and the office should not read it as delivered. Email and SMS have no
 * receipts here, so an accepted message stays "sent".
 */

export type DeliveryState = "QUEUED" | "SENT" | "DELIVERED" | "FAILED" | "UNKNOWN" | "NO_RECIPIENT" | "BLOCKED";

export const RECEIPT_WAIT_MS = 24 * 60 * 60 * 1000;

export function deliveryState(
  row: { status: string; channel: string; sentAt?: Date | string | null; receiptStates?: readonly string[] },
  now: Date = new Date(),
): DeliveryState {
  const receipts = row.receiptStates ?? [];
  if (receipts.includes("failed")) return "FAILED";
  if (receipts.includes("read") || receipts.includes("delivered")) return "DELIVERED";
  if (row.status === "FAILED") return "FAILED";
  if (row.status === "NO_RECIPIENT" || row.status === "BLOCKED") return row.status;
  if (row.status !== "SENT") return "QUEUED";
  if (row.channel !== "WHATSAPP" || !row.sentAt) return "SENT";
  return now.getTime() - new Date(row.sentAt).getTime() > RECEIPT_WAIT_MS ? "UNKNOWN" : "SENT";
}
